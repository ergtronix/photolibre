import { useEffect, useRef, useState, type MouseEvent, type WheelEvent } from "react";

import { getPhotoRotation, readPhotoDataUrl, setPhotoRotation } from "../lib/api";
import type { Photo } from "../lib/types";
import { zoomFromWheelDelta, zoomStep, zoomToPoint, type Point } from "../lib/zoom";

interface LightboxProps {
  photos: Photo[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onRotated: (photoId: string) => void;
}

const ZERO_PAN: Point = { x: 0, y: 0 };

function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

export function Lightbox({ photos, currentIndex, onClose, onNavigate, onRotated }: LightboxProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>(ZERO_PAN);
  const contentRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startMouse: Point; startPan: Point } | null>(null);
  const photo = photos[currentIndex];

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    setRotation(0);
    setZoom(1);
    setPan(ZERO_PAN);
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

  const containerCenter = (): Point => {
    const rect = contentRef.current?.getBoundingClientRect();
    if (!rect) {
      return ZERO_PAN;
    }
    return { x: rect.width / 2, y: rect.height / 2 };
  };

  const zoomAt = (nextZoom: number, pointer: Point) => {
    setPan((currentPan) => zoomToPoint(currentPan, zoom, nextZoom, pointer, containerCenter()));
    setZoom(nextZoom);
  };

  const handleZoomButton = (direction: 1 | -1) => {
    zoomAt(zoomStep(zoom, direction), containerCenter());
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey) {
      return;
    }
    event.preventDefault();
    const rect = contentRef.current?.getBoundingClientRect();
    const pointer: Point = rect
      ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
      : containerCenter();
    zoomAt(zoomFromWheelDelta(zoom, event.deltaY), pointer);
  };

  const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    dragRef.current = { startMouse: { x: event.clientX, y: event.clientY }, startPan: pan };
  };

  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    setPan({
      x: drag.startPan.x + (event.clientX - drag.startMouse.x),
      y: drag.startPan.y + (event.clientY - drag.startMouse.y),
    });
  };

  const stopDragging = () => {
    dragRef.current = null;
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
        <button type="button" aria-label="縮小" onClick={() => handleZoomButton(-1)}>
          −
        </button>
        <button type="button" aria-label="拡大" onClick={() => handleZoomButton(1)}>
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

      <div
        ref={contentRef}
        className="lightbox__content"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDragging}
        onMouseLeave={stopDragging}
      >
        {dataUrl ? (
          <img
            src={dataUrl}
            alt={photo.title ?? photo.filename}
            draggable={false}
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
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
