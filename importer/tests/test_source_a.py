import sqlite3
from datetime import datetime
from pathlib import Path

from photolibre_importer.source_a import (
    SourceAPhoto,
    parse_source_a_photo,
    read_export_paths,
    read_photoinfo_records,
)

SAMPLE_PHOTOINFO = {
    "uuid": "372970A5-600E-45D6-8251-F079A1DE4E7C",
    "filename": "372970A5-600E-45D6-8251-F079A1DE4E7C.jpeg",
    "original_filename": "DSC01407.JPG",
    "date": "2006-06-10T12:09:03+09:00",
    "date_added": "2016-08-22T19:00:27.447236+09:00",
    "favorite": False,
    "hidden": False,
    "title": None,
    "description": None,
    "latitude": None,
    "longitude": None,
    "width": 1280,
    "height": 960,
    "original_filesize": 592588,
    "keywords": [],
    "persons": ["Alice", "Bob"],
    "albums": ["20080507立川少年部 写真集"],
    "live_photo": False,
    "ismovie": False,
}


def test_parse_source_a_photo_maps_core_fields():
    photo = parse_source_a_photo(
        SAMPLE_PHOTOINFO,
        candidate_relpaths=["2006-06/DSC01407.JPG"],
        export_root=Path("/archive_source"),
    )

    assert isinstance(photo, SourceAPhoto)
    assert photo.uuid == "372970A5-600E-45D6-8251-F079A1DE4E7C"
    assert photo.filename == "DSC01407.JPG"
    assert photo.source_path == Path("/archive_source/2006-06/DSC01407.JPG")
    assert photo.media_type == "photo"
    assert photo.date_taken == datetime.fromisoformat("2006-06-10T12:09:03+09:00")
    assert photo.favorite is False
    assert photo.persons == ["Alice", "Bob"]
    assert photo.albums == ["20080507立川少年部 写真集"]
    assert photo.width == 1280
    assert photo.height == 960
    assert photo.filesize == 592588


def test_parse_source_a_photo_picks_original_filename_match_among_multiple_candidates():
    photo = parse_source_a_photo(
        SAMPLE_PHOTOINFO,
        candidate_relpaths=[
            "2006-06/372970A5-600E-45D6-8251-F079A1DE4E7C.jpeg",  # edited/derivative
            "2006-06/DSC01407.JPG",  # original
        ],
        export_root=Path("/archive_source"),
    )

    assert photo.source_path == Path("/archive_source/2006-06/DSC01407.JPG")
    assert photo.derivative_paths == [
        Path("/archive_source/2006-06/372970A5-600E-45D6-8251-F079A1DE4E7C.jpeg")
    ]


def test_parse_source_a_photo_detects_movie_media_type():
    record = dict(SAMPLE_PHOTOINFO, ismovie=True, original_filename="MOV_0001.MOV")
    photo = parse_source_a_photo(
        record,
        candidate_relpaths=["2006-06/MOV_0001.MOV"],
        export_root=Path("/archive_source"),
    )
    assert photo.media_type == "video"


def test_parse_source_a_photo_detects_live_photo_media_type_and_video_companion():
    record = dict(SAMPLE_PHOTOINFO, live_photo=True)
    photo = parse_source_a_photo(
        record,
        candidate_relpaths=["2006-06/DSC01407.JPG", "2006-06/DSC01407.mov"],
        export_root=Path("/archive_source"),
    )
    assert photo.media_type == "live_photo"
    assert photo.live_photo_video_path == Path("/archive_source/2006-06/DSC01407.mov")


def test_parse_source_a_photo_handles_missing_optional_fields():
    minimal = {
        "uuid": "X",
        "filename": "x.jpg",
        "original_filename": "x.jpg",
        "date": None,
        "date_added": None,
        "favorite": False,
        "hidden": False,
    }
    photo = parse_source_a_photo(
        minimal, candidate_relpaths=["x.jpg"], export_root=Path("/root")
    )
    assert photo.date_taken is None
    assert photo.keywords == []
    assert photo.persons == []
    assert photo.albums == []


def _build_sample_db(db_path: Path) -> None:
    conn = sqlite3.connect(db_path)
    conn.execute("CREATE TABLE photoinfo (id INTEGER PRIMARY KEY, uuid TEXT, photoinfo JSON)")
    conn.execute("CREATE TABLE export_data (id INTEGER PRIMARY KEY, uuid TEXT, filepath TEXT)")
    import json

    conn.execute(
        "INSERT INTO photoinfo (uuid, photoinfo) VALUES (?, ?)",
        (SAMPLE_PHOTOINFO["uuid"], json.dumps(SAMPLE_PHOTOINFO)),
    )
    conn.execute(
        "INSERT INTO export_data (uuid, filepath) VALUES (?, ?)",
        (SAMPLE_PHOTOINFO["uuid"], "2006-06/DSC01407.JPG"),
    )
    conn.commit()
    conn.close()


def test_read_photoinfo_records_reads_json_rows(tmp_path):
    db_path = tmp_path / ".osxphotos_export.db"
    _build_sample_db(db_path)

    records = read_photoinfo_records(db_path)

    assert len(records) == 1
    assert records[0]["uuid"] == SAMPLE_PHOTOINFO["uuid"]


def test_read_export_paths_groups_relpaths_by_uuid(tmp_path):
    db_path = tmp_path / ".osxphotos_export.db"
    _build_sample_db(db_path)

    paths = read_export_paths(db_path)

    assert paths[SAMPLE_PHOTOINFO["uuid"]] == ["2006-06/DSC01407.JPG"]


def test_read_photoinfo_records_does_not_modify_source_db(tmp_path):
    db_path = tmp_path / ".osxphotos_export.db"
    _build_sample_db(db_path)
    before = db_path.read_bytes()

    read_photoinfo_records(db_path)
    read_export_paths(db_path)

    after = db_path.read_bytes()
    assert before == after  # 読み取り専用であること


def _build_wal_mode_sample_db(db_path: Path) -> None:
    import json

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("CREATE TABLE photoinfo (id INTEGER PRIMARY KEY, uuid TEXT, photoinfo JSON)")
    conn.execute("CREATE TABLE export_data (id INTEGER PRIMARY KEY, uuid TEXT, filepath TEXT)")
    conn.execute(
        "INSERT INTO photoinfo (uuid, photoinfo) VALUES (?, ?)",
        (SAMPLE_PHOTOINFO["uuid"], json.dumps(SAMPLE_PHOTOINFO)),
    )
    conn.execute(
        "INSERT INTO export_data (uuid, filepath) VALUES (?, ?)",
        (SAMPLE_PHOTOINFO["uuid"], "2006-06/DSC01407.JPG"),
    )
    conn.commit()
    conn.close()


def test_read_photoinfo_records_does_not_create_wal_or_shm_files_for_wal_mode_db(tmp_path):
    """WALモードのDBを読み取り専用で開いた際に、-shm/-wal補助ファイルを新規生成しないこと。

    実際のosxphotosエクスポートDBはWALモードで作成されており、
    ERGのLinuxMint実機での実データテストで、mode=roのみの読み取り専用接続では
    このケースで補助ファイルが新規作成されてしまうバグが判明した。
    """
    db_path = tmp_path / ".osxphotos_export.db"
    _build_wal_mode_sample_db(db_path)

    # ライター接続を正常にクローズした直後の状態（-shm/-walが存在しない状態）から検証する
    before_files = sorted(p.name for p in tmp_path.iterdir())
    assert before_files == [".osxphotos_export.db"], (
        "前提条件が崩れている: ライタークローズ後に-shm/-walが残存していないことを想定している。"
        f" 実際のファイル一覧: {before_files}"
    )

    read_photoinfo_records(db_path)
    read_export_paths(db_path)

    after_files = sorted(p.name for p in tmp_path.iterdir())
    assert after_files == before_files, (
        "読み取り専用のはずの操作でファイルが新規生成された（-shm/-wal等）。"
        f" 前: {before_files} / 後: {after_files}"
    )
