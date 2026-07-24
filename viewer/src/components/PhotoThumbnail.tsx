import { useEffect, useState } from "react";

import { getThumbnailDataUrl } from "../lib/api";
import type { Photo } from "../lib/types";
import { useInViewport } from "../lib/useInViewport";

interface PhotoThumbnailProps {
  photo: Photo;
  onClick: () => void;
}

export function PhotoThumbnail({ photo, onClick }: PhotoThumbnailProps) {
  const [ref, isVisible] = useInViewport<HTMLButtonElement>();
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    let cancelled = false;
    setDataUrl(null);
    setFailed(false);

    getThumbnailDataUrl(photo.id, photo.filepath)
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
  }, [isVisible, photo.id, photo.filepath]);

  return (
    <button
      ref={ref}
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
      {photo.albumNames && photo.albumNames.length > 0 && (
        <span className="photo-thumbnail__albums">{photo.albumNames.join(" / ")}</span>
      )}
    </button>
  );
}
