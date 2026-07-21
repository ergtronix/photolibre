import unicodedata
from pathlib import Path

# macOSは":"をSMB/exFAT等の非HFS系ファイルシステムへ書き出す際、
# 私用領域文字U+F022に自動置換する（実データで確認済みの挙動）。
_MACOS_COLON_SUBSTITUTE = ""


def _candidate_names(part: str) -> list[str]:
    names = [part, unicodedata.normalize("NFC", part)]
    if ":" in part:
        names.append(part.replace(":", _MACOS_COLON_SUBSTITUTE))
    return names


def resolve_normalized_path(root: Path, relative_path: Path | str) -> Path | None:
    """rootを起点にrelative_pathを解決する。

    Mac（HFS+/APFS）由来のパス文字列は次の点でWindows側の実ファイル名と
    食い違うことがある:
    - Unicode正規化形式がNFDになりやすい（NFC等の実ファイル名と不一致）
    - ":"を含む場合、macOSがSMB/exFAT等へ書き出す際に私用領域文字U+F022へ
      自動置換する

    セグメントごとに、完全一致→NFC正規化一致→コロン置換一致の順で
    ディレクトリエントリを探す。どのセグメントも見つからない場合はNoneを返す。
    """
    current = Path(root)
    for part in Path(relative_path).parts:
        candidate = current / part
        if candidate.exists():
            current = candidate
            continue

        if not current.is_dir():
            return None

        targets = {unicodedata.normalize("NFC", name) for name in _candidate_names(part)}
        match = None
        for entry in current.iterdir():
            if unicodedata.normalize("NFC", entry.name) in targets:
                match = entry
                break

        if match is None:
            return None
        current = match

    return current
