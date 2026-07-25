export const PHOTO_IDS_MIME = "application/x-photolibre-photo-ids";

export function encodePhotoIds(ids: string[]): string {
  return JSON.stringify(ids);
}

export function decodePhotoIds(data: string): string[] {
  if (!data) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(data);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}
