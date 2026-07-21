import json
import plistlib
import sqlite3
from pathlib import Path

import pytest

from photolibre_importer.guard import assert_tree_unchanged, snapshot_tree
from photolibre_importer.layout import place_photo
from photolibre_importer.source_a import read_export_paths, read_photoinfo_records
from photolibre_importer.source_b import load_album_data, parse_photos


def _build_fake_source_a(root: Path) -> None:
    root.mkdir(parents=True)
    (root / "2006-06").mkdir()
    (root / "2006-06" / "DSC01407.JPG").write_bytes(b"fake jpeg bytes")

    db_path = root / ".osxphotos_export.db"
    conn = sqlite3.connect(db_path)
    conn.execute("CREATE TABLE photoinfo (id INTEGER PRIMARY KEY, uuid TEXT, photoinfo JSON)")
    conn.execute("CREATE TABLE export_data (id INTEGER PRIMARY KEY, uuid TEXT, filepath TEXT)")
    record = {
        "uuid": "UUID-1",
        "filename": "UUID-1.jpg",
        "original_filename": "DSC01407.JPG",
        "date": "2006-06-10T12:09:03+09:00",
        "date_added": "2016-08-22T19:00:27+09:00",
        "favorite": False,
        "hidden": False,
    }
    conn.execute(
        "INSERT INTO photoinfo (uuid, photoinfo) VALUES (?, ?)",
        ("UUID-1", json.dumps(record)),
    )
    conn.execute(
        "INSERT INTO export_data (uuid, filepath) VALUES (?, ?)",
        ("UUID-1", "2006-06/DSC01407.JPG"),
    )
    conn.commit()
    conn.close()


def _build_fake_source_b(root: Path) -> None:
    root.mkdir(parents=True)
    (root / "Originals" / "2008" / "05").mkdir(parents=True)
    (root / "Originals" / "2008" / "05" / "IMG_0001.jpg").write_bytes(b"fake iphoto bytes")

    plist = {
        "Master Image List": {
            "1": {
                "MediaType": "Image",
                "Rating": 0,
                "Roll": 100,
                "DateAsTimerInterval": 0.0,
                "ImagePath": (root / "Originals" / "2008" / "05" / "IMG_0001.jpg").as_posix(),
            }
        }
    }
    with open(root / "AlbumData.xml", "wb") as f:
        plistlib.dump(plist, f)


def test_full_read_pipeline_never_modifies_raw_source_trees(tmp_path):
    source_a_root = tmp_path / "apple_photos_raw" / "source_a_photos_app"
    source_b_root = tmp_path / "apple_photos_raw" / "source_b_iphoto"
    archive_root = tmp_path / "archive"

    _build_fake_source_a(source_a_root)
    _build_fake_source_b(source_b_root)

    before_a = snapshot_tree(source_a_root)
    before_b = snapshot_tree(source_b_root)

    # 想定される一連の読み取り＋コピー処理を実行する
    db_path = source_a_root / ".osxphotos_export.db"
    records = read_photoinfo_records(db_path)
    export_paths = read_export_paths(db_path)
    for record in records:
        relpaths = export_paths[record["uuid"]]
        source_file = source_a_root / relpaths[0]
        place_photo(source_file, archive_root, None)

    plist = load_album_data(source_b_root / "AlbumData.xml")
    photos_b = parse_photos(plist)
    for photo in photos_b:
        source_file = source_b_root / "Originals" / photo.relative_path
        place_photo(source_file, archive_root, None)

    assert_tree_unchanged(source_a_root, before_a)
    assert_tree_unchanged(source_b_root, before_b)

    # コピー先には実際にファイルが作られていること（読み取り専用テストが空振りでないことの確認）
    copied_files = list((archive_root / "photos").rglob("*"))
    assert len(copied_files) >= 2


def test_assert_tree_unchanged_raises_when_a_file_is_modified(tmp_path):
    root = tmp_path / "src"
    root.mkdir()
    target = root / "file.txt"
    target.write_bytes(b"original")

    before = snapshot_tree(root)
    target.write_bytes(b"tampered")

    with pytest.raises(AssertionError):
        assert_tree_unchanged(root, before)


def test_assert_tree_unchanged_raises_when_a_file_is_deleted(tmp_path):
    root = tmp_path / "src"
    root.mkdir()
    target = root / "file.txt"
    target.write_bytes(b"original")

    before = snapshot_tree(root)
    target.unlink()

    with pytest.raises(AssertionError):
        assert_tree_unchanged(root, before)
