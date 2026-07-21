import shutil
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from photolibre_importer.hashing import hash_file


@dataclass(frozen=True)
class DuplicateRecord:
    canonical_path: Path
    duplicate_path: Path
    original_source_path: Path
    sha256: str
    detected_at: str


def find_duplicate_groups(file_paths: list[Path]) -> dict[str, list[Path]]:
    by_hash: dict[str, list[Path]] = defaultdict(list)
    for path in file_paths:
        by_hash[hash_file(path)].append(path)
    return {digest: paths for digest, paths in by_hash.items() if len(paths) > 1}


def quarantine_duplicates(
    file_paths: list[Path], archive_root: Path
) -> list[DuplicateRecord]:
    groups = find_duplicate_groups(file_paths)
    duplicates_dir = archive_root / "_duplicates"
    records: list[DuplicateRecord] = []

    for digest, paths in groups.items():
        canonical, *extras = sorted(paths)
        for extra in extras:
            duplicates_dir.mkdir(parents=True, exist_ok=True)
            dest = duplicates_dir / extra.name
            counter = 1
            while dest.exists():
                dest = duplicates_dir / f"{extra.stem}_{counter}{extra.suffix}"
                counter += 1
            shutil.move(str(extra), str(dest))
            records.append(
                DuplicateRecord(
                    canonical_path=canonical,
                    duplicate_path=dest,
                    original_source_path=extra,
                    sha256=digest,
                    detected_at=datetime.now(timezone.utc).isoformat(),
                )
            )

    return records
