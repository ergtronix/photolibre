import { useEffect, useState } from "react";
import type { DragEvent, MouseEvent } from "react";

import { getThumbnailDataUrl, openPhotoFile } from "../lib/api";
import { encodePhotoIds, PHOTO_IDS_MIME } from "../lib/dnd";
import type { Photo } from "../lib/types";
import { useInViewport } from "../lib/useInViewport";

interface PhotoThumbnailProps {
  photo: Photo;
  onClick: () => void;
  /** 複数選択中の写真ID集合。Ctrl+クリックでの選択状態表示と、
   * ドラッグ開始時にどの写真をまとめて運ぶかの判定に使う。 */
  selectedPhotoIds: Set<string>;
  onToggleSelect: (photoId: string) => void;
}

export function PhotoThumbnail({
  photo,
  onClick,
  selectedPhotoIds,
  onToggleSelect,
}: PhotoThumbnailProps) {
  const isVideo = photo.mediaType === "video";
  const isSelected = selectedPhotoIds.has(photo.id);
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

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (isVideo) {
      // 動画のインライン再生・コマ抽出サムネイルは実装コストが大きいため、
      // OS標準の動画プレイヤーで開く方針とした（ERGと合意済み）。
      openPhotoFile(photo.filepath);
      return;
    }
    if (event.ctrlKey) {
      onToggleSelect(photo.id);
      return;
    }
    onClick();
  };

  // ドラッグしている写真が選択中に含まれていれば選択全体を、含まれていなければ
  // その1枚だけをドラッグ対象にする（複数選択してのドラッグ&ドロップ分類用）。
  const handleDragStart = (event: DragEvent<HTMLButtonElement>) => {
    const ids = isSelected ? Array.from(selectedPhotoIds) : [photo.id];
    event.dataTransfer.setData(PHOTO_IDS_MIME, encodePhotoIds(ids));
    event.dataTransfer.effectAllowed = "copy";
  };

  const className = isSelected ? "photo-thumbnail photo-thumbnail--selected" : "photo-thumbnail";

  return (
    <button
      ref={ref}
      type="button"
      className={className}
      draggable
      onDragStart={handleDragStart}
      onClick={handleClick}
      aria-label={photo.title ?? photo.filename}
      aria-pressed={isSelected}
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
