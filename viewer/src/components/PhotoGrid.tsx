import { PhotoThumbnail } from "./PhotoThumbnail";
import type { Photo } from "../lib/types";

interface PhotoGridProps {
  photos: Photo[];
  onSelect: (index: number) => void;
}

export function PhotoGrid({ photos, onSelect }: PhotoGridProps) {
  if (photos.length === 0) {
    return <p className="photo-grid__empty">写真が見つかりませんでした。</p>;
  }

  return (
    <div className="photo-grid" role="list" aria-label="写真一覧">
      {photos.map((photo, index) => (
        <div role="listitem" key={photo.id}>
          <PhotoThumbnail photo={photo} onClick={() => onSelect(index)} />
        </div>
      ))}
    </div>
  );
}
