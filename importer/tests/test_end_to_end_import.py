"""importer→archive.dbの一連の流れを通しで検証する結合テスト（TASK-054）。

各モジュールの単体テストとは別に、Source A/Bを組み合わせた際に
run_import.pyの各処理（取り込み・重複検出・アルバム突合）が正しく連携し、
最終的なarchive.dbの状態が期待通りになることを検証する。

2026-07-25のスコープ見直しにより、卒業提出（2026-08-03）対象は
「ここまでの実装分」に限定されている。デジカメ取り込み機能（TASK-053）は
未実装のため対象外。Windows/Linuxクロスプラットフォーム検証も対象外
（現時点ではWindows上での動作のみを対象とする方針のため）。
"""

import json
import plistlib
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from run_import import apply_album_review, apply_dedup, import_source_a, import_source_b  # noqa: E402

from photolibre_importer.schema import create_schema  # noqa: E402


def _build_source_a(root: Path) -> None:
    root.mkdir(parents=True)
    (root / "2008" / "05").mkdir(parents=True)
    (root / "2008" / "05" / "DSC0001.JPG").write_bytes(b"UNIQUE-A1-CONTENT")
    (root / "2008" / "05" / "DSC0002.JPG").write_bytes(b"SHARED-CONTENT-ACROSS-SOURCES")

    db_path = root / ".osxphotos_export.db"
    conn = sqlite3.connect(db_path)
    conn.execute("CREATE TABLE photoinfo (id INTEGER PRIMARY KEY, uuid TEXT, photoinfo JSON)")
    conn.execute("CREATE TABLE export_data (id INTEGER PRIMARY KEY, uuid TEXT, filepath TEXT)")

    records = [
        {
            "uuid": "A-UUID-1",
            "filename": "DSC0001.JPG",
            "original_filename": "DSC0001.JPG",
            "date": "2008-05-03T10:00:00+09:00",
            "date_added": "2016-01-01T00:00:00+09:00",
            "favorite": False,
            "hidden": False,
            "albums": ["夏休み"],
        },
        {
            "uuid": "A-UUID-2",
            "filename": "DSC0002.JPG",
            "original_filename": "DSC0002.JPG",
            "date": "2008-05-04T10:00:00+09:00",
            "date_added": "2016-01-01T00:00:00+09:00",
            "favorite": False,
            "hidden": False,
            "albums": [],
        },
    ]
    for record in records:
        conn.execute(
            "INSERT INTO photoinfo (uuid, photoinfo) VALUES (?, ?)",
            (record["uuid"], json.dumps(record)),
        )
    conn.execute(
        "INSERT INTO export_data (uuid, filepath) VALUES (?, ?)", ("A-UUID-1", "2008/05/DSC0001.JPG")
    )
    conn.execute(
        "INSERT INTO export_data (uuid, filepath) VALUES (?, ?)", ("A-UUID-2", "2008/05/DSC0002.JPG")
    )
    conn.commit()
    conn.close()


def _build_source_b(root: Path) -> None:
    root.mkdir(parents=True)
    (root / "2008" / "05").mkdir(parents=True)
    # Source AのDSC0002.JPGと内容が同一 = 重複検出の対象にする
    (root / "2008" / "05" / "IMG_0001.jpg").write_bytes(b"SHARED-CONTENT-ACROSS-SOURCES")
    (root / "2008" / "05" / "IMG_0002.jpg").write_bytes(b"UNIQUE-B1-CONTENT")

    plist = {
        "Master Image List": {
            "101": {
                "MediaType": "Image",
                "Roll": 1,
                "DateAsTimerInterval": 0.0,
                "ImagePath": "/Users/kh/Pictures/iPhoto Library/Originals/2008/05/IMG_0001.jpg",
            },
            "102": {
                "MediaType": "Image",
                "Roll": 1,
                "DateAsTimerInterval": 0.0,
                "ImagePath": "/Users/kh/Pictures/iPhoto Library/Originals/2008/05/IMG_0002.jpg",
            },
        },
        # Source Aの"夏休み"アルバムと名称完全一致 = アルバム統合の対象にする
        "List of Albums": [
            {"AlbumId": 1, "AlbumName": "夏休み", "KeyList": ["102"]},
        ],
    }
    with open(root / "AlbumData.xml", "wb") as f:
        plistlib.dump(plist, f)


def test_import_pipeline_deduplicates_and_merges_albums_end_to_end(tmp_path):
    source_a_root = tmp_path / "source_a"
    source_b_root = tmp_path / "source_b"
    archive_root = tmp_path / "archive"
    _build_source_a(source_a_root)
    _build_source_b(source_b_root)

    archive_root.mkdir(parents=True)
    conn = sqlite3.connect(archive_root / "archive.db")
    conn.execute("PRAGMA foreign_keys = ON")
    create_schema(conn)
    imported_at = datetime.now(timezone.utc).isoformat()

    path_to_id_a, skipped_a = import_source_a(source_a_root, archive_root, conn, imported_at)
    assert skipped_a == []
    assert len(path_to_id_a) == 2

    path_to_id_b, skipped_b, source_b_album_names, _fallback_used = import_source_b(
        source_b_root, archive_root, conn, imported_at
    )
    assert skipped_b == []
    assert len(path_to_id_b) == 2
    assert source_b_album_names == ["夏休み"]

    photo_count_before_dedup = conn.execute("SELECT COUNT(*) FROM photos").fetchone()[0]
    assert photo_count_before_dedup == 4

    path_to_photo_id = {**path_to_id_a, **path_to_id_b}
    duplicate_records = apply_dedup(archive_root, conn, path_to_photo_id)
    assert len(duplicate_records) == 1

    photo_count_after_dedup = conn.execute("SELECT COUNT(*) FROM photos").fetchone()[0]
    assert photo_count_after_dedup == 3
    assert conn.execute("SELECT COUNT(*) FROM duplicates").fetchone()[0] == 1

    source_a_album_names = [
        row[0] for row in conn.execute("SELECT name FROM albums WHERE source = 'source_a'").fetchall()
    ]
    assert source_a_album_names == ["夏休み"]

    apply_album_review(conn, source_a_album_names, source_b_album_names, imported_at)

    # Source A/B双方の"夏休み"は名称完全一致で1件に統合されているはず
    natsuyasumi_albums = conn.execute("SELECT id FROM albums WHERE name = '夏休み'").fetchall()
    assert len(natsuyasumi_albums) == 1

    album_id = natsuyasumi_albums[0][0]
    linked_photo_count = conn.execute(
        "SELECT COUNT(*) FROM album_photos WHERE album_id = ?", (album_id,)
    ).fetchone()[0]
    # 統合後、Source AのDSC0001(A-UUID-1)とSource BのIMG_0002(102)の
    # 2枚が同じアルバムに紐づいているはず
    assert linked_photo_count == 2

    conn.close()

    # 結合テストでも原本ツリーへの書き込みが発生していないことを軽く確認する
    # （read-only guaranteeそのものの詳細検証はtest_read_only_guarantee.pyで別途実施済み）
    assert (source_a_root / "2008" / "05" / "DSC0001.JPG").read_bytes() == b"UNIQUE-A1-CONTENT"
    assert (source_b_root / "2008" / "05" / "IMG_0002.jpg").read_bytes() == b"UNIQUE-B1-CONTENT"
