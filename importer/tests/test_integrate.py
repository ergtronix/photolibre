import sqlite3
from datetime import datetime
from pathlib import Path

import pytest

from photolibre_importer.integrate import (
    finalize_duplicate,
    link_album_photo,
    record_album,
    record_source_a_photo,
    record_source_b_photo,
)
from photolibre_importer.schema import create_schema
from photolibre_importer.source_a import SourceAPhoto
from photolibre_importer.source_b import SourceBPhoto


@pytest.fixture
def conn():
    connection = sqlite3.connect(":memory:")
    connection.execute("PRAGMA foreign_keys = ON")
    create_schema(connection)
    yield connection
    connection.close()


def _source_a_photo(**overrides) -> SourceAPhoto:
    defaults = dict(
        uuid="UUID-1",
        filename="DSC01407.JPG",
        source_path=Path("/src/DSC01407.JPG"),
        derivative_paths=[],
        media_type="photo",
        date_taken=datetime(2006, 6, 10, 12, 9, 3),
        date_added=datetime(2016, 8, 22, 19, 0, 27),
        favorite=False,
        hidden=False,
        title=None,
        description=None,
        latitude=None,
        longitude=None,
        width=1280,
        height=960,
        filesize=592588,
        keywords=[],
        persons=[],
        albums=["旅行"],
        live_photo_video_path=None,
    )
    defaults.update(overrides)
    return SourceAPhoto(**defaults)


def _source_b_photo(**overrides) -> SourceBPhoto:
    defaults = dict(
        photo_id="1",
        relative_path=Path("2008/05/IMG_0001.jpg"),
        media_type="Image",
        caption=None,
        comment=None,
        rating=0,
        roll_id="100",
        date_taken=datetime(2008, 5, 7),
        keywords=[],
    )
    defaults.update(overrides)
    return SourceBPhoto(**defaults)


def test_record_source_a_photo_inserts_row_with_source_marker(conn):
    photo = _source_a_photo()

    record_source_a_photo(
        conn, photo, filepath="photos/2006/06/DSC01407.JPG", sha256="abc123", imported_at="2026-07-21T00:00:00"
    )

    row = conn.execute(
        "SELECT id, filename, source, sha256, favorite FROM photos WHERE id = ?", ("UUID-1",)
    ).fetchone()
    assert row == ("UUID-1", "DSC01407.JPG", "source_a", "abc123", 0)


def test_record_source_a_photo_is_idempotent_on_reimport(conn):
    photo = _source_a_photo()
    record_source_a_photo(conn, photo, filepath="p.jpg", sha256="abc", imported_at="t")
    record_source_a_photo(conn, photo, filepath="p.jpg", sha256="abc", imported_at="t")  # 再実行してもエラーにならない

    count = conn.execute("SELECT count(*) FROM photos WHERE id = ?", ("UUID-1",)).fetchone()[0]
    assert count == 1


def test_record_source_b_photo_generates_namespaced_id_and_inserts(conn):
    photo = _source_b_photo()

    photo_id = record_source_b_photo(
        conn, photo, filepath="photos/2008/05/IMG_0001.jpg", sha256="def456", imported_at="2026-07-21T00:00:00"
    )

    assert photo_id != photo.photo_id  # iPhoto内部IDそのままではなく名前空間付きにすること
    row = conn.execute(
        "SELECT id, source, sha256 FROM photos WHERE id = ?", (photo_id,)
    ).fetchone()
    assert row == (photo_id, "source_b", "def456")


def test_record_album_returns_stable_id_for_same_name_and_source(conn):
    id_first = record_album(conn, name="旅行", source="source_a")
    id_second = record_album(conn, name="旅行", source="source_a")

    assert id_first == id_second
    count = conn.execute("SELECT count(*) FROM albums WHERE name = ?", ("旅行",)).fetchone()[0]
    assert count == 1


def test_link_album_photo_creates_association(conn):
    photo = _source_a_photo()
    record_source_a_photo(conn, photo, filepath="p.jpg", sha256="abc", imported_at="t")
    album_id = record_album(conn, name="旅行", source="source_a")

    link_album_photo(conn, album_id=album_id, photo_id="UUID-1")

    row = conn.execute(
        "SELECT album_id, photo_id FROM album_photos WHERE album_id = ? AND photo_id = ?",
        (album_id, "UUID-1"),
    ).fetchone()
    assert row == (album_id, "UUID-1")


def test_finalize_duplicate_migrates_album_links_and_removes_duplicate_row(conn):
    canonical = _source_a_photo(uuid="CANON")
    duplicate = _source_b_photo(photo_id="99")
    record_source_a_photo(conn, canonical, filepath="canon.jpg", sha256="same-hash", imported_at="t")
    duplicate_id = record_source_b_photo(
        conn, duplicate, filepath="dup.jpg", sha256="same-hash", imported_at="t"
    )
    album_id = record_album(conn, name="iPhotoイベント", source="source_b")
    link_album_photo(conn, album_id=album_id, photo_id=duplicate_id)

    finalize_duplicate(
        conn,
        canonical_photo_id="CANON",
        duplicate_photo_id=duplicate_id,
        duplicate_relpath="_duplicates/dup.jpg",
        original_source_relpath="dup.jpg",
        sha256="same-hash",
        detected_at="2026-07-21T00:00:00",
    )

    # 重複写真のphotos行は削除される（ファイル実体は_duplicates/へ移動済みのため）
    remaining = conn.execute(
        "SELECT id FROM photos WHERE id = ?", (duplicate_id,)
    ).fetchone()
    assert remaining is None

    # アルバム所属は正本へ引き継がれ、失われない
    row = conn.execute(
        "SELECT album_id, photo_id FROM album_photos WHERE album_id = ? AND photo_id = ?",
        (album_id, "CANON"),
    ).fetchone()
    assert row == (album_id, "CANON")

    # duplicatesテーブルに正本との対応関係が記録される
    dup_row = conn.execute(
        "SELECT canonical_photo_id, duplicate_path, original_source_path, sha256 FROM duplicates"
    ).fetchone()
    assert dup_row == ("CANON", "_duplicates/dup.jpg", "dup.jpg", "same-hash")


def test_finalize_duplicate_does_not_duplicate_album_link_already_on_canonical(conn):
    canonical = _source_a_photo(uuid="CANON")
    duplicate = _source_b_photo(photo_id="99")
    record_source_a_photo(conn, canonical, filepath="canon.jpg", sha256="same-hash", imported_at="t")
    duplicate_id = record_source_b_photo(
        conn, duplicate, filepath="dup.jpg", sha256="same-hash", imported_at="t"
    )
    album_id = record_album(conn, name="共有アルバム", source="source_a")
    link_album_photo(conn, album_id=album_id, photo_id="CANON")
    link_album_photo(conn, album_id=album_id, photo_id=duplicate_id)

    finalize_duplicate(
        conn,
        canonical_photo_id="CANON",
        duplicate_photo_id=duplicate_id,
        duplicate_relpath="_duplicates/dup.jpg",
        original_source_relpath="dup.jpg",
        sha256="same-hash",
        detected_at="2026-07-21T00:00:00",
    )

    count = conn.execute(
        "SELECT count(*) FROM album_photos WHERE album_id = ? AND photo_id = 'CANON'", (album_id,)
    ).fetchone()[0]
    assert count == 1
