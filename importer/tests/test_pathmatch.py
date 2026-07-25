import unicodedata
from pathlib import Path

import pytest

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


def test_resolve_normalized_path_rejects_dotdot_traversal(tmp_path):
    # AlbumData.xmlのImagePath等、信頼できない外部データに".."が
    # 含まれていた場合、root外への脱出を許してはならない。
    secret = tmp_path.parent / "secret.txt"
    secret.write_bytes(b"secret")
    (tmp_path / "Originals").mkdir()

    resolved = resolve_normalized_path(tmp_path / "Originals", f"../../{secret.name}")

    assert resolved is None


def test_resolve_normalized_path_still_resolves_a_leading_dot_segment_normally(tmp_path):
    # "."はPath()のパース時に自動的に取り除かれるため、危険ではなく
    # 通常通り解決できる（".."とは異なり明示的な拒否は不要）ことの確認。
    target = tmp_path / "file.jpg"
    target.write_bytes(b"data")

    resolved = resolve_normalized_path(tmp_path, "./file.jpg")

    assert resolved == target


def test_resolve_normalized_path_rejects_result_escaping_root_via_matched_symlink(tmp_path):
    # ".."を挟まない場合でも、マッチしたエントリ自体がroot外を指す
    # シンボリックリンクであれば最終境界チェックで弾く。
    outside_target = tmp_path.parent / "outside_dir"
    outside_target.mkdir()
    (outside_target / "leaked.jpg").write_bytes(b"data")

    root = tmp_path / "Originals"
    root.mkdir()
    symlink_path = root / "escape_link"
    try:
        symlink_path.symlink_to(outside_target, target_is_directory=True)
    except OSError:
        pytest.skip("symlink creation not permitted in this environment")

    resolved = resolve_normalized_path(root, "escape_link/leaked.jpg")

    assert resolved is None
