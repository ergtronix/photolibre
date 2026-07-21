import sqlite3

import pytest

from photolibre_importer.schema import create_schema


@pytest.fixture
def conn():
    connection = sqlite3.connect(":memory:")
    connection.execute("PRAGMA foreign_keys = ON")
    create_schema(connection)
    yield connection
    connection.close()


def _table_names(conn):
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table'"
    ).fetchall()
    return {row[0] for row in rows}


def _column_names(conn, table):
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return {row[1] for row in rows}


def test_create_schema_creates_all_expected_tables(conn):
    expected = {
        "photos",
        "albums",
        "album_photos",
        "keywords",
        "photo_keywords",
        "persons",
        "photo_persons",
        "live_photos",
        "duplicates",
        "album_review",
    }
    assert expected <= _table_names(conn)


def test_photos_table_has_dedup_and_source_tracking_columns(conn):
    columns = _column_names(conn, "photos")
    assert "sha256" in columns
    assert "source" in columns  # 'source_a' / 'source_b'


def test_albums_table_has_source_tracking_column(conn):
    columns = _column_names(conn, "albums")
    assert "source" in columns


def test_duplicates_table_records_canonical_relationship(conn):
    columns = _column_names(conn, "duplicates")
    assert columns >= {
        "id",
        "canonical_photo_id",
        "duplicate_path",
        "original_source_path",
        "sha256",
        "detected_at",
    }


def test_duplicates_table_enforces_foreign_key_to_photos(conn):
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            """
            INSERT INTO duplicates
                (canonical_photo_id, duplicate_path, original_source_path, sha256, detected_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            ("nonexistent-photo-id", "_duplicates/x.jpg", "source_a/x.jpg", "abc123", "2026-07-21T00:00:00"),
        )
        conn.commit()


def test_album_review_table_tracks_ambiguous_merge_candidates(conn):
    columns = _column_names(conn, "album_review")
    assert columns >= {
        "id",
        "source_a_album_name",
        "source_b_album_name",
        "reason",
        "status",
        "created_at",
    }


def test_create_schema_is_idempotent():
    connection = sqlite3.connect(":memory:")
    create_schema(connection)
    create_schema(connection)  # 2回目もエラーにならないこと
    assert "photos" in _table_names(connection)
    connection.close()
