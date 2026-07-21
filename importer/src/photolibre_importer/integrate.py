import sqlite3
import uuid as uuid_module

from photolibre_importer.source_a import SourceAPhoto
from photolibre_importer.source_b import SourceBPhoto

_SOURCE_B_ID_PREFIX = "source_b-"


def record_source_a_photo(
    conn: sqlite3.Connection,
    photo: SourceAPhoto,
    filepath: str,
    sha256: str,
    imported_at: str,
) -> None:
    conn.execute(
        """
        INSERT INTO photos (
            id, filename, filepath, media_type, date_taken, date_added,
            latitude, longitude, favorite, hidden, title, description,
            width, height, filesize, sha256, source, imported_at, source_uuid
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'source_a', ?, ?)
        ON CONFLICT (id) DO NOTHING
        """,
        (
            photo.uuid,
            photo.filename,
            filepath,
            photo.media_type,
            photo.date_taken.isoformat() if photo.date_taken else None,
            photo.date_added.isoformat() if photo.date_added else None,
            photo.latitude,
            photo.longitude,
            int(photo.favorite),
            int(photo.hidden),
            photo.title,
            photo.description,
            photo.width,
            photo.height,
            photo.filesize,
            sha256,
            imported_at,
            photo.uuid,
        ),
    )
    conn.commit()


def record_source_b_photo(
    conn: sqlite3.Connection,
    photo: SourceBPhoto,
    filepath: str,
    sha256: str,
    imported_at: str,
) -> str:
    photo_id = f"{_SOURCE_B_ID_PREFIX}{photo.photo_id}"
    conn.execute(
        """
        INSERT INTO photos (
            id, filename, filepath, media_type, date_taken,
            title, description, sha256, source, imported_at, source_uuid
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'source_b', ?, ?)
        ON CONFLICT (id) DO NOTHING
        """,
        (
            photo_id,
            photo.relative_path.name,
            filepath,
            "photo" if (photo.media_type or "").lower() == "image" else "video",
            photo.date_taken.isoformat() if photo.date_taken else None,
            photo.caption,
            photo.comment,
            sha256,
            imported_at,
            photo.photo_id,
        ),
    )
    conn.commit()
    return photo_id


def record_album(conn: sqlite3.Connection, name: str, source: str) -> str:
    existing = conn.execute(
        "SELECT id FROM albums WHERE name = ? AND source = ?", (name, source)
    ).fetchone()
    if existing:
        return existing[0]

    album_id = str(uuid_module.uuid4())
    conn.execute(
        "INSERT INTO albums (id, name, source) VALUES (?, ?, ?)",
        (album_id, name, source),
    )
    conn.commit()
    return album_id


def link_album_photo(conn: sqlite3.Connection, album_id: str, photo_id: str) -> None:
    conn.execute(
        """
        INSERT INTO album_photos (album_id, photo_id)
        VALUES (?, ?)
        ON CONFLICT (album_id, photo_id) DO NOTHING
        """,
        (album_id, photo_id),
    )
    conn.commit()


def finalize_duplicate(
    conn: sqlite3.Connection,
    canonical_photo_id: str,
    duplicate_photo_id: str,
    duplicate_relpath: str,
    original_source_relpath: str,
    sha256: str,
    detected_at: str,
) -> None:
    """重複と判定された写真のphotos行を取り除きつつ、そのアルバム所属を
    正本(canonical)へ引き継ぐ。物理ファイルはarchive/_duplicates/へ既に
    退避済みである前提（削除はしない）。"""
    album_ids = [
        row[0]
        for row in conn.execute(
            "SELECT album_id FROM album_photos WHERE photo_id = ?", (duplicate_photo_id,)
        ).fetchall()
    ]
    for album_id in album_ids:
        conn.execute(
            """
            INSERT INTO album_photos (album_id, photo_id)
            VALUES (?, ?)
            ON CONFLICT (album_id, photo_id) DO NOTHING
            """,
            (album_id, canonical_photo_id),
        )

    conn.execute("DELETE FROM album_photos WHERE photo_id = ?", (duplicate_photo_id,))
    conn.execute("DELETE FROM photos WHERE id = ?", (duplicate_photo_id,))

    conn.execute(
        """
        INSERT INTO duplicates
            (canonical_photo_id, duplicate_path, original_source_path, sha256, detected_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (canonical_photo_id, duplicate_relpath, original_source_relpath, sha256, detected_at),
    )
    conn.commit()
