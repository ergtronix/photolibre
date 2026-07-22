import { invoke } from "@tauri-apps/api/core";

import type { Album, Photo, PhotoFilter } from "./types";

export async function getArchivePath(): Promise<string | null> {
  return invoke<string | null>("get_archive_path");
}

export async function setArchivePath(path: string): Promise<void> {
  await invoke("set_archive_path", { path });
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

export async function readPhotoDataUrl(relativePath: string): Promise<string> {
  return invoke<string>("read_photo_data_url", { relativePath });
}

export async function getThumbnailDataUrl(photoId: string, relativePath: string): Promise<string> {
  return invoke<string>("get_thumbnail_data_url", { photoId, relativePath });
}
