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
