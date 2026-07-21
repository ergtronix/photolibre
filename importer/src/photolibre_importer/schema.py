import sqlite3

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS photos (
    id          TEXT PRIMARY KEY,
    filename    TEXT NOT NULL,
    filepath    TEXT NOT NULL,
    media_type  TEXT NOT NULL,

    date_taken  TEXT,
    date_added  TEXT,

    latitude    REAL,
    longitude   REAL,
    place_name  TEXT,

    favorite    INTEGER DEFAULT 0,
    hidden      INTEGER DEFAULT 0,

    title       TEXT,
    description TEXT,

    camera_make    TEXT,
    camera_model   TEXT,
    focal_length   REAL,
    aperture       REAL,
    shutter_speed  TEXT,
    iso            INTEGER,
    width          INTEGER,
    height         INTEGER,
    filesize       INTEGER,

    sha256      TEXT NOT NULL,
    source      TEXT NOT NULL,        -- 'source_a' / 'source_b'

    imported_at TEXT NOT NULL,
    source_uuid TEXT
);

CREATE TABLE IF NOT EXISTS albums (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    parent_id   TEXT,
    album_type  TEXT DEFAULT 'manual',
    source      TEXT NOT NULL,        -- 'source_a' / 'source_b'
    created_at  TEXT
);

CREATE TABLE IF NOT EXISTS album_photos (
    album_id    TEXT NOT NULL,
    photo_id    TEXT NOT NULL,
    sort_order  INTEGER DEFAULT 0,
    PRIMARY KEY (album_id, photo_id),
    FOREIGN KEY (album_id) REFERENCES albums(id),
    FOREIGN KEY (photo_id) REFERENCES photos(id)
);

CREATE TABLE IF NOT EXISTS keywords (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    name    TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS photo_keywords (
    photo_id    TEXT NOT NULL,
    keyword_id  INTEGER NOT NULL,
    PRIMARY KEY (photo_id, keyword_id),
    FOREIGN KEY (photo_id) REFERENCES photos(id),
    FOREIGN KEY (keyword_id) REFERENCES keywords(id)
);

CREATE TABLE IF NOT EXISTS persons (
    id      TEXT PRIMARY KEY,
    name    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS photo_persons (
    photo_id    TEXT NOT NULL,
    person_id   TEXT NOT NULL,
    face_x      REAL,
    face_y      REAL,
    face_w      REAL,
    face_h      REAL,
    PRIMARY KEY (photo_id, person_id),
    FOREIGN KEY (photo_id) REFERENCES photos(id),
    FOREIGN KEY (person_id) REFERENCES persons(id)
);

CREATE TABLE IF NOT EXISTS live_photos (
    photo_id        TEXT PRIMARY KEY,
    video_filepath  TEXT NOT NULL,
    FOREIGN KEY (photo_id) REFERENCES photos(id)
);

-- 重複として検出され archive/_duplicates/ に退避したファイルの記録。
-- 正本(photos)は削除しないため、ここに退避先と正本の対応関係を残す。
CREATE TABLE IF NOT EXISTS duplicates (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    canonical_photo_id      TEXT NOT NULL,
    duplicate_path          TEXT NOT NULL,
    original_source_path    TEXT NOT NULL,
    sha256                  TEXT NOT NULL,
    detected_at             TEXT NOT NULL,
    FOREIGN KEY (canonical_photo_id) REFERENCES photos(id)
);

-- Source A/Bのアルバムが名称完全一致以外で類似している場合の要確認リスト。
-- 自動統合はせず、ここに記録してユーザーの判断を待つ。
CREATE TABLE IF NOT EXISTS album_review (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    source_a_album_name     TEXT,
    source_b_album_name     TEXT,
    reason                  TEXT NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'pending',
    created_at              TEXT NOT NULL
);
"""


def create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(_SCHEMA_SQL)
    conn.commit()
