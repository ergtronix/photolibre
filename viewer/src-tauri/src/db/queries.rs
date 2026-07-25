use rusqlite::{params_from_iter, Connection, Row};

use super::models::{Album, Photo, PhotoFilter};
use super::DbError;

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
}
