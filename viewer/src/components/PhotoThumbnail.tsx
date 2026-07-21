import { useEffect, useState } from "react";

import { readPhotoDataUrl } from "../lib/api";
import type { Photo } from "../lib/types";

interface PhotoThumbnailProps {
  photo: Photo;
  onClick: () => void;
}

export function PhotoThumbnail({ photo, onClick }: PhotoThumbnailProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    setFailed(false);

    readPhotoDataUrl(photo.filepath)
      .then((url) => {
        if (!cancelled) {
          setDataUrl(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [photo.filepath]);

  return (
    <button
      type="button"
      className="photo-thumbnail"
      onClick={onClick}
      aria-label={photo.title ?? photo.filename}
    >
      {failed ? (
        <div className="photo-thumbnail__error">読み込めません</div>
      ) : dataUrl ? (
        <img src={dataUrl} alt={photo.title ?? photo.filename} loading="lazy" />
      ) : (
        <div className="photo-thumbnail__loading" />
      )}
      {photo.favorite && <span className="photo-thumbnail__favorite">★</span>}
    </button>
  );
}
