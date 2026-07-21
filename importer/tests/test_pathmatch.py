import unicodedata
from pathlib import Path

from photolibre_importer.pathmatch import resolve_normalized_path

# 「が」= NFC単体合字(U+304C) / NFD分解形(か+濁点 U+304B U+3099)
NFC_GA = unicodedata.normalize("NFC", "が")
NFD_GA = unicodedata.normalize("NFD", "が")

# macOSが":"をSMB/exFAT等の非HFS系ファイルシステム向けに自動置換する私用領域文字
MACOS_COLON_SUBSTITUTE = ""


def test_resolve_normalized_path_finds_exact_match_directly(tmp_path):
    target = tmp_path / "2008" / "file.jpg"
    target.parent.mkdir(parents=True)
    target.write_bytes(b"data")

    resolved = resolve_normalized_path(tmp_path, target.relative_to(tmp_path))

    assert resolved == target


def test_resolve_normalized_path_matches_across_nfd_nfc_difference(tmp_path):
    # ディスク上の実フォルダ名はNFC形式
    real_dir = tmp_path / f"2016{NFC_GA}っこう"
    real_dir.mkdir()
    real_file = real_dir / "IMG_0001.jpg"
    real_file.write_bytes(b"data")

    # AlbumData.xml由来の相対パスはNFD形式（正規化形式が異なる）
    requested_relpath = tmp_path.joinpath(f"2016{NFD_GA}っこう", "IMG_0001.jpg").relative_to(tmp_path)

    resolved = resolve_normalized_path(tmp_path, requested_relpath)

    assert resolved == real_file
    assert resolved.exists()


def test_resolve_normalized_path_returns_none_when_truly_missing(tmp_path):
    tmp_path.joinpath("2008").mkdir()

    resolved = resolve_normalized_path(tmp_path, "2008/does_not_exist.jpg")

    assert resolved is None


def test_resolve_normalized_path_returns_none_when_parent_dir_missing(tmp_path):
    resolved = resolve_normalized_path(tmp_path, "nonexistent_dir/file.jpg")

    assert resolved is None


def test_resolve_normalized_path_matches_macos_colon_substitution(tmp_path):
    # macOSは":"を含むファイル名をSMB/exFAT等の非HFS系ファイルシステムへ
    # 書き出す際、私用領域文字U+F022に自動置換する（実データで確認済み。
    # AlbumData.xml上は"2016:07:31"だが実ファイルシステム上は
    # "20160731"になっていた）。
    folder_name = f"2016{MACOS_COLON_SUBSTITUTE}07{MACOS_COLON_SUBSTITUTE}31"
    real_dir = tmp_path / "2016" / folder_name
    real_dir.mkdir(parents=True)
    real_file = real_dir / "IMG_2339.JPG"
    real_file.write_bytes(b"data")

    requested_relpath = Path("2016") / "2016:07:31" / "IMG_2339.JPG"

    resolved = resolve_normalized_path(tmp_path, requested_relpath)

    assert resolved == real_file
