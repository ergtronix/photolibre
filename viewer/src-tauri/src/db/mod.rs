mod models;
mod queries;

pub use models::{Album, Photo, PhotoFilter};
pub use queries::{
    add_photos_to_album, count_unfiled_photos, create_album, delete_viewer_album,
    list_album_photos, list_albums, list_photos, list_unfiled_photos, remove_photo_from_album,
    rename_album, search_photos, unfile_photo,
};

// TASK-381（C-2）: ローカルフォルダ取り込みのDB書き込み層。C-3（Tauriコマンド層、
// TASK-382）でcommands.rsから呼ばれるまでの間、クレート内のどこからも
// 使われないため一時的にunused_imports警告を抑制する
// （import/mod.rsの`#![allow(unused_imports)]`と同じ理由・同じ方針）。
#[allow(unused_imports)]
pub use models::{ImportCommitSummary, NewPhoto};
#[allow(unused_imports)]
pub use queries::{
    commit_new_import_items, insert_local_import_photos, list_photos_by_ids, ImportCommitError,
};

use rusqlite::Connection;
use std::path::Path;

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("archive.dbを開けません: {0}")]
    Open(#[from] rusqlite::Error),
}

/// archive_root配下のarchive.dbを読み取り専用で開く。一覧・検索など閲覧系の
/// コマンドはこちらを使う（大半のコマンドはこれで十分）。
pub fn open_archive(archive_root: &Path) -> Result<Connection, DbError> {
    let db_path = archive_root.join("archive.db");
    let conn = Connection::open_with_flags(db_path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    Ok(conn)
}

/// archive_root配下のarchive.dbを読み書き可能で開く。手動アルバムの作成・
/// リネーム・写真の追加/除外など、ユーザーがビュワー上で行う分類操作のみが対象。
/// 写真原本ファイルやインポーターが書き込む領域には一切触れない
/// （書き込まれるのはarchive.db内のメタデータのみ）。
pub fn open_archive_read_write(archive_root: &Path) -> Result<Connection, DbError> {
    let db_path = archive_root.join("archive.db");
    let conn = Connection::open_with_flags(db_path, rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE)?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    Ok(conn)
}

#[cfg(test)]
pub(crate) mod test_support {
    use rusqlite::Connection;

    /// テスト用にarchive.dbの主要テーブルのみを持つ最小スキーマを作成する。
    /// 本番のスキーマはPython側(importer/schema.py)が作成するため、
    /// ここではRust側の読み取りロジックを検証するための最小構成を用意する。
    pub fn create_test_schema(conn: &Connection) {
        conn.execute_batch(
            r#"
            CREATE TABLE photos (
                id          TEXT PRIMARY KEY,
                filename    TEXT NOT NULL,
                filepath    TEXT NOT NULL,
                media_type  TEXT NOT NULL,
                date_taken  TEXT,
                date_added  TEXT,
                latitude    REAL,
                longitude   REAL,
                favorite    INTEGER DEFAULT 0,
                hidden      INTEGER DEFAULT 0,
                title       TEXT,
                description TEXT,
                width       INTEGER,
                height      INTEGER,
                source      TEXT NOT NULL,
                -- TASK-381向けに追加。本番スキーマ(importer/schema.py)ではNOT NULLだが、
                -- 既存の大量のテストが`insert_photo`ヘルパー(これらの列を指定しない)を
                -- 使っているため、この簡略スキーマではNULL許容のままにする
                -- (本番スキーマとの厳密な整合性はsample_archive.dbフィクスチャを使う
                -- 別の統合テストで確認する)。
                camera_make    TEXT,
                camera_model   TEXT,
                focal_length   REAL,
                aperture       REAL,
                shutter_speed  TEXT,
                iso            INTEGER,
                filesize       INTEGER,
                sha256         TEXT,
                imported_at    TEXT
            );

            CREATE TABLE albums (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                album_type  TEXT DEFAULT 'manual',
                source      TEXT NOT NULL,
                created_at  TEXT
            );

            CREATE TABLE album_photos (
                album_id    TEXT NOT NULL,
                photo_id    TEXT NOT NULL,
                sort_order  INTEGER DEFAULT 0,
                PRIMARY KEY (album_id, photo_id)
            );

            CREATE TABLE keywords (
                id      INTEGER PRIMARY KEY AUTOINCREMENT,
                name    TEXT UNIQUE NOT NULL
            );

            CREATE TABLE photo_keywords (
                photo_id    TEXT NOT NULL,
                keyword_id  INTEGER NOT NULL,
                PRIMARY KEY (photo_id, keyword_id)
            );
            "#,
        )
        .expect("failed to create test schema");
    }
}
