import plistlib
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path

_MAC_EPOCH_OFFSET_SECONDS = 978307200
_MAC_EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc) + timedelta(
    seconds=_MAC_EPOCH_OFFSET_SECONDS
)


@dataclass(frozen=True)
class SourceBAlbum:
    album_id: str
    name: str
    photo_ids: list[str]


@dataclass(frozen=True)
class SourceBRoll:
    roll_id: str
    name: str
    photo_ids: list[str]


@dataclass(frozen=True)
class SourceBPhoto:
    photo_id: str
    relative_path: Path
    media_type: str | None
    caption: str | None
    comment: str | None
    rating: int | None
    roll_id: str | None
    date_taken: datetime | None
    keywords: list[str] = field(default_factory=list)


def mac_timestamp_to_datetime(value: float | None) -> datetime | None:
    if value is None:
        return None
    return _MAC_EPOCH + timedelta(seconds=value)


def relative_originals_path(image_path: str) -> Path:
    marker = "Originals/"
    index = image_path.index(marker) + len(marker)
    return Path(image_path[index:])


def load_album_data(xml_path: Path) -> dict:
    with open(xml_path, "rb") as f:
        return plistlib.load(f)


def parse_albums(plist: dict) -> list[SourceBAlbum]:
    return [
        SourceBAlbum(
            album_id=str(entry["AlbumId"]),
            name=entry["AlbumName"],
            photo_ids=list(entry.get("KeyList", [])),
        )
        for entry in plist.get("List of Albums", [])
        if not entry.get("Master", False)
    ]


def parse_rolls(plist: dict) -> list[SourceBRoll]:
    return [
        SourceBRoll(
            roll_id=str(entry["RollID"]),
            name=entry["RollName"],
            photo_ids=list(entry.get("KeyList", [])),
        )
        for entry in plist.get("List of Rolls", [])
    ]


def parse_keywords(plist: dict) -> dict[str, str]:
    return dict(plist.get("List of Keywords", {}))


def parse_photos(plist: dict) -> list[SourceBPhoto]:
    photos = []
    for photo_id, entry in plist.get("Master Image List", {}).items():
        roll = entry.get("Roll")
        photos.append(
            SourceBPhoto(
                photo_id=str(photo_id),
                relative_path=relative_originals_path(entry["ImagePath"]),
                media_type=entry.get("MediaType"),
                caption=entry.get("Caption"),
                comment=entry.get("Comment"),
                rating=entry.get("Rating"),
                roll_id=str(roll) if roll is not None else None,
                date_taken=mac_timestamp_to_datetime(entry.get("DateAsTimerInterval")),
                keywords=list(entry.get("Keywords", [])),
            )
        )
    return photos
