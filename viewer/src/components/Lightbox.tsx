import { useEffect, useState } from "react";

import { readPhotoDataUrl } from "../lib/api";
import type { Photo } from "../lib/types";

interface LightboxProps {
  photos: Photo[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export function Lightbox({ photos, currentIndex, onClose, onNavigate }: LightboxProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const photo = photos[currentIndex];

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    if (!photo) {
      return;
    }
    readPhotoDataUrl(photo.filepath).then((url) => {
      if (!cancelled) {
        setDataUrl(url);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [photo]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      } else if (event.key === "ArrowRight" && currentIndex < photos.length - 1) {
        onNavigate(currentIndex + 1);
      } else if (event.key === "ArrowLeft" && currentIndex > 0) {
        onNavigate(currentIndex - 1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, photos.length, onClose, onNavigate]);

  if (!photo) {
    return null;
  }

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={photo.title ?? photo.filename}>
      <button type="button" className="lightbox__close" aria-label="閉じる" onClick={onClose}>
        ×
      </button>

      {currentIndex > 0 && (
        <button
          type="button"
          className="lightbox__prev"
          aria-label="前の写真"
          onClick={() => onNavigate(currentIndex - 1)}
        >
          ‹
        </button>
      )}

      <div className="lightbox__content">
        {dataUrl ? (
          <img src={dataUrl} alt={photo.title ?? photo.filename} />
        ) : (
          <div className="lightbox__loading">読み込み中...</div>
        )}
        <p className="lightbox__caption">{photo.title ?? photo.filename}</p>
      </div>

      {currentIndex < photos.length - 1 && (
        <button
          type="button"
          className="lightbox__next"
          aria-label="次の写真"
          onClick={() => onNavigate(currentIndex + 1)}
        >
          ›
        </button>
      )}
    </div>
  );
}
