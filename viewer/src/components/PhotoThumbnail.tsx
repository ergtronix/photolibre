import { useEffect, useState } from "react";

import { getThumbnailDataUrl, openPhotoFile } from "../lib/api";
import type { Photo } from "../lib/types";
import { useInViewport } from "../lib/useInViewport";

interface PhotoThumbnailProps {
  photo: Photo;
  onClick: () => void;
}

export function PhotoThumbnail({ photo, onClick }: PhotoThumbnailProps) {
  const isVideo = photo.mediaType === "video";
  const [ref, isVisible] = useInViewport<HTMLButtonElement>();
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isVisible || isVideo) {
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
  }, [isVisible, isVideo, photo.id, photo.filepath]);

  const handleClick = () => {
    if (isVideo) {
      // 動画のインライン再生・コマ抽出サムネイルは実装コストが大きいため、
      // OS標準の動画プレイヤーで開く方針とした（ERGと合意済み）。
      openPhotoFile(photo.filepath);
      return;
    }
    onClick();
  };

  return (
    <button
      ref={ref}
      type="button"
      className="photo-thumbnail"
      onClick={handleClick}
      aria-label={photo.title ?? photo.filename}
    >
      {isVideo ? (
        <div className="photo-thumbnail__video">
          <span className="photo-thumbnail__video-icon">▶</span>
          <span className="photo-thumbnail__video-label">動画</span>
        </div>
      ) : failed ? (
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
