import shutil
from datetime import datetime
from pathlib import Path


def build_destination(archive_root: Path, date_taken: datetime | None, filename: str) -> Path:
    if date_taken is None:
        return archive_root / "photos" / "unknown" / filename
    year = f"{date_taken.year:04d}"
    month = f"{date_taken.month:02d}"
    return archive_root / "photos" / year / month / filename


def _resolve_collision(dest: Path) -> Path:
    if not dest.exists():
        return dest
    stem, suffix = dest.stem, dest.suffix
    counter = 1
    while True:
        candidate = dest.with_name(f"{stem}_{counter}{suffix}")
        if not candidate.exists():
            return candidate
        counter += 1


def place_photo(source_path: Path, archive_root: Path, date_taken: datetime | None) -> Path:
    dest = build_destination(archive_root, date_taken, source_path.name)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest = _resolve_collision(dest)
    shutil.copy2(source_path, dest)
    return dest
