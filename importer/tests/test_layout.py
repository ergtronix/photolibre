from datetime import datetime

from photolibre_importer.layout import build_destination, place_photo


def test_build_destination_uses_year_month_from_date_taken(tmp_path):
    dest = build_destination(tmp_path, datetime(2020, 3, 15), "IMG_1234.heic")
    assert dest == tmp_path / "photos" / "2020" / "03" / "IMG_1234.heic"


def test_build_destination_falls_back_to_unknown_when_date_taken_missing(tmp_path):
    dest = build_destination(tmp_path, None, "IMG_9999.heic")
    assert dest == tmp_path / "photos" / "unknown" / "IMG_9999.heic"


def test_place_photo_copies_file_and_leaves_source_untouched(tmp_path):
    source_dir = tmp_path / "source"
    source_dir.mkdir()
    archive_root = tmp_path / "archive"
    source_file = source_dir / "IMG_0001.heic"
    source_file.write_bytes(b"original bytes")

    dest = place_photo(source_file, archive_root, datetime(2019, 7, 1))

    assert dest == archive_root / "photos" / "2019" / "07" / "IMG_0001.heic"
    assert dest.read_bytes() == b"original bytes"
    assert source_file.exists()  # ソースは読み取り専用のまま残ること
    assert source_file.read_bytes() == b"original bytes"


def test_place_photo_creates_parent_directories(tmp_path):
    source_file = tmp_path / "IMG_0002.heic"
    source_file.write_bytes(b"data")
    archive_root = tmp_path / "archive"

    dest = place_photo(source_file, archive_root, datetime(2021, 12, 25))

    assert dest.parent.is_dir()


def test_place_photo_resolves_filename_collision_by_appending_suffix(tmp_path):
    archive_root = tmp_path / "archive"
    existing = archive_root / "photos" / "2020" / "01" / "IMG_0003.heic"
    existing.parent.mkdir(parents=True)
    existing.write_bytes(b"already there")

    source_file = tmp_path / "IMG_0003.heic"
    source_file.write_bytes(b"different content")

    dest = place_photo(source_file, archive_root, datetime(2020, 1, 5))

    assert dest != existing
    assert dest.name == "IMG_0003_1.heic"
    assert dest.read_bytes() == b"different content"
    assert existing.read_bytes() == b"already there"  # 既存ファイルを上書きしないこと
