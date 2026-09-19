import { useEffect, useState } from "react";

import { getImportPreviewThumbnail } from "../lib/api";
import type { ImportPreviewItem } from "../lib/types";

interface ImportPreviewThumbnailProps {
  item: ImportPreviewItem;
  isSelected: boolean;
  onToggleSelect: (sourcePath: string) => void;
}

const ESTIMATED_DATE_REASON =
  "EXIFに撮影日時が無いため、ファイルの更新日時から推定しています";

/** `aria-describedby`で参照するためのDOM id。`sourcePath`はコロン・
 * バックスラッシュ等を含み得るため、id属性として安全な文字だけに変換する。 */
function toDomId(prefix: string, sourcePath: string): string {
  return `${prefix}-${sourcePath.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
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
  // TASK-384（C-5）完了条件2: 撮影日時がEXIFから取得できず、ファイルのmtimeで
  // 代用した推定値であることを視覚的に区別できるようにする。
  const isEstimatedDate = item.dateSource === "estimated";
  const estimatedDateDescriptionId = toDomId("import-estimated-date", item.sourcePath);
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
        aria-describedby={isEstimatedDate ? estimatedDateDescriptionId : undefined}
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
      {(isDuplicate || isEstimatedDate) && (
        <span className="import-preview-thumbnail__badges">
          {isDuplicate && <span className="import-preview-thumbnail__badge">重複</span>}
          {isEstimatedDate && (
            <span
              className="import-preview-thumbnail__badge import-preview-thumbnail__badge--estimated"
              title={ESTIMATED_DATE_REASON}
            >
              推定日時
            </span>
          )}
        </span>
      )}
      {isEstimatedDate && (
        // react-reviewer指摘（TASK-384 C-5差し戻しM4）: 理由の説明を`title`
        // 属性のみに頼ると、キーボード操作者や一部のスクリーンリーダー利用者に
        // 届かない。チェックボックスの`aria-describedby`から参照される、
        // 視覚的には隠すが読み上げ可能なテキストとして提供する。
        <span id={estimatedDateDescriptionId} className="visually-hidden">
          {ESTIMATED_DATE_REASON}
        </span>
      )}
    </label>
  );
}
