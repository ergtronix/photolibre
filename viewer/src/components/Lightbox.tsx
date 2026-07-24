import { useEffect, useState, type WheelEvent } from "react";

import { getPhotoRotation, readPhotoDataUrl, setPhotoRotation } from "../lib/api";
import type { Photo } from "../lib/types";
import { zoomFromWheelDelta, zoomStep } from "../lib/zoom";

interface LightboxProps {
  photos: Photo[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onRotated: (photoId: string) => void;
}

function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

export function Lightbox({ photos, currentIndex, onClose, onNavigate, onRotated }: LightboxProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const photo = photos[currentIndex];

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    setRotation(0);
    setZoom(1);
    if (!photo) {
      return;
    }

    getPhotoRotation(photo.id).then((degrees) => {
      if (!cancelled) {
        setRotation(degrees);
      }
    });
    readPhotoDataUrl(photo.id, photo.filepath).then((url) => {
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

  const handleRotate = async (direction: 1 | -1) => {
    const next = normalizeDegrees(rotation + direction * 90);
    await setPhotoRotation(photo.id, next);
    setRotation(next);
    const url = await readPhotoDataUrl(photo.id, photo.filepath);
    setDataUrl(url);
    onRotated(photo.id);
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey) {
      return;
    }
    event.preventDefault();
    setZoom((current) => zoomFromWheelDelta(current, event.deltaY));
  };

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={photo.title ?? photo.filename}>
      <button type="button" className="lightbox__close" aria-label="閉じる" onClick={onClose}>
        ×
      </button>

      <div className="lightbox__toolbar">
        <button type="button" aria-label="反時計回りに回転" onClick={() => handleRotate(-1)}>
          ↺
        </button>
        <button type="button" aria-label="時計回りに回転" onClick={() => handleRotate(1)}>
          ↻
        </button>
        <button type="button" aria-label="縮小" onClick={() => setZoom((z) => zoomStep(z, -1))}>
          −
        </button>
        <button type="button" aria-label="拡大" onClick={() => setZoom((z) => zoomStep(z, 1))}>
          ＋
        </button>
      </div>

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

      <div className="lightbox__content" onWheel={handleWheel}>
        {dataUrl ? (
          <img
            src={dataUrl}
            alt={photo.title ?? photo.filename}
            style={{ transform: `scale(${zoom})` }}
          />
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
