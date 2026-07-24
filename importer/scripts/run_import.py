"""Source A/Bの実データをarchive.dbへ統合する実行スクリプト（TASK-051）。

Source A/B原本（apple_photos_raw配下）には一切書き込み・削除を行わない。
実行前後で原本ツリーのハッシュスナップショットを比較し、読み取り専用が
守られていることを検証する。
"""

import argparse
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from photolibre_importer.albums import reconcile_albums
from photolibre_importer.dedup import quarantine_duplicates
from photolibre_importer.guard import assert_tree_unchanged, snapshot_tree
from photolibre_importer.hashing import hash_file
from photolibre_importer.integrate import (
    finalize_duplicate,
    link_album_photo,
    merge_albums,
    record_album,
    record_source_a_photo,
    record_source_b_photo,
)
from photolibre_importer.layout import place_photo
from photolibre_importer.pathmatch import resolve_normalized_path
from photolibre_importer.schema import create_schema
from photolibre_importer.source_a import (
    parse_source_a_photo,
    read_export_paths,
    read_photoinfo_records,
)
from photolibre_importer.source_b import (
    load_album_data,
    parse_albums,
    parse_photos,
    parse_rolls,
)


def import_source_a(source_a_root: Path, archive_root: Path, conn: sqlite3.Connection, imported_at: str):
    db_path = source_a_root / ".osxphotos_export.db"
    records = read_photoinfo_records(db_path)
    export_paths = read_export_paths(db_path)

    path_to_photo_id: dict[Path, str] = {}
    skipped = []

    for record in records:
        uuid = record["uuid"]
        relpaths = export_paths.get(uuid)
        if not relpaths:
            skipped.append((uuid, "no export_data row"))
            continue

        photo = parse_source_a_photo(record, relpaths, source_a_root)
        resolved_source = resolve_normalized_path(
            source_a_root, photo.source_path.relative_to(source_a_root)
        )
        if resolved_source is None:
            skipped.append((uuid, f"missing file: {photo.source_path}"))
            continue

        dest = place_photo(resolved_source, archive_root, photo.date_taken)
        sha = hash_file(dest)
        relfilepath = str(dest.relative_to(archive_root))
        record_source_a_photo(conn, photo, filepath=relfilepath, sha256=sha, imported_at=imported_at)
        path_to_photo_id[dest] = photo.uuid

        for album_name in photo.albums:
            album_id = record_album(conn, name=album_name, source="source_a")
            link_album_photo(conn, album_id=album_id, photo_id=photo.uuid)

    return path_to_photo_id, skipped


def import_source_b(source_b_root: Path, archive_root: Path, conn: sqlite3.Connection, imported_at: str):
    plist = load_album_data(source_b_root / "AlbumData.xml")
    photos = parse_photos(plist)
    albums = parse_albums(plist)
    rolls = parse_rolls(plist)

    path_to_photo_id: dict[Path, str] = {}
    skipped = []
    fallback_used = []

    for photo in photos:
        # SOURCEBへのrsyncコピー時に "Originals/" の中身を直下へ展開したため
        # （末尾スラッシュ付きrsync）、実ファイルはsource_b_root直下にある。
        # AlbumData.xml由来のパスはMac(NFD正規化)、実ファイルはNFC等の場合があるため
        # 正規化を吸収して解決する。
        resolved_source = resolve_normalized_path(source_b_root, photo.relative_path)
        if resolved_source is None:
            skipped.append((photo.photo_id, f"missing file: {source_b_root / photo.relative_path}"))
            continue

        if photo.used_original_fallback:
            fallback_used.append(photo.photo_id)

        dest = place_photo(resolved_source, archive_root, photo.date_taken)
        sha = hash_file(dest)
        relfilepath = str(dest.relative_to(archive_root))
        photo_id = record_source_b_photo(conn, photo, filepath=relfilepath, sha256=sha, imported_at=imported_at)
        path_to_photo_id[dest] = photo_id

    for album in albums:
        album_id = record_album(conn, name=album.name, source="source_b")
        for pid in album.photo_ids:
            photo_id = f"source_b-{pid}"
            if conn.execute("SELECT 1 FROM photos WHERE id = ?", (photo_id,)).fetchone():
                link_album_photo(conn, album_id=album_id, photo_id=photo_id)

    for roll in rolls:
        album_id = record_album(conn, name=roll.name, source="source_b")
        for pid in roll.photo_ids:
            photo_id = f"source_b-{pid}"
            if conn.execute("SELECT 1 FROM photos WHERE id = ?", (photo_id,)).fetchone():
                link_album_photo(conn, album_id=album_id, photo_id=photo_id)

    return path_to_photo_id, skipped, [a.name for a in albums] + [r.name for r in rolls], fallback_used


def apply_dedup(archive_root: Path, conn: sqlite3.Connection, path_to_photo_id: dict[Path, str]):
    all_files = [p for p in (archive_root / "photos").rglob("*") if p.is_file()]
    duplicate_records = quarantine_duplicates(all_files, archive_root)

    str_lookup = {str(k): v for k, v in path_to_photo_id.items()}
    debug_samples = []

    for record in duplicate_records:
        canonical_id = path_to_photo_id.get(record.canonical_path)
        duplicate_id = path_to_photo_id.get(record.original_source_path)
        if canonical_id is None or duplicate_id is None:
            if len(debug_samples) < 20:
                debug_samples.append(
                    {
                        "canonical_path": repr(record.canonical_path),
                        "canonical_id_direct": canonical_id,
                        "canonical_id_via_str": str_lookup.get(str(record.canonical_path)),
                        "original_source_path": repr(record.original_source_path),
                        "duplicate_id_direct": duplicate_id,
                        "duplicate_id_via_str": str_lookup.get(str(record.original_source_path)),
                    }
                )
            continue
        finalize_duplicate(
            conn,
            canonical_photo_id=canonical_id,
            duplicate_photo_id=duplicate_id,
            duplicate_relpath=str(record.duplicate_path.relative_to(archive_root)),
            original_source_relpath=str(record.original_source_path.relative_to(archive_root)),
            sha256=record.sha256,
            detected_at=record.detected_at,
        )

    if debug_samples:
        import json

        debug_path = archive_root / "_dedup_lookup_failures_debug.json"
        with open(debug_path, "w", encoding="utf-8") as f:
            json.dump(debug_samples, f, ensure_ascii=False, indent=2, default=str)
        print(f"[DEBUG] lookup失敗サンプルを書き出し: {debug_path}")

    return duplicate_records


def apply_album_review(conn: sqlite3.Connection, source_a_album_names: list[str], source_b_album_names: list[str], created_at: str):
    result = reconcile_albums(source_a_album_names, source_b_album_names)

    for a_name, b_name in result.merged:
        canonical = conn.execute(
            "SELECT id FROM albums WHERE name = ? AND source = 'source_a'", (a_name,)
        ).fetchone()
        duplicate = conn.execute(
            "SELECT id FROM albums WHERE name = ? AND source = 'source_b'", (b_name,)
        ).fetchone()
        if canonical and duplicate:
            merge_albums(conn, canonical_album_id=canonical[0], duplicate_album_id=duplicate[0])

    for a_name, b_name in result.review:
        conn.execute(
            """
            INSERT INTO album_review (source_a_album_name, source_b_album_name, reason, status, created_at)
            VALUES (?, ?, ?, 'pending', ?)
            """,
            (a_name, b_name, "部分一致（あいまい）のため自動統合せず", created_at),
        )
    conn.commit()
    return result


def main():
    parser = argparse.ArgumentParser(description="Source A/B実データをarchive.dbへ統合する")
    parser.add_argument("--source-a", type=Path, required=True)
    parser.add_argument("--source-b", type=Path, required=True)
    parser.add_argument("--archive-root", type=Path, required=True)
    args = parser.parse_args()

    before_a = snapshot_tree(args.source_a)
    before_b = snapshot_tree(args.source_b)

    args.archive_root.mkdir(parents=True, exist_ok=True)
    db_path = args.archive_root / "archive.db"
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    create_schema(conn)

    imported_at = datetime.now(timezone.utc).isoformat()

    print("=== Source A 取り込み中 ===")
    path_to_id_a, skipped_a = import_source_a(args.source_a, args.archive_root, conn, imported_at)
    print(f"Source A: {len(path_to_id_a)}件取り込み、{len(skipped_a)}件スキップ")

    print("=== Source B 取り込み中 ===")
    path_to_id_b, skipped_b, source_b_album_names, fallback_used = import_source_b(
        args.source_b, args.archive_root, conn, imported_at
    )
    print(f"Source B: {len(path_to_id_b)}件取り込み、{len(skipped_b)}件スキップ")
    print(
        f"Source B: うち{len(fallback_used)}件はiPhoto内で編集済み(Modified/)のため、"
        f"未編集オリジナル(OriginalPath)で代用（Modified/自体はUSBコピー対象外だったため）"
    )

    path_to_photo_id = {**path_to_id_a, **path_to_id_b}

    print("=== 重複検出・退避中 ===")
    duplicate_records = apply_dedup(args.archive_root, conn, path_to_photo_id)
    print(f"重複検出: {len(duplicate_records)}件を_duplicates/へ退避")

    print("=== アルバム突合中 ===")
    source_a_album_names = [
        row[0] for row in conn.execute("SELECT name FROM albums WHERE source = 'source_a'").fetchall()
    ]
    reconciliation = apply_album_review(conn, source_a_album_names, source_b_album_names, imported_at)
    print(
        f"アルバム突合: 完全一致統合候補{len(reconciliation.merged)}件、"
        f"要確認{len(reconciliation.review)}件をalbum_reviewへ記録"
    )

    conn.close()

    print("=== 読み取り専用の検証 ===")
    assert_tree_unchanged(args.source_a, before_a)
    assert_tree_unchanged(args.source_b, before_b)
    print("Source A/B原本は変更されていません。")

    if skipped_a:
        print(f"\n[Source Aスキップ一覧（先頭10件）]")
        for uuid, reason in skipped_a[:10]:
            print(f"  {uuid}: {reason}")
    if skipped_b:
        print(f"\n[Source Bスキップ一覧（先頭10件）]")
        for pid, reason in skipped_b[:10]:
            print(f"  {pid}: {reason}")


if __name__ == "__main__":
    main()
