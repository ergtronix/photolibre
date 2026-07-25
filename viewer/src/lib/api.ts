import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import type { Album, Photo, PhotoFilter } from "./types";

export async function getArchivePath(): Promise<string | null> {
  return invoke<string | null>("get_archive_path");
}

export async function setArchivePath(path: string): Promise<void> {
  await invoke("set_archive_path", { path });
}

/** フォルダ選択ダイアログを開き、選択されたフォルダをアーカイブとして保存する。
 * キャンセルされた場合はnullを返す。初回設定・変更どちらからも使う共通処理。 */
export async function pickAndSetArchivePath(): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false });
  if (typeof selected !== "string") {
    return null;
  }
  await setArchivePath(selected);
  return selected;
}

export async function listPhotos(filter: PhotoFilter): Promise<Photo[]> {
  return invoke<Photo[]>("list_photos_command", {
    favoriteOnly: filter.favoriteOnly,
    year: filter.year,
    month: filter.month,
    keyword: filter.keyword,
  });
}

export async function listAlbums(): Promise<Album[]> {
  return invoke<Album[]>("list_albums_command");
}

export async function listAlbumPhotos(albumId: string): Promise<Photo[]> {
  return invoke<Photo[]>("list_album_photos_command", { albumId });
}

export async function searchPhotos(query: string): Promise<Photo[]> {
  return invoke<Photo[]>("search_photos_command", { query });
}

export async function readPhotoDataUrl(photoId: string, relativePath: string): Promise<string> {
  return invoke<string>("read_photo_data_url", { photoId, relativePath });
}

export async function getThumbnailDataUrl(photoId: string, relativePath: string): Promise<string> {
  return invoke<string>("get_thumbnail_data_url", { photoId, relativePath });
}

export async function setPhotoRotation(photoId: string, degrees: number): Promise<void> {
  await invoke("set_photo_rotation", { photoId, degrees });
}

export async function getPhotoRotation(photoId: string): Promise<number> {
  return invoke<number>("get_photo_rotation", { photoId });
}

export async function openPhotoFile(relativePath: string): Promise<void> {
  await invoke("open_photo_file", { relativePath });
}

/** どのアルバムにも属さない写真の一覧。「すべての写真」から未分類を探すのは
 * 目視ではほぼ不可能というERGの指摘を受け、専用ビューとして追加した。 */
export async function listUnfiledPhotos(): Promise<Photo[]> {
  return invoke<Photo[]>("list_unfiled_photos_command");
}

export async function countUnfiledPhotos(): Promise<number> {
  return invoke<number>("count_unfiled_photos_command");
}

export async function createAlbum(name: string): Promise<Album> {
  return invoke<Album>("create_album_command", { name });
}

export async function renameAlbum(albumId: string, newName: string): Promise<void> {
  await invoke("rename_album_command", { albumId, newName });
}

/** アルバム新規作成のUndo専用。アプリ上にアルバム削除ボタンは存在しない
 * （危険すぎるためERGの要望により非搭載）。Undoスタックの内部処理からのみ呼ぶ。 */
export async function deleteViewerAlbum(albumId: string): Promise<void> {
  await invoke("delete_viewer_album_command", { albumId });
}

export async function addPhotosToAlbum(albumId: string, photoIds: string[]): Promise<void> {
  await invoke("add_photos_to_album_command", { albumId, photoIds });
}

export async function removePhotoFromAlbum(albumId: string, photoId: string): Promise<void> {
  await invoke("remove_photo_from_album_command", { albumId, photoId });
}

/** 写真を未分類へ移動する（すべてのアルバムから外す）。入れ替え作業のため
 * 一時的に未分類へ戻したいという要望により追加。戻り値は写真IDごとに
 * 外す前に属していたアルバムIDの一覧（Undoで元のアルバムに戻すため）。 */
export async function unfilePhotos(photoIds: string[]): Promise<Record<string, string[]>> {
  return invoke<Record<string, string[]>>("unfile_photos_command", { photoIds });
}
