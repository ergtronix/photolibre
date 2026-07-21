from pathlib import Path

from photolibre_importer.hashing import hash_file


def snapshot_tree(root: Path) -> dict[str, str]:
    snapshot = {}
    for path in root.rglob("*"):
        if path.is_file():
            snapshot[str(path.relative_to(root))] = hash_file(path)
    return snapshot


def assert_tree_unchanged(root: Path, before: dict[str, str]) -> None:
    after = snapshot_tree(root)
    assert after == before, (
        f"読み取り専用であるべきツリーが変更されています: {root}\n"
        f"変更前: {before}\n変更後: {after}"
    )
