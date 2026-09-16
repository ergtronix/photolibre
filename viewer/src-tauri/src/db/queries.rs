use std::path::{Path, PathBuf};

use rusqlite::{params_from_iter, Connection, Row};

use super::models::{Album, ImportCommitSummary, NewPhoto, Photo, PhotoFilter};
use super::DbError;
use crate::import::{DedupStatus, MediaKind, PendingImportItem};

fn row_to_photo(row: &Row) -> rusqlite::Result<Photo> {
    Ok(Photo {
        id: row.get("id")?,
        filename: row.get("filename")?,
        filepath: row.get("filepath")?,
        media_type: row.get("media_type")?,
        date_taken: row.get("date_taken")?,
        date_added: row.get("date_added")?,
        latitude: row.get("latitude")?,
        longitude: row.get("longitude")?,
        favorite: row.get::<_, i64>("favorite")? != 0,
        hidden: row.get::<_, i64>("hidden")? != 0,
        title: row.get("title")?,
        description: row.get("description")?,
        width: row.get("width")?,
        height: row.get("height")?,
        source: row.get("source")?,
        album_names: None,
    })
}

/// photo_idが属するアルバム名の一覧を返す（アルバム名の昇順）。
fn album_names_for_photo(conn: &Connection, photo_id: &str) -> Result<Vec<String>, DbError> {
    let mut stmt = conn.prepare(
        "SELECT a.name FROM albums a \
         JOIN album_photos ap ON ap.album_id = a.id \
         WHERE ap.photo_id = ? \
         ORDER BY a.name ASC",
    )?;
    let rows = stmt.query_map([photo_id], |row| row.get::<_, String>(0))?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(DbError::from)
}

pub fn list_photos(conn: &Connection, filter: &PhotoFilter) -> Result<Vec<Photo>, DbError> {
    let mut sql = String::from(
        "SELECT DISTINCT p.id, p.filename, p.filepath, p.media_type, p.date_taken, \
         p.date_added, p.latitude, p.longitude, p.favorite, p.hidden, p.title, \
         p.description, p.width, p.height, p.source \
         FROM photos p",
    );
    let mut conditions: Vec<String> = Vec::new();
    let mut args: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if filter.keyword.is_some() {
        sql.push_str(
            " JOIN photo_keywords pk ON pk.photo_id = p.id \
              JOIN keywords k ON k.id = pk.keyword_id",
        );
    }

    if filter.favorite_only {
        conditions.push("p.favorite = 1".to_string());
    }
    if let Some(year) = filter.year {
        conditions.push("strftime('%Y', p.date_taken) = ?".to_string());
        args.push(Box::new(format!("{year:04}")));
    }
    if let Some(month) = filter.month {
        conditions.push("strftime('%m', p.date_taken) = ?".to_string());
        args.push(Box::new(format!("{month:02}")));
    }
    if let Some(keyword) = &filter.keyword {
        conditions.push("k.name = ?".to_string());
        args.push(Box::new(keyword.clone()));
    }

    if !conditions.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&conditions.join(" AND "));
    }
    sql.push_str(" ORDER BY p.date_taken ASC");

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(
        params_from_iter(args.iter().map(|a| a.as_ref())),
        row_to_photo,
    )?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(DbError::from)
}

pub fn list_albums(conn: &Connection) -> Result<Vec<Album>, DbError> {
    let mut stmt = conn.prepare(
        "SELECT a.id, a.name, a.album_type, a.source, COUNT(ap.photo_id) AS photo_count \
         FROM albums a \
         LEFT JOIN album_photos ap ON ap.album_id = a.id \
         GROUP BY a.id, a.name, a.album_type, a.source \
         ORDER BY a.name ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Album {
            id: row.get("id")?,
            name: row.get("name")?,
            album_type: row.get("album_type")?,
            source: row.get("source")?,
            photo_count: row.get("photo_count")?,
        })
    })?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(DbError::from)
}

pub fn list_album_photos(conn: &Connection, album_id: &str) -> Result<Vec<Photo>, DbError> {
    let mut stmt = conn.prepare(
        "SELECT p.id, p.filename, p.filepath, p.media_type, p.date_taken, p.date_added, \
         p.latitude, p.longitude, p.favorite, p.hidden, p.title, p.description, \
         p.width, p.height, p.source \
         FROM photos p \
         JOIN album_photos ap ON ap.photo_id = p.id \
         WHERE ap.album_id = ? \
         ORDER BY ap.sort_order ASC, p.date_taken ASC",
    )?;
    let rows = stmt.query_map([album_id], row_to_photo)?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(DbError::from)
}

/// ファイル名・タイトル・説明に加えて、写真が属するアルバム名（左ペインの
/// イベント名）でも検索できるようにする。デジカメ取り込みの写真はファイル名に
/// 意味のある文字列を含まないことが多く、アルバム名検索がないと実質検索できない。
pub fn search_photos(conn: &Connection, query: &str) -> Result<Vec<Photo>, DbError> {
    let pattern = format!("%{query}%");
    let mut stmt = conn.prepare(
        "SELECT DISTINCT p.id, p.filename, p.filepath, p.media_type, p.date_taken, p.date_added, \
         p.latitude, p.longitude, p.favorite, p.hidden, p.title, p.description, \
         p.width, p.height, p.source \
         FROM photos p \
         LEFT JOIN album_photos ap ON ap.photo_id = p.id \
         LEFT JOIN albums a ON a.id = ap.album_id \
         WHERE p.filename LIKE ?1 OR p.title LIKE ?1 OR p.description LIKE ?1 OR a.name LIKE ?1 \
         ORDER BY p.date_taken ASC",
    )?;
    let rows = stmt.query_map([&pattern], row_to_photo)?;
    let mut photos = rows.collect::<rusqlite::Result<Vec<_>>>()?;

    // 検索結果は件数が少ない前提のため、写真ごとに所属アルバム名を
    // 追加で取得しても一覧表示のような大量件数にはならず問題にならない。
    for photo in &mut photos {
        photo.album_names = Some(album_names_for_photo(conn, &photo.id)?);
    }

    Ok(photos)
}

/// どのアルバムにも属さない写真の一覧。「すべての写真」から未分類を探すのは
/// 人間の目視ではほぼ不可能というERGの指摘を受け、専用ビューとして追加した。
pub fn list_unfiled_photos(conn: &Connection) -> Result<Vec<Photo>, DbError> {
    let mut stmt = conn.prepare(
        "SELECT p.id, p.filename, p.filepath, p.media_type, p.date_taken, p.date_added, \
         p.latitude, p.longitude, p.favorite, p.hidden, p.title, p.description, \
         p.width, p.height, p.source \
         FROM photos p \
         LEFT JOIN album_photos ap ON ap.photo_id = p.id \
         WHERE ap.photo_id IS NULL \
         ORDER BY p.date_taken ASC",
    )?;
    let rows = stmt.query_map([], row_to_photo)?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(DbError::from)
}

/// サイドバーに件数バッジを表示するための軽量カウント（一覧本体を取得せずに済む）。
pub fn count_unfiled_photos(conn: &Connection) -> Result<i64, DbError> {
    conn.query_row(
        "SELECT COUNT(*) FROM photos p \
         LEFT JOIN album_photos ap ON ap.photo_id = p.id \
         WHERE ap.photo_id IS NULL",
        [],
        |row| row.get(0),
    )
    .map_err(DbError::from)
}

/// ビュワー上で写真を分類するために手動作成するアルバム。Source A/B由来の
/// インポート済みアルバムと区別するため source='viewer' を付与する。
pub fn create_album(conn: &Connection, name: &str) -> Result<Album, DbError> {
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO albums (id, name, album_type, source, created_at) \
         VALUES (?1, ?2, 'manual', 'viewer', ?3)",
        rusqlite::params![id, name, created_at],
    )?;
    Ok(Album {
        id,
        name: name.to_string(),
        album_type: "manual".to_string(),
        source: "viewer".to_string(),
        photo_count: 0,
    })
}

pub fn rename_album(conn: &Connection, album_id: &str, new_name: &str) -> Result<(), DbError> {
    conn.execute(
        "UPDATE albums SET name = ?1 WHERE id = ?2",
        rusqlite::params![new_name, album_id],
    )?;
    Ok(())
}

/// アルバム新規作成のUndo専用。ERGの要望により、アプリ上にアルバム削除ボタンは
/// 一切設けない（危険すぎるため）。ここは「直前に自分で作ったアルバムを取り消す」
/// 操作のみに使うため、source='viewer'（ビュワー上で作成したもの）以外は
/// 削除できないようクエリ自体で制限し、Source A/B由来のアルバムを誤って
/// 消せないようにしている。
pub fn delete_viewer_album(conn: &Connection, album_id: &str) -> Result<(), DbError> {
    conn.execute(
        "DELETE FROM album_photos \
         WHERE album_id = ?1 \
           AND EXISTS (SELECT 1 FROM albums WHERE id = ?1 AND source = 'viewer')",
        [album_id],
    )?;
    conn.execute(
        "DELETE FROM albums WHERE id = ?1 AND source = 'viewer'",
        [album_id],
    )?;
    Ok(())
}

/// 複数写真をまとめてアルバムへ追加する（複数選択してのドラッグ&ドロップ用）。
/// 既に追加済みの写真が含まれていてもエラーにしない（INSERT OR IGNORE）。
pub fn add_photos_to_album(
    conn: &Connection,
    album_id: &str,
    photo_ids: &[String],
) -> Result<(), DbError> {
    let mut stmt =
        conn.prepare("INSERT OR IGNORE INTO album_photos (album_id, photo_id) VALUES (?1, ?2)")?;
    for photo_id in photo_ids {
        stmt.execute(rusqlite::params![album_id, photo_id])?;
    }
    Ok(())
}

pub fn remove_photo_from_album(
    conn: &Connection,
    album_id: &str,
    photo_id: &str,
) -> Result<(), DbError> {
    conn.execute(
        "DELETE FROM album_photos WHERE album_id = ?1 AND photo_id = ?2",
        rusqlite::params![album_id, photo_id],
    )?;
    Ok(())
}

/// 写真をすべてのアルバムから外し、未分類に戻す。入れ替え作業のため
/// 一時的に未分類へ移動したいというERGの要望により追加。Undoで元に戻せる
/// よう、外す前に属していたアルバムIDの一覧を返す。
pub fn unfile_photo(conn: &Connection, photo_id: &str) -> Result<Vec<String>, DbError> {
    let mut stmt = conn.prepare("SELECT album_id FROM album_photos WHERE photo_id = ?1")?;
    let album_ids = stmt
        .query_map([photo_id], |row| row.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    conn.execute("DELETE FROM album_photos WHERE photo_id = ?1", [photo_id])?;

    Ok(album_ids)
}

// ---------------------------------------------------------------------------
// ローカルフォルダ取り込み（TASK-053/TASK-381）用の書き込み関数群。
// `photos.source`には既存の'source_a'/'source_b'（初回移行専用）・'viewer'
// （ビュワー上の手動アルバム作成専用）とは別枠の新しい値'local_import'を使う。
// ---------------------------------------------------------------------------

/// ローカルフォルダ取り込みで確定した写真をarchive.dbへバルクinsertする。
/// `photos.source`には新しい値`'local_import'`を使う
/// （'source_a'/'source_b'は初回移行専用、'viewer'はビュワー上の手動アルバム
/// 作成専用であり、それらとは意図的に別枠にしている）。
/// 数百件規模になり得るため、1件ずつcommitせず`conn.transaction()`で
/// 1トランザクションにまとめる。`id`はこの関数がUUIDv4で生成し、
/// 渡した`photos`と同じ順序で返す（呼び出し側が`list_photos_by_ids`等で
/// そのまま使えるように）。
// C-3（TASK-382）でcommands.rsから呼ばれるまで本番コードから未使用のため、
// 一時的にdead_code警告を抑制する（テストでは既に呼び出している）。
#[allow(dead_code)]
pub fn insert_local_import_photos(
    conn: &mut Connection,
    photos: &[NewPhoto],
) -> Result<Vec<String>, DbError> {
    let tx = conn.transaction()?;
    // バッチ全体で同じタイムスタンプを使う（1回の取り込み操作として扱う）。
    let imported_at = chrono::Utc::now().to_rfc3339();
    let mut ids = Vec::with_capacity(photos.len());

    {
        let mut stmt = tx.prepare(
            "INSERT INTO photos (
                id, filename, filepath, media_type, date_taken, date_added,
                latitude, longitude, camera_make, camera_model, focal_length,
                aperture, shutter_speed, iso, filesize, sha256, source, imported_at
             ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16,
                'local_import', ?17
             )",
        )?;

        for photo in photos {
            let id = uuid::Uuid::new_v4().to_string();
            stmt.execute(rusqlite::params![
                id,
                photo.filename,
                photo.filepath,
                photo.media_type,
                photo.date_taken,
                imported_at,
                photo.latitude,
                photo.longitude,
                photo.camera_make,
                photo.camera_model,
                photo.focal_length,
                photo.aperture,
                photo.shutter_speed,
                photo.iso,
                photo.filesize,
                photo.sha256,
                imported_at,
            ])?;
            ids.push(id);
        }
    }

    tx.commit()?;
    Ok(ids)
}

/// idsで指定した写真だけを返す。取り込み直後に「今回取り込んだ写真だけを見る」
/// 専用ビュー（フロントエンドの`ImportWizard`完了画面、C-4予定）で使う想定。
/// 存在しないIDは無視する（エラーにしない）。空配列を渡した場合はSQLを発行せず
/// 空配列を返す。
#[allow(dead_code)]
pub fn list_photos_by_ids(conn: &Connection, ids: &[String]) -> Result<Vec<Photo>, DbError> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }

    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!(
        "SELECT p.id, p.filename, p.filepath, p.media_type, p.date_taken, p.date_added, \
         p.latitude, p.longitude, p.favorite, p.hidden, p.title, p.description, \
         p.width, p.height, p.source \
         FROM photos p \
         WHERE p.id IN ({placeholders}) \
         ORDER BY p.date_taken ASC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params_from_iter(ids.iter()), row_to_photo)?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(DbError::from)
}

/// `place_photo`が返す絶対パスを、archive_root相対・`/`区切りの文字列に変換する。
/// Windows上では`PathBuf`が`\`区切りになるが、`photos.filepath`は既存の
/// Source A/B由来データ（Python側で生成、`/`区切り）と同じ表記に揃えておく方が
/// 一貫性がある（読み出し側の`archive_root.join(relative_path)`はどちらの
/// 区切り文字でもWindows上で問題なく解決できるため、実害はないが表記を揃える）。
#[allow(dead_code)]
fn relative_filepath(archive_root: &Path, dest: &Path) -> String {
    dest.strip_prefix(archive_root)
        .unwrap_or(dest)
        .to_string_lossy()
        .replace('\\', "/")
}

/// `PhotoMetadata.date_taken`（"YYYY-MM-DD..."で始まる文字列。EXIF由来は
/// タイムゾーン無しのローカル時刻表現、mtime由来はRFC3339）から
/// `layout::place_photo`が要求する`(year, month)`を取り出す。
/// パース不能な場合は`None`を返し、`photos/unknown/`配下に置かれるようにする。
#[allow(dead_code)]
fn year_month_from_date_taken(date_taken: &Option<String>) -> Option<(i32, u32)> {
    let raw = date_taken.as_ref()?;
    let year: i32 = raw.get(0..4)?.parse().ok()?;
    let month: u32 = raw.get(5..7)?.parse().ok()?;
    Some((year, month))
}

#[allow(dead_code)]
fn media_type_for(kind: MediaKind) -> String {
    match kind {
        MediaKind::Photo => "photo".to_string(),
        MediaKind::Video => "video".to_string(),
    }
}

#[allow(dead_code)]
#[derive(Debug, thiserror::Error)]
pub enum ImportCommitError {
    #[error("写真ファイルのコピーに失敗しました: {0}")]
    Layout(#[from] crate::import::LayoutError),
    #[error(transparent)]
    Db(#[from] DbError),
}

/// TASK-380の`import`モジュールが判定した`PendingImportItem`一覧を受け取り、
/// 実際にarchive.dbへ書き込む。
///
/// **`DedupStatus::New`の項目のみ**を`import::place_photo`でコピーし、
/// `insert_local_import_photos`でDBへ挿入する。`DuplicateOfExisting`/
/// `DuplicateWithinBatch`と判定済みの項目は、物理コピーもDB insertも
/// 一切行わない — 単にスキップして`duplicate_count`に数えるだけ
/// （TASK-380レビュー指摘: `PendingImportItem.dedup_status`が
/// `place_photo`と型的に結び付いていなかったため、ここで明示的に
/// 分岐させ、誤って重複ファイルまでコピー・insertしてしまう事故を防ぐ）。
///
/// 重複ファイルは`_duplicates/`へ退避しない。既存の`duplicates`テーブルも
/// この経路では使わない（Source A/B初回移行専用の設計であり、コピー後も
/// 元のSDカード/フォルダ側にファイルが残るローカル取り込みでは、
/// 退避的な安全策自体が不要という判断）。
#[allow(dead_code)]
pub fn commit_new_import_items(
    conn: &mut Connection,
    archive_root: &Path,
    items: &[PendingImportItem],
) -> Result<ImportCommitSummary, ImportCommitError> {
    let mut duplicate_count = 0usize;
    let mut new_photos = Vec::new();
    // `insert_local_import_photos`が失敗した場合のクリーンアップ用に、
    // この回のバッチで実際に物理コピーした先の絶対パスも別途保持する
    // （`NewPhoto.filepath`はarchive_root相対の文字列であり、削除には
    // 使えないため）。
    let mut copied_dests: Vec<PathBuf> = Vec::new();

    for item in items {
        match &item.dedup_status {
            DedupStatus::New => {
                let date_taken_ym = year_month_from_date_taken(&item.metadata.date_taken);
                let dest =
                    crate::import::place_photo(&item.source_path, archive_root, date_taken_ym)?;
                let filesize = std::fs::metadata(&dest).ok().map(|m| m.len() as i64);
                let filename = dest
                    .file_name()
                    .map(|f| f.to_string_lossy().to_string())
                    .unwrap_or_default();

                new_photos.push(NewPhoto {
                    filename,
                    filepath: relative_filepath(archive_root, &dest),
                    media_type: media_type_for(item.kind),
                    date_taken: item.metadata.date_taken.clone(),
                    latitude: item.metadata.latitude,
                    longitude: item.metadata.longitude,
                    camera_make: item.metadata.camera_make.clone(),
                    camera_model: item.metadata.camera_model.clone(),
                    focal_length: item.metadata.focal_length,
                    aperture: item.metadata.aperture,
                    shutter_speed: item.metadata.shutter_speed.clone(),
                    iso: item.metadata.iso,
                    filesize,
                    sha256: item.sha256.clone(),
                });
                copied_dests.push(dest);
            }
            DedupStatus::DuplicateOfExisting { .. } | DedupStatus::DuplicateWithinBatch { .. } => {
                duplicate_count += 1;
            }
        }
    }

    match insert_local_import_photos(conn, &new_photos) {
        Ok(inserted_photo_ids) => Ok(ImportCommitSummary {
            inserted_photo_ids,
            duplicate_count,
        }),
        Err(err) => {
            // DBへのinsertが失敗した場合（ディスクフル・SQLITE_BUSY・電源断等）、
            // この回のバッチで既に物理コピー済みだったファイルを
            // ベストエフォートで削除する。放置すると「DBに記録されない
            // 孤児ファイル」として残り、再試行時にsha256ベースの重複判定を
            // すり抜けて同じファイルが衝突サフィックス付きで再コピーされ続ける
            // （rust-reviewerレビュー指摘、TASK-381差し戻し）。
            // 削除自体が失敗しても（権限不足等）ログ出力に留め、
            // 元のDBエラーをそのまま呼び出し元へ返す。
            for dest in &copied_dests {
                if let Err(remove_err) = std::fs::remove_file(dest) {
                    eprintln!(
                        "commit_new_import_items: DB insert失敗後のクリーンアップで \
                         {}の削除に失敗しました: {remove_err}",
                        dest.display()
                    );
                }
            }
            Err(ImportCommitError::Db(err))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::create_test_schema;
    use rusqlite::Connection;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        create_test_schema(&conn);
        conn
    }

    fn insert_photo(
        conn: &Connection,
        id: &str,
        filename: &str,
        date_taken: &str,
        favorite: bool,
        source: &str,
    ) {
        conn.execute(
            "INSERT INTO photos (id, filename, filepath, media_type, date_taken, favorite, hidden, source) \
             VALUES (?1, ?2, ?2, 'photo', ?3, ?4, 0, ?5)",
            rusqlite::params![id, filename, date_taken, favorite as i64, source],
        )
        .unwrap();
    }

    #[test]
    fn list_photos_returns_all_photos_ordered_by_date() {
        let conn = setup();
        insert_photo(
            &conn,
            "1",
            "b.jpg",
            "2020-02-01T00:00:00",
            false,
            "source_a",
        );
        insert_photo(
            &conn,
            "2",
            "a.jpg",
            "2020-01-01T00:00:00",
            false,
            "source_a",
        );

        let photos = list_photos(&conn, &PhotoFilter::default()).unwrap();

        assert_eq!(photos.len(), 2);
        assert_eq!(photos[0].id, "2");
        assert_eq!(photos[1].id, "1");
    }

    #[test]
    fn list_photos_filters_favorite_only() {
        let conn = setup();
        insert_photo(&conn, "1", "a.jpg", "2020-01-01T00:00:00", true, "source_a");
        insert_photo(
            &conn,
            "2",
            "b.jpg",
            "2020-01-02T00:00:00",
            false,
            "source_a",
        );

        let filter = PhotoFilter {
            favorite_only: true,
            ..Default::default()
        };
        let photos = list_photos(&conn, &filter).unwrap();

        assert_eq!(photos.len(), 1);
        assert_eq!(photos[0].id, "1");
    }

    #[test]
    fn list_photos_filters_by_year_and_month() {
        let conn = setup();
        insert_photo(
            &conn,
            "1",
            "a.jpg",
            "2020-01-15T00:00:00",
            false,
            "source_a",
        );
        insert_photo(
            &conn,
            "2",
            "b.jpg",
            "2020-02-15T00:00:00",
            false,
            "source_a",
        );
        insert_photo(
            &conn,
            "3",
            "c.jpg",
            "2021-01-15T00:00:00",
            false,
            "source_a",
        );

        let filter = PhotoFilter {
            year: Some(2020),
            month: Some(1),
            ..Default::default()
        };
        let photos = list_photos(&conn, &filter).unwrap();

        assert_eq!(photos.len(), 1);
        assert_eq!(photos[0].id, "1");
    }

    #[test]
    fn list_photos_filters_by_keyword() {
        let conn = setup();
        insert_photo(
            &conn,
            "1",
            "a.jpg",
            "2020-01-01T00:00:00",
            false,
            "source_a",
        );
        insert_photo(
            &conn,
            "2",
            "b.jpg",
            "2020-01-02T00:00:00",
            false,
            "source_a",
        );
        conn.execute("INSERT INTO keywords (id, name) VALUES (1, 'family')", [])
            .unwrap();
        conn.execute(
            "INSERT INTO photo_keywords (photo_id, keyword_id) VALUES ('1', 1)",
            [],
        )
        .unwrap();

        let filter = PhotoFilter {
            keyword: Some("family".to_string()),
            ..Default::default()
        };
        let photos = list_photos(&conn, &filter).unwrap();

        assert_eq!(photos.len(), 1);
        assert_eq!(photos[0].id, "1");
    }

    #[test]
    fn list_albums_returns_photo_count() {
        let conn = setup();
        insert_photo(
            &conn,
            "1",
            "a.jpg",
            "2020-01-01T00:00:00",
            false,
            "source_a",
        );
        insert_photo(
            &conn,
            "2",
            "b.jpg",
            "2020-01-02T00:00:00",
            false,
            "source_a",
        );
        conn.execute(
            "INSERT INTO albums (id, name, source) VALUES ('alb1', '旅行', 'source_a')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO album_photos (album_id, photo_id) VALUES ('alb1', '1'), ('alb1', '2')",
            [],
        )
        .unwrap();

        let albums = list_albums(&conn).unwrap();

        assert_eq!(albums.len(), 1);
        assert_eq!(albums[0].name, "旅行");
        assert_eq!(albums[0].photo_count, 2);
    }

    #[test]
    fn list_album_photos_returns_only_photos_in_that_album() {
        let conn = setup();
        insert_photo(
            &conn,
            "1",
            "a.jpg",
            "2020-01-01T00:00:00",
            false,
            "source_a",
        );
        insert_photo(
            &conn,
            "2",
            "b.jpg",
            "2020-01-02T00:00:00",
            false,
            "source_a",
        );
        conn.execute(
            "INSERT INTO albums (id, name, source) VALUES ('alb1', '旅行', 'source_a')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO album_photos (album_id, photo_id) VALUES ('alb1', '1')",
            [],
        )
        .unwrap();

        let photos = list_album_photos(&conn, "alb1").unwrap();

        assert_eq!(photos.len(), 1);
        assert_eq!(photos[0].id, "1");
    }

    #[test]
    fn search_photos_matches_filename_case_insensitively() {
        let conn = setup();
        insert_photo(
            &conn,
            "1",
            "Sunset.jpg",
            "2020-01-01T00:00:00",
            false,
            "source_a",
        );
        insert_photo(
            &conn,
            "2",
            "Mountain.jpg",
            "2020-01-02T00:00:00",
            false,
            "source_a",
        );

        let photos = search_photos(&conn, "sunset").unwrap();

        assert_eq!(photos.len(), 1);
        assert_eq!(photos[0].id, "1");
    }

    #[test]
    fn search_photos_returns_empty_when_no_match() {
        let conn = setup();
        insert_photo(
            &conn,
            "1",
            "a.jpg",
            "2020-01-01T00:00:00",
            false,
            "source_a",
        );

        let photos = search_photos(&conn, "nonexistent").unwrap();

        assert!(photos.is_empty());
    }

    #[test]
    fn search_photos_matches_album_name_for_photos_with_no_meaningful_filename() {
        let conn = setup();
        // デジカメ取り込みは"IMG_0001.jpg"のようなファイル名で、検索語を含まないことが多い
        insert_photo(
            &conn,
            "1",
            "IMG_0001.jpg",
            "2020-01-01T00:00:00",
            false,
            "source_a",
        );
        insert_photo(
            &conn,
            "2",
            "IMG_0002.jpg",
            "2020-01-02T00:00:00",
            false,
            "source_a",
        );
        conn.execute(
            "INSERT INTO albums (id, name, source) VALUES ('alb1', '七五三', 'source_a')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO album_photos (album_id, photo_id) VALUES ('alb1', '1')",
            [],
        )
        .unwrap();

        let photos = search_photos(&conn, "七五三").unwrap();

        assert_eq!(photos.len(), 1);
        assert_eq!(photos[0].id, "1");
    }

    #[test]
    fn search_photos_does_not_duplicate_a_photo_belonging_to_multiple_matching_albums() {
        let conn = setup();
        insert_photo(
            &conn,
            "1",
            "IMG_0001.jpg",
            "2020-01-01T00:00:00",
            false,
            "source_a",
        );
        conn.execute(
            "INSERT INTO albums (id, name, source) VALUES ('alb1', '運動会2020', 'source_a'), ('alb2', '運動会2020写真', 'source_b')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO album_photos (album_id, photo_id) VALUES ('alb1', '1'), ('alb2', '1')",
            [],
        )
        .unwrap();

        let photos = search_photos(&conn, "運動会").unwrap();

        assert_eq!(photos.len(), 1);
    }

    #[test]
    fn search_photos_includes_all_album_names_the_photo_belongs_to() {
        let conn = setup();
        insert_photo(
            &conn,
            "1",
            "IMG_0001.jpg",
            "2020-01-01T00:00:00",
            false,
            "source_a",
        );
        conn.execute(
            "INSERT INTO albums (id, name, source) VALUES ('alb1', '七五三', 'source_a'), ('alb2', '家族写真', 'source_a')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO album_photos (album_id, photo_id) VALUES ('alb1', '1'), ('alb2', '1')",
            [],
        )
        .unwrap();

        let photos = search_photos(&conn, "七五三").unwrap();

        assert_eq!(photos.len(), 1);
        assert_eq!(
            photos[0].album_names,
            Some(vec!["七五三".to_string(), "家族写真".to_string()])
        );
    }

    #[test]
    fn search_photos_sets_empty_album_names_when_photo_belongs_to_no_album() {
        let conn = setup();
        insert_photo(
            &conn,
            "1",
            "sunset.jpg",
            "2020-01-01T00:00:00",
            false,
            "source_a",
        );

        let photos = search_photos(&conn, "sunset").unwrap();

        assert_eq!(photos[0].album_names, Some(vec![]));
    }

    #[test]
    fn list_unfiled_photos_returns_only_photos_with_no_album() {
        let conn = setup();
        insert_photo(
            &conn,
            "1",
            "a.jpg",
            "2020-01-01T00:00:00",
            false,
            "source_a",
        );
        insert_photo(
            &conn,
            "2",
            "b.jpg",
            "2020-01-02T00:00:00",
            false,
            "source_a",
        );
        conn.execute(
            "INSERT INTO albums (id, name, source) VALUES ('alb1', '旅行', 'source_a')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO album_photos (album_id, photo_id) VALUES ('alb1', '1')",
            [],
        )
        .unwrap();

        let photos = list_unfiled_photos(&conn).unwrap();

        assert_eq!(photos.len(), 1);
        assert_eq!(photos[0].id, "2");
    }

    #[test]
    fn count_unfiled_photos_matches_list_unfiled_photos_length() {
        let conn = setup();
        insert_photo(
            &conn,
            "1",
            "a.jpg",
            "2020-01-01T00:00:00",
            false,
            "source_a",
        );
        insert_photo(
            &conn,
            "2",
            "b.jpg",
            "2020-01-02T00:00:00",
            false,
            "source_a",
        );
        conn.execute(
            "INSERT INTO albums (id, name, source) VALUES ('alb1', '旅行', 'source_a')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO album_photos (album_id, photo_id) VALUES ('alb1', '1')",
            [],
        )
        .unwrap();

        let count = count_unfiled_photos(&conn).unwrap();

        assert_eq!(count, 1);
    }

    #[test]
    fn create_album_inserts_a_manual_viewer_sourced_album() {
        let conn = setup();

        let album = create_album(&conn, "手動アルバム").unwrap();

        assert_eq!(album.name, "手動アルバム");
        assert_eq!(album.album_type, "manual");
        assert_eq!(album.source, "viewer");
        assert_eq!(album.photo_count, 0);

        let albums = list_albums(&conn).unwrap();
        assert_eq!(albums.len(), 1);
        assert_eq!(albums[0].id, album.id);
    }

    #[test]
    fn rename_album_updates_the_name() {
        let conn = setup();
        let album = create_album(&conn, "旧名").unwrap();

        rename_album(&conn, &album.id, "新名").unwrap();

        let albums = list_albums(&conn).unwrap();
        assert_eq!(albums[0].name, "新名");
    }

    #[test]
    fn delete_viewer_album_removes_a_manually_created_album() {
        let conn = setup();
        let album = create_album(&conn, "作りすぎた").unwrap();

        delete_viewer_album(&conn, &album.id).unwrap();

        let albums = list_albums(&conn).unwrap();
        assert!(albums.is_empty());
    }

    #[test]
    fn delete_viewer_album_does_not_delete_imported_albums() {
        let conn = setup();
        conn.execute(
            "INSERT INTO albums (id, name, source) VALUES ('alb1', 'Source A由来', 'source_a')",
            [],
        )
        .unwrap();

        delete_viewer_album(&conn, "alb1").unwrap();

        let albums = list_albums(&conn).unwrap();
        assert_eq!(
            albums.len(),
            1,
            "source='viewer'以外のアルバムは削除されない"
        );
    }

    #[test]
    fn add_photos_to_album_links_multiple_photos_at_once() {
        let conn = setup();
        insert_photo(
            &conn,
            "1",
            "a.jpg",
            "2020-01-01T00:00:00",
            false,
            "source_a",
        );
        insert_photo(
            &conn,
            "2",
            "b.jpg",
            "2020-01-02T00:00:00",
            false,
            "source_a",
        );
        let album = create_album(&conn, "まとめて追加").unwrap();

        add_photos_to_album(&conn, &album.id, &["1".to_string(), "2".to_string()]).unwrap();

        let photos = list_album_photos(&conn, &album.id).unwrap();
        assert_eq!(photos.len(), 2);
    }

    #[test]
    fn add_photos_to_album_ignores_photos_already_in_the_album() {
        let conn = setup();
        insert_photo(
            &conn,
            "1",
            "a.jpg",
            "2020-01-01T00:00:00",
            false,
            "source_a",
        );
        let album = create_album(&conn, "重複追加").unwrap();
        add_photos_to_album(&conn, &album.id, &["1".to_string()]).unwrap();

        let result = add_photos_to_album(&conn, &album.id, &["1".to_string()]);

        assert!(result.is_ok());
        let photos = list_album_photos(&conn, &album.id).unwrap();
        assert_eq!(photos.len(), 1);
    }

    #[test]
    fn remove_photo_from_album_unlinks_the_photo() {
        let conn = setup();
        insert_photo(
            &conn,
            "1",
            "a.jpg",
            "2020-01-01T00:00:00",
            false,
            "source_a",
        );
        let album = create_album(&conn, "外す").unwrap();
        add_photos_to_album(&conn, &album.id, &["1".to_string()]).unwrap();

        remove_photo_from_album(&conn, &album.id, "1").unwrap();

        let photos = list_album_photos(&conn, &album.id).unwrap();
        assert!(photos.is_empty());
    }

    #[test]
    fn unfile_photo_removes_the_photo_from_every_album_and_returns_previous_album_ids() {
        let conn = setup();
        insert_photo(
            &conn,
            "1",
            "a.jpg",
            "2020-01-01T00:00:00",
            false,
            "source_a",
        );
        let album1 = create_album(&conn, "アルバム1").unwrap();
        let album2 = create_album(&conn, "アルバム2").unwrap();
        add_photos_to_album(&conn, &album1.id, &["1".to_string()]).unwrap();
        add_photos_to_album(&conn, &album2.id, &["1".to_string()]).unwrap();

        let mut removed = unfile_photo(&conn, "1").unwrap();
        removed.sort();
        let mut expected = vec![album1.id.clone(), album2.id.clone()];
        expected.sort();
        assert_eq!(removed, expected);

        let unfiled = list_unfiled_photos(&conn).unwrap();
        assert_eq!(unfiled.len(), 1);
        assert_eq!(unfiled[0].id, "1");
    }

    #[test]
    fn unfile_photo_returns_empty_when_the_photo_already_has_no_albums() {
        let conn = setup();
        insert_photo(
            &conn,
            "1",
            "a.jpg",
            "2020-01-01T00:00:00",
            false,
            "source_a",
        );

        let removed = unfile_photo(&conn, "1").unwrap();

        assert!(removed.is_empty());
    }

    /// 結合テスト（TASK-054）: Rust側のテストは普段
    /// `test_support::create_test_schema`（手書きの簡略スキーマ）を使っているが、
    /// 本番のarchive.dbはPython側の`photolibre_importer.schema`が作成する。
    /// 両者のスキーマ定義が食い違うと、単体テストが全て通っていても実機で
    /// クエリが失敗しうる。このテストは実際にPythonのcreate_schema()で生成した
    /// フィクスチャDB（tests/fixtures/sample_archive.db）を読み込み、公開クエリ
    /// 関数が本番相当のスキーマに対しても正しく動作することを検証する。
    #[test]
    fn real_archive_db_produced_by_python_importer_is_readable_by_all_query_functions() {
        let fixture_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join("sample_archive.db");
        let conn =
            Connection::open_with_flags(&fixture_path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
                .expect("Pythonのcreate_schema()で生成したフィクスチャDBを開けること");

        let photos = list_photos(&conn, &PhotoFilter::default())
            .expect("本番相当のスキーマに対してlist_photosが成功すること");
        assert_eq!(photos.len(), 2);

        let albums = list_albums(&conn).expect("list_albumsが成功すること");
        assert_eq!(albums.len(), 1);
        assert_eq!(albums[0].name, "夏休み2008");
        assert_eq!(albums[0].photo_count, 1);

        let album_photos =
            list_album_photos(&conn, &albums[0].id).expect("list_album_photosが成功すること");
        assert_eq!(album_photos.len(), 1);
        assert_eq!(album_photos[0].filename, "DSC0001.JPG");

        let unfiled = list_unfiled_photos(&conn).expect("list_unfiled_photosが成功すること");
        assert_eq!(unfiled.len(), 1);
        assert_eq!(unfiled[0].filename, "IMG_0002.jpg");

        // ファイル名・タイトル・説明・アルバム名を横断する検索も本番スキーマで動作すること
        let by_title = search_photos(&conn, "夏休みの海").expect("タイトルでの検索が成功すること");
        assert_eq!(by_title.len(), 1);

        let by_album_name =
            search_photos(&conn, "夏休み2008").expect("アルバム名での検索が成功すること");
        assert_eq!(by_album_name.len(), 1);
        assert_eq!(
            by_album_name[0].album_names,
            Some(vec!["夏休み2008".to_string()])
        );
    }

    // -----------------------------------------------------------------
    // TASK-381（C-2: DB書き込み層）: ローカルフォルダ取り込みの書き込み関数群
    // -----------------------------------------------------------------

    fn sample_new_photo(filename: &str, sha256: &str) -> NewPhoto {
        NewPhoto {
            filename: filename.to_string(),
            filepath: format!("photos/2024/01/{filename}"),
            media_type: "photo".to_string(),
            date_taken: Some("2024-01-15T10:00:00".to_string()),
            latitude: Some(35.0),
            longitude: Some(139.0),
            camera_make: Some("Canon".to_string()),
            camera_model: Some("EOS R5".to_string()),
            focal_length: Some(50.0),
            aperture: Some(2.8),
            shutter_speed: Some("1/250".to_string()),
            iso: Some(400),
            filesize: Some(123_456),
            sha256: sha256.to_string(),
        }
    }

    #[test]
    fn insert_local_import_photos_inserts_rows_marked_with_local_import_source() {
        let mut conn = setup();

        let ids =
            insert_local_import_photos(&mut conn, &[sample_new_photo("a.jpg", "hash-a")]).unwrap();

        assert_eq!(ids.len(), 1);
        let photos = list_photos(&conn, &PhotoFilter::default()).unwrap();
        assert_eq!(photos.len(), 1);
        assert_eq!(photos[0].id, ids[0]);
        assert_eq!(photos[0].source, "local_import");
        assert_eq!(photos[0].filename, "a.jpg");
    }

    #[test]
    fn insert_local_import_photos_returns_ids_in_the_same_order_as_input() {
        let mut conn = setup();

        let ids = insert_local_import_photos(
            &mut conn,
            &[
                sample_new_photo("a.jpg", "hash-a"),
                sample_new_photo("b.jpg", "hash-b"),
            ],
        )
        .unwrap();

        assert_eq!(ids.len(), 2);
        assert_ne!(ids[0], ids[1], "各行に別のUUIDが生成されること");
        let photos = list_photos_by_ids(&conn, &ids).unwrap();
        assert_eq!(photos.len(), 2);
    }

    #[test]
    fn insert_local_import_photos_commits_all_rows_in_a_single_transaction() {
        let mut conn = setup();
        let photos: Vec<NewPhoto> = (0..5)
            .map(|i| sample_new_photo(&format!("img{i}.jpg"), &format!("hash-{i}")))
            .collect();

        let ids = insert_local_import_photos(&mut conn, &photos).unwrap();

        assert_eq!(ids.len(), 5);
        let all = list_photos(&conn, &PhotoFilter::default()).unwrap();
        assert_eq!(
            all.len(),
            5,
            "1トランザクションで5件すべてがcommitされること"
        );
    }

    #[test]
    fn insert_local_import_photos_handles_empty_input_without_error() {
        let mut conn = setup();

        let ids = insert_local_import_photos(&mut conn, &[]).unwrap();

        assert!(ids.is_empty());
    }

    #[test]
    fn list_photos_by_ids_returns_only_requested_photos() {
        let mut conn = setup();
        let ids = insert_local_import_photos(
            &mut conn,
            &[
                sample_new_photo("a.jpg", "hash-a"),
                sample_new_photo("b.jpg", "hash-b"),
                sample_new_photo("c.jpg", "hash-c"),
            ],
        )
        .unwrap();

        let photos = list_photos_by_ids(&conn, &[ids[0].clone(), ids[2].clone()]).unwrap();

        assert_eq!(photos.len(), 2);
        let filenames: Vec<&str> = photos.iter().map(|p| p.filename.as_str()).collect();
        assert!(filenames.contains(&"a.jpg"));
        assert!(filenames.contains(&"c.jpg"));
        assert!(!filenames.contains(&"b.jpg"));
    }

    #[test]
    fn list_photos_by_ids_returns_empty_for_empty_id_list() {
        let conn = setup();

        let photos = list_photos_by_ids(&conn, &[]).unwrap();

        assert!(photos.is_empty());
    }

    #[test]
    fn list_photos_by_ids_ignores_unknown_ids() {
        let conn = setup();

        let photos = list_photos_by_ids(&conn, &["does-not-exist".to_string()]).unwrap();

        assert!(photos.is_empty());
    }

    /// TASK-380レビュー(rust-reviewer)からの申し送り事項に対応するテスト:
    /// `PendingImportItem.dedup_status`が`DuplicateOfExisting`と判定された
    /// 項目は、物理コピー(`place_photo`)もDB insertも一切行われず、単に
    /// カウントされるだけであることを、実際の`import`モジュール（`hash_file`・
    /// `load_known_hashes`・`classify_batch`）を使った一連の流れで検証する。
    #[test]
    fn commit_new_import_items_skips_duplicate_of_existing_photo_without_copying_or_inserting() {
        use crate::import::{classify_batch, hash_file, load_known_hashes, read_metadata};

        let mut archive_conn = setup();
        let source_dir = tempfile::tempdir().unwrap();
        let new_file = source_dir.path().join("new.jpg");
        std::fs::write(&new_file, b"brand new content").unwrap();
        let dup_file = source_dir.path().join("dup.jpg");
        std::fs::write(&dup_file, b"duplicate content").unwrap();

        // archive.db(テストスキーマ)に、dup.jpgと全く同じ内容の写真が
        // 既に取り込み済みであるという状況を用意する。
        let dup_hash = hash_file(&dup_file).unwrap();
        archive_conn
            .execute(
                "INSERT INTO photos (id, filename, filepath, media_type, source, sha256) \
                 VALUES ('EXISTING-1', 'existing.jpg', 'existing.jpg', 'photo', 'source_a', ?1)",
                rusqlite::params![dup_hash],
            )
            .unwrap();

        let candidates = vec![
            (new_file.clone(), hash_file(&new_file).unwrap()),
            (dup_file.clone(), dup_hash.clone()),
        ];
        let known_hashes = load_known_hashes(&archive_conn).unwrap();
        let classified = classify_batch(&candidates, &known_hashes);

        let items: Vec<PendingImportItem> = classified
            .into_iter()
            .map(|(path, status)| PendingImportItem {
                metadata: read_metadata(&path, MediaKind::Photo),
                sha256: hash_file(&path).unwrap(),
                source_path: path,
                kind: MediaKind::Photo,
                dedup_status: status,
            })
            .collect();

        // 前提: classify_batchが期待通りNew/DuplicateOfExistingを判定していること
        assert_eq!(items[0].dedup_status, DedupStatus::New);
        assert_eq!(
            items[1].dedup_status,
            DedupStatus::DuplicateOfExisting {
                photo_id: "EXISTING-1".to_string()
            }
        );

        let archive_root = tempfile::tempdir().unwrap();
        let summary = commit_new_import_items(&mut archive_conn, archive_root.path(), &items)
            .expect("New/DuplicateOfExistingが混在していても成功すること");

        assert_eq!(
            summary.inserted_photo_ids.len(),
            1,
            "新規1件のみinsertされること"
        );
        assert_eq!(
            summary.duplicate_count, 1,
            "重複1件はカウントのみでinsertされないこと"
        );

        // 重複ファイルは物理コピーされず、新規ファイルのみコピーされていること
        let copied_files: Vec<_> = walkdir::WalkDir::new(archive_root.path())
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .collect();
        assert_eq!(
            copied_files.len(),
            1,
            "重複と判定されたファイルは物理コピーされないこと"
        );
        assert!(copied_files[0]
            .path()
            .to_string_lossy()
            .replace('\\', "/")
            .ends_with("new.jpg"));

        // 重複と判定された写真はDBにinsertされていないこと
        let inserted = list_photos_by_ids(&archive_conn, &summary.inserted_photo_ids).unwrap();
        assert_eq!(inserted.len(), 1);
        assert_eq!(inserted[0].filename, "new.jpg");

        let local_import_count = list_photos(&archive_conn, &PhotoFilter::default())
            .unwrap()
            .into_iter()
            .filter(|p| p.source == "local_import")
            .count();
        assert_eq!(
            local_import_count, 1,
            "既存のEXISTING-1(source_a相当)を除き、local_importでinsertされたのは新規1件のみ"
        );
    }

    /// 同一バッチ内重複（`DuplicateWithinBatch`）についても、
    /// `DuplicateOfExisting`と同様に物理コピー・insertが行われないことを検証する。
    #[test]
    fn commit_new_import_items_skips_duplicate_within_batch_without_copying_or_inserting() {
        use crate::import::{classify_batch, hash_file, load_known_hashes, read_metadata};

        let mut archive_conn = setup();
        let source_dir = tempfile::tempdir().unwrap();
        let first = source_dir.path().join("first.jpg");
        std::fs::write(&first, b"identical bytes in both files").unwrap();
        let second = source_dir.path().join("second.jpg");
        std::fs::write(&second, b"identical bytes in both files").unwrap();

        let candidates = vec![
            (first.clone(), hash_file(&first).unwrap()),
            (second.clone(), hash_file(&second).unwrap()),
        ];
        let known_hashes = load_known_hashes(&archive_conn).unwrap();
        let classified = classify_batch(&candidates, &known_hashes);

        let items: Vec<PendingImportItem> = classified
            .into_iter()
            .map(|(path, status)| PendingImportItem {
                metadata: read_metadata(&path, MediaKind::Photo),
                sha256: hash_file(&path).unwrap(),
                source_path: path,
                kind: MediaKind::Photo,
                dedup_status: status,
            })
            .collect();

        assert_eq!(items[0].dedup_status, DedupStatus::New);
        assert!(matches!(
            items[1].dedup_status,
            DedupStatus::DuplicateWithinBatch { .. }
        ));

        let archive_root = tempfile::tempdir().unwrap();
        let summary =
            commit_new_import_items(&mut archive_conn, archive_root.path(), &items).unwrap();

        assert_eq!(summary.inserted_photo_ids.len(), 1);
        assert_eq!(summary.duplicate_count, 1);

        let copied_files: Vec<_> = walkdir::WalkDir::new(archive_root.path())
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .collect();
        assert_eq!(
            copied_files.len(),
            1,
            "バッチ内重複と判定されたファイルは物理コピーされないこと"
        );
    }

    #[test]
    fn commit_new_import_items_handles_all_duplicates_without_inserting_anything() {
        use crate::import::PhotoMetadata;

        let mut archive_conn = setup();
        archive_conn
            .execute(
                "INSERT INTO photos (id, filename, filepath, media_type, source, sha256) \
                 VALUES ('EXISTING-1', 'existing.jpg', 'existing.jpg', 'photo', 'local_import', 'hash-x')",
                [],
            )
            .unwrap();

        let items = vec![PendingImportItem {
            source_path: std::path::PathBuf::from("D:/DCIM/dup.jpg"),
            kind: MediaKind::Photo,
            sha256: "hash-x".to_string(),
            metadata: PhotoMetadata::default(),
            dedup_status: DedupStatus::DuplicateOfExisting {
                photo_id: "EXISTING-1".to_string(),
            },
        }];

        let archive_root = tempfile::tempdir().unwrap();
        let summary =
            commit_new_import_items(&mut archive_conn, archive_root.path(), &items).unwrap();

        assert!(summary.inserted_photo_ids.is_empty());
        assert_eq!(summary.duplicate_count, 1);
        assert!(
            !archive_root.path().join("photos").exists(),
            "insert対象が無い場合、photosディレクトリ自体が作られないこと"
        );
    }

    /// 完了条件: Python本番スキーマ（`importer/src/photolibre_importer/schema.py`）
    /// とのフィールド不整合が無いことを、実際にPython側で生成した
    /// `sample_archive.db`フィクスチャへの書き込みで確認する。
    /// フィクスチャ自体は変更せず、一時コピーに対して書き込む。
    #[test]
    fn insert_local_import_photos_is_compatible_with_the_real_python_generated_schema() {
        let fixture_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join("sample_archive.db");
        let tmp = tempfile::tempdir().unwrap();
        let db_copy = tmp.path().join("archive.db");
        std::fs::copy(&fixture_path, &db_copy)
            .expect("フィクスチャDBを一時コピーへ複製できること（元ファイルは変更しない）");

        let mut conn =
            Connection::open_with_flags(&db_copy, rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE)
                .expect("複製したフィクスチャDBを読み書きモードで開けること");

        let new_photo = sample_new_photo(
            "local_import_test.jpg",
            "brand-new-sha256-for-schema-compat-check",
        );
        let ids = insert_local_import_photos(&mut conn, &[new_photo]).expect(
            "Rust側のINSERT文が、Python本番スキーマ(importer/schema.py)のphotosテーブルに \
             対して列名・型の不整合なく成功すること",
        );

        assert_eq!(ids.len(), 1);

        let inserted = list_photos_by_ids(&conn, &ids)
            .expect("list_photos_by_idsも本番相当のスキーマに対して成功すること");
        assert_eq!(inserted.len(), 1);
        assert_eq!(inserted[0].filename, "local_import_test.jpg");
        assert_eq!(inserted[0].source, "local_import");

        // 既存のsource_a/source_b由来データが壊れず残っていることも確認する
        let all = list_photos(&conn, &PhotoFilter::default()).unwrap();
        assert_eq!(all.len(), 3, "フィクスチャの既存2件 + 今回追加した1件");
    }

    // -----------------------------------------------------------------
    // TASK-381差し戻し（rust-reviewer HIGH指摘）:
    // insert_local_import_photosの失敗時に、その回のバッチで既に物理コピー
    // 済みだったファイルが「DBに記録されない孤児ファイル」として残らないこと、
    // および失敗そのものは正しくロールバック・呼び出し元へ伝播することを検証する。
    // -----------------------------------------------------------------

    #[test]
    fn insert_local_import_photos_rolls_back_everything_when_one_row_violates_a_constraint() {
        let mut conn = setup();
        // 本番スキーマには無い制約だが、DB層の書き込み失敗全般に対して
        // insert_local_import_photosが正しくロールバックすることを検証する
        // ため、テスト側だけでsha256にUNIQUE制約を追加する。
        conn.execute_batch("CREATE UNIQUE INDEX ux_photos_sha256_test ON photos(sha256);")
            .unwrap();

        let mut photos: Vec<NewPhoto> = (0..5)
            .map(|i| sample_new_photo(&format!("img{i}.jpg"), &format!("hash-{i}")))
            .collect();
        // 4件目（index 3）を1件目と同じsha256にして、バッチ途中でUNIQUE制約
        // 違反を起こす（0, 1, 2件目までは同じトランザクション内で成功する）。
        photos[3].sha256 = photos[0].sha256.clone();

        let result = insert_local_import_photos(&mut conn, &photos);

        assert!(result.is_err(), "UNIQUE制約違反時はErrを返すこと");
        let all = list_photos(&conn, &PhotoFilter::default()).unwrap();
        assert!(
            all.is_empty(),
            "バッチ途中で1件でも失敗した場合、直前まで成功していた行も含めて \
             1トランザクションとしてロールバックされ0件のままであること"
        );
    }

    #[test]
    fn commit_new_import_items_cleans_up_copied_files_when_db_insert_fails() {
        use crate::import::PhotoMetadata;

        let mut archive_conn = setup();
        // insert_local_import_photosのDB insert失敗を確実に再現するため、
        // テスト側だけでsha256にUNIQUE制約を追加する
        // （物理コピーは正常に完了した後でDB側だけが失敗する状況を作る）。
        archive_conn
            .execute_batch("CREATE UNIQUE INDEX ux_photos_sha256_test ON photos(sha256);")
            .unwrap();

        let source_dir = tempfile::tempdir().unwrap();
        let first = source_dir.path().join("first.jpg");
        std::fs::write(&first, b"first file content").unwrap();
        let second = source_dir.path().join("second.jpg");
        std::fs::write(&second, b"second file, different content").unwrap();

        // classify_batchを介さず、意図的に同一sha256を持つ2件の`New`項目を
        // 直接構築する（実運用ではclassify_batchが同一sha256を重複として
        // 弾くためあり得ない組み合わせだが、DB層のUNIQUE制約違反による
        // insert失敗を確実に再現するため、ここでは直接構築する）。
        let items = vec![
            PendingImportItem {
                source_path: first.clone(),
                kind: MediaKind::Photo,
                sha256: "forced-duplicate-hash".to_string(),
                metadata: PhotoMetadata::default(),
                dedup_status: DedupStatus::New,
            },
            PendingImportItem {
                source_path: second.clone(),
                kind: MediaKind::Photo,
                sha256: "forced-duplicate-hash".to_string(),
                metadata: PhotoMetadata::default(),
                dedup_status: DedupStatus::New,
            },
        ];

        let archive_root = tempfile::tempdir().unwrap();
        let result = commit_new_import_items(&mut archive_conn, archive_root.path(), &items);

        assert!(
            matches!(result, Err(ImportCommitError::Db(_))),
            "DB insert失敗時はImportCommitError::Dbがそのまま返ること: {result:?}"
        );

        // コピー済みだった一時ファイルはベストエフォートで削除され、
        // 「DBに記録されない孤児ファイル」として残っていないこと。
        let remaining_files: Vec<_> = walkdir::WalkDir::new(archive_root.path())
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .collect();
        assert!(
            remaining_files.is_empty(),
            "DB insert失敗時、今回のバッチでコピー済みだったファイルは削除されていること: {remaining_files:?}"
        );

        // トランザクションがロールバックされ、DBには1件も残っていないこと
        let all = list_photos(&archive_conn, &PhotoFilter::default()).unwrap();
        assert!(all.is_empty(), "insert失敗時はDBに1件も残らないこと");
    }
}
