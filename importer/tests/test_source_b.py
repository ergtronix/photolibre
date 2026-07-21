import plistlib
from datetime import datetime, timezone
from pathlib import Path

from photolibre_importer.source_b import (
    SourceBAlbum,
    SourceBPhoto,
    SourceBRoll,
    load_album_data,
    mac_timestamp_to_datetime,
    parse_albums,
    parse_keywords,
    parse_photos,
    parse_rolls,
    relative_originals_path,
)

SAMPLE_PLIST = {
    "Application Version": "7.1.5 (378)",
    "Archive Path": "/Users/kh/Pictures/iPhoto Library",
    "List of Albums": [
        {"AlbumId": 999000, "AlbumName": "写真", "Master": True, "KeyList": ["1", "2"], "PhotoCount": 2},
        {"AlbumId": 1, "AlbumName": "旅行", "KeyList": ["1"], "PhotoCount": 1},
    ],
    "List of Rolls": [
        {"RollID": 100, "RollName": "2008年5月", "KeyList": ["1", "2"], "PhotoCount": 2},
    ],
    "List of Keywords": {"2": "_Favorite_"},
    "Master Image List": {
        "1": {
            "MediaType": "Image",
            "Caption": "旅行の写真",
            "Comment": None,
            "Rating": 5,
            "Roll": 100,
            "DateAsTimerInterval": 0.0,  # 2001-01-01T00:00:00 UTC
            "ImagePath": "/Users/kh/Pictures/iPhoto Library/Originals/2008/05/IMG_0001.jpg",
        },
        "2": {
            "MediaType": "Image",
            "Caption": None,
            "Comment": None,
            "Rating": 0,
            "Roll": 100,
            "DateAsTimerInterval": 100.0,
            "ImagePath": "/Users/kh/Pictures/iPhoto Library/Originals/2008/05/IMG_0002.jpg",
            "Keywords": ["2"],
        },
    },
}


def test_mac_timestamp_to_datetime_converts_epoch_zero():
    result = mac_timestamp_to_datetime(0.0)
    assert result == datetime(2001, 1, 1, tzinfo=timezone.utc)


def test_mac_timestamp_to_datetime_handles_none():
    assert mac_timestamp_to_datetime(None) is None


def test_relative_originals_path_extracts_path_after_originals():
    path = relative_originals_path(
        "/Users/kh/Pictures/iPhoto Library/Originals/2016/20000730誕生日/SL019_0006.jpg"
    )
    assert path == Path("2016/20000730誕生日/SL019_0006.jpg")


def test_parse_albums_excludes_master_pseudo_album():
    albums = parse_albums(SAMPLE_PLIST)
    assert len(albums) == 1
    assert albums[0] == SourceBAlbum(album_id="1", name="旅行", photo_ids=["1"])


def test_parse_rolls_returns_all_rolls():
    rolls = parse_rolls(SAMPLE_PLIST)
    assert rolls == [SourceBRoll(roll_id="100", name="2008年5月", photo_ids=["1", "2"])]


def test_parse_keywords_returns_id_to_name_mapping():
    assert parse_keywords(SAMPLE_PLIST) == {"2": "_Favorite_"}


def test_parse_photos_maps_core_fields_and_defaults_missing_keywords():
    photos = parse_photos(SAMPLE_PLIST)
    assert len(photos) == 2

    photo_1 = next(p for p in photos if p.photo_id == "1")
    assert photo_1.relative_path == Path("2008/05/IMG_0001.jpg")
    assert photo_1.caption == "旅行の写真"
    assert photo_1.rating == 5
    assert photo_1.roll_id == "100"
    assert photo_1.date_taken == datetime(2001, 1, 1, tzinfo=timezone.utc)
    assert photo_1.keywords == []  # Keywordsフィールドが存在しない場合は空リスト

    photo_2 = next(p for p in photos if p.photo_id == "2")
    assert photo_2.keywords == ["2"]


def test_load_album_data_reads_plist_file_readonly(tmp_path):
    # 実際のiPhoto plistはNone値を持つキー自体が省略されるため、
    # plistlib.dumpで書き出し可能な最小構成で検証する。
    plist_safe_content = {
        "Application Version": "7.1.5 (378)",
        "Archive Path": "/Users/kh/Pictures/iPhoto Library",
    }
    xml_path = tmp_path / "AlbumData.xml"
    with open(xml_path, "wb") as f:
        plistlib.dump(plist_safe_content, f)
    before = xml_path.read_bytes()

    data = load_album_data(xml_path)

    assert data["Application Version"] == "7.1.5 (378)"
    assert xml_path.read_bytes() == before  # 読み取り専用であること
