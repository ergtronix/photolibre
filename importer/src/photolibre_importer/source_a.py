import json
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

_VIDEO_SUFFIXES = {".mov", ".mp4"}


@dataclass(frozen=True)
class SourceAPhoto:
    uuid: str
    filename: str
    source_path: Path
    derivative_paths: list[Path]
    media_type: str  # 'photo' / 'video' / 'live_photo'
    date_taken: datetime | None
    date_added: datetime | None
    favorite: bool
    hidden: bool
    title: str | None
    description: str | None
    latitude: float | None
    longitude: float | None
    width: int | None
    height: int | None
    filesize: int | None
    keywords: list[str] = field(default_factory=list)
    persons: list[str] = field(default_factory=list)
    albums: list[str] = field(default_factory=list)
    live_photo_video_path: Path | None = None


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value)


def _select_primary_and_derivatives(
    original_filename: str, candidate_relpaths: list[str]
) -> tuple[str, list[str]]:
    matches = [p for p in candidate_relpaths if Path(p).name.lower() == original_filename.lower()]
    primary = matches[0] if matches else candidate_relpaths[0]
    derivatives = [p for p in candidate_relpaths if p != primary]
    return primary, derivatives


def parse_source_a_photo(
    record: dict, candidate_relpaths: list[str], export_root: Path
) -> SourceAPhoto:
    original_filename = record.get("original_filename") or record["filename"]
    primary_relpath, derivative_relpaths = _select_primary_and_derivatives(
        original_filename, candidate_relpaths
    )

    is_movie = bool(record.get("ismovie"))
    is_live_photo = bool(record.get("live_photo"))
    media_type = "video" if is_movie else "live_photo" if is_live_photo else "photo"

    live_photo_video_path = None
    if is_live_photo:
        for relpath in derivative_relpaths:
            if Path(relpath).suffix.lower() in _VIDEO_SUFFIXES:
                live_photo_video_path = export_root / relpath
                break

    return SourceAPhoto(
        uuid=record["uuid"],
        filename=original_filename,
        source_path=export_root / primary_relpath,
        derivative_paths=[export_root / p for p in derivative_relpaths],
        media_type=media_type,
        date_taken=_parse_datetime(record.get("date")),
        date_added=_parse_datetime(record.get("date_added")),
        favorite=bool(record.get("favorite")),
        hidden=bool(record.get("hidden")),
        title=record.get("title"),
        description=record.get("description"),
        latitude=record.get("latitude"),
        longitude=record.get("longitude"),
        width=record.get("width"),
        height=record.get("height"),
        filesize=record.get("original_filesize"),
        keywords=list(record.get("keywords") or []),
        persons=list(record.get("persons") or []),
        albums=list(record.get("albums") or []),
        live_photo_video_path=live_photo_video_path,
    )


def _readonly_connection(db_path: Path) -> sqlite3.Connection:
    uri = f"file:{Path(db_path).as_posix()}?mode=ro"
    return sqlite3.connect(uri, uri=True)


def read_photoinfo_records(db_path: Path) -> list[dict]:
    conn = _readonly_connection(db_path)
    try:
        rows = conn.execute("SELECT photoinfo FROM photoinfo").fetchall()
    finally:
        conn.close()
    return [json.loads(row[0]) for row in rows]


def read_export_paths(db_path: Path) -> dict[str, list[str]]:
    conn = _readonly_connection(db_path)
    try:
        rows = conn.execute("SELECT uuid, filepath FROM export_data").fetchall()
    finally:
        conn.close()

    paths: dict[str, list[str]] = {}
    for uuid, filepath in rows:
        paths.setdefault(uuid, []).append(filepath)
    return paths
