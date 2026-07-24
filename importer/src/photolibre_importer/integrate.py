import re
import sqlite3
import uuid as uuid_module

from photolibre_importer.source_a import SourceAPhoto
from photolibre_importer.source_b import SourceBPhoto

_SOURCE_B_ID_PREFIX = "source_b-"
_SUFFIX_PATTERN = re.compile(r"\s*\(\d+\)\s*$")


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


def _strip_numbering_suffix(name: str) -> str:
    return _SUFFIX_PATTERN.sub("", name).strip()


def find_subset_duplicate_albums(conn: sqlite3.Connection) -> list[tuple[str, str]]:
    """名前が「ベース名」と「ベース名 (N)」の関係にあるアルバム同士のうち、
    写真の中身（sha256の集合）が完全一致または部分集合の関係にあるものを検出する。
    写真の内容が実際に重なっている場合のみを対象とし、名前が似ているだけで
    中身が異なるものは対象外とする（要確認扱いのまま残す）。

    戻り値は (canonical_album_id, duplicate_album_id) のリスト。canonicalは
    より多くの写真を持つ側。写真数が同じ場合は"(N)"が付かない名前を優先する。
    """
    albums = conn.execute("SELECT id, name FROM albums").fetchall()

    groups: dict[str, list[tuple[str, str]]] = {}
    for album_id, name in albums:
        base = _strip_numbering_suffix(name)
        groups.setdefault(base, []).append((album_id, name))

    photo_hashes_by_album: dict[str, set[str]] = {}

    def hashes_for(album_id: str) -> set[str]:
        if album_id not in photo_hashes_by_album:
            rows = conn.execute(
                """
                SELECT p.sha256 FROM photos p
                JOIN album_photos ap ON ap.photo_id = p.id
                WHERE ap.album_id = ?
                """,
                (album_id,),
            ).fetchall()
            photo_hashes_by_album[album_id] = {row[0] for row in rows}
        return photo_hashes_by_album[album_id]

    pairs: list[tuple[str, str]] = []
    for base, entries in groups.items():
        if len(entries) < 2:
            continue

        for i in range(len(entries)):
            for j in range(i + 1, len(entries)):
                id_a, name_a = entries[i]
                id_b, name_b = entries[j]
                hashes_a, hashes_b = hashes_for(id_a), hashes_for(id_b)

                if not hashes_a.issubset(hashes_b) and not hashes_b.issubset(hashes_a):
                    continue  # 中身が食い違う。要確認のまま残す

                if len(hashes_a) > len(hashes_b):
                    canonical, duplicate = id_a, id_b
                elif len(hashes_b) > len(hashes_a):
                    canonical, duplicate = id_b, id_a
                else:
                    # 写真数が同じ場合は"(N)"の付かない名前を正本として優先する
                    if name_a == base:
                        canonical, duplicate = id_a, id_b
                    else:
                        canonical, duplicate = id_b, id_a

                pairs.append((canonical, duplicate))

    return pairs


def merge_albums(conn: sqlite3.Connection, canonical_album_id: str, duplicate_album_id: str) -> None:
    """名称完全一致で同一イベントと確認されたアルバムを統合する。
    duplicate_album_id側の写真の紐付けをcanonical_album_idへ引き継いだ上で、
    duplicate_album_id自体のアルバム行は削除する（写真本体は一切変更しない）。"""
    photo_ids = [
        row[0]
        for row in conn.execute(
            "SELECT photo_id FROM album_photos WHERE album_id = ?", (duplicate_album_id,)
        ).fetchall()
    ]
    for photo_id in photo_ids:
        conn.execute(
            """
            INSERT INTO album_photos (album_id, photo_id)
            VALUES (?, ?)
            ON CONFLICT (album_id, photo_id) DO NOTHING
            """,
            (canonical_album_id, photo_id),
        )

    conn.execute("DELETE FROM album_photos WHERE album_id = ?", (duplicate_album_id,))
    conn.execute("DELETE FROM albums WHERE id = ?", (duplicate_album_id,))
    conn.commit()
