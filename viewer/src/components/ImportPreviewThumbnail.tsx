import { useEffect, useState } from "react";

import { getImportPreviewThumbnail } from "../lib/api";
import type { ImportPreviewItem } from "../lib/types";

interface ImportPreviewThumbnailProps {
  item: ImportPreviewItem;
  isSelected: boolean;
  onToggleSelect: (sourcePath: string) => void;
}

/** プレビュー段階（まだarchive.dbに属さない元ファイル）の1件分の表示。
 * 既存`PhotoThumbnail`とは異なりDB由来の`Photo`には依存しない
 * （完了条件: プレビューグリッドは別型を使う）。クリック/選択はチェックボックスで
 * 行う（`<label>`で全体を包み、カード全体のクリックでも切り替わるようにする）。 */
export function ImportPreviewThumbnail({
  item,
  isSelected,
  onToggleSelect,
}: ImportPreviewThumbnailProps) {
  const isVideo = item.kind === "video";
  const isDuplicate = item.dedupStatus.status !== "new";
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (isVideo) {
      return;
    }

    let cancelled = false;
    setDataUrl(null);
    setFailed(false);

    getImportPreviewThumbnail(item.sourcePath)
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
  }, [isVideo, item.sourcePath]);

  const className = [
    "import-preview-thumbnail",
    isSelected ? "import-preview-thumbnail--selected" : "",
    isDuplicate ? "import-preview-thumbnail--duplicate" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <label className={className}>
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => onToggleSelect(item.sourcePath)}
        aria-label={item.filename}
      />
      {isVideo ? (
        <div className="import-preview-thumbnail__video">
          <span className="import-preview-thumbnail__video-icon">▶</span>
          <span className="import-preview-thumbnail__video-label">動画</span>
        </div>
      ) : failed ? (
        <div className="import-preview-thumbnail__error">読み込めません</div>
      ) : dataUrl ? (
        <img src={dataUrl} alt={item.filename} loading="lazy" />
      ) : (
        <div className="import-preview-thumbnail__loading" />
      )}
      <span className="import-preview-thumbnail__filename">{item.filename}</span>
      {isDuplicate && <span className="import-preview-thumbnail__badge">重複</span>}
    </label>
  );
}
