from pathlib import Path

from photolibre_importer.dedup import find_duplicate_groups, quarantine_duplicates


def _make_file(path: Path, content: bytes) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return path


def test_find_duplicate_groups_groups_identical_content_files(tmp_path):
    a = _make_file(tmp_path / "a.heic", b"same content")
    b = _make_file(tmp_path / "b.heic", b"same content")
    c = _make_file(tmp_path / "c.heic", b"different content")

    groups = find_duplicate_groups([a, b, c])

    assert len(groups) == 1
    (only_group,) = groups.values()
    assert set(only_group) == {a, b}


def test_find_duplicate_groups_returns_empty_when_all_unique(tmp_path):
    a = _make_file(tmp_path / "a.heic", b"content A")
    b = _make_file(tmp_path / "b.heic", b"content B")

    assert find_duplicate_groups([a, b]) == {}


def test_quarantine_duplicates_moves_extras_and_keeps_one_canonical(tmp_path):
    archive_root = tmp_path / "archive"
    photos_dir = archive_root / "photos" / "2020" / "01"
    a = _make_file(photos_dir / "IMG_0001.heic", b"same content")
    b = _make_file(photos_dir / "IMG_0001_1.heic", b"same content")

    records = quarantine_duplicates([a, b], archive_root)

    # 正本1つは元の場所に残り、もう1つは_duplicates/へ退避される
    remaining = [p for p in (a, b) if p.exists()]
    assert len(remaining) == 1

    duplicates_dir = archive_root / "_duplicates"
    quarantined = list(duplicates_dir.rglob("*.heic"))
    assert len(quarantined) == 1
    assert quarantined[0].read_bytes() == b"same content"


def test_quarantine_duplicates_never_deletes_data(tmp_path):
    archive_root = tmp_path / "archive"
    photos_dir = archive_root / "photos" / "2020" / "01"
    a = _make_file(photos_dir / "x.heic", b"dup")
    b = _make_file(photos_dir / "y.heic", b"dup")

    quarantine_duplicates([a, b], archive_root)

    duplicates_dir = archive_root / "_duplicates"
    total_files_after = len(list(photos_dir.glob("*.heic"))) + len(
        list(duplicates_dir.rglob("*.heic"))
    )
    assert total_files_after == 2  # 削除されず、退避されただけ


def test_quarantine_duplicates_leaves_unique_files_untouched(tmp_path):
    archive_root = tmp_path / "archive"
    photos_dir = archive_root / "photos" / "2020" / "01"
    unique = _make_file(photos_dir / "unique.heic", b"one of a kind")

    records = quarantine_duplicates([unique], archive_root)

    assert unique.exists()
    assert records == []
    assert not (archive_root / "_duplicates").exists() or not list(
        (archive_root / "_duplicates").rglob("*")
    )


def test_quarantine_duplicates_returns_records_with_canonical_relationship(tmp_path):
    archive_root = tmp_path / "archive"
    photos_dir = archive_root / "photos" / "2020" / "01"
    a = _make_file(photos_dir / "IMG_0001.heic", b"same content")
    b = _make_file(photos_dir / "IMG_0001_1.heic", b"same content")

    records = quarantine_duplicates([a, b], archive_root)

    assert len(records) == 1
    record = records[0]
    assert record.sha256
    assert record.detected_at
    assert record.canonical_path in (a, b)
    assert record.duplicate_path != record.canonical_path
    assert record.original_source_path in (a, b)
