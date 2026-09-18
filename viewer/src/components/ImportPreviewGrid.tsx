import { useState } from "react";
import { Grid, type CellComponentProps } from "react-window";

import { ImportPreviewThumbnail } from "./ImportPreviewThumbnail";
import type { ImportPreviewItem } from "../lib/types";

interface ImportPreviewGridProps {
  items: ImportPreviewItem[];
  selectedSourcePaths: Set<string>;
  onToggleSelect: (sourcePath: string) => void;
}

const TARGET_CELL_SIZE = 160;
const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 400;

interface CellProps {
  items: ImportPreviewItem[];
  columnCount: number;
  selectedSourcePaths: Set<string>;
  onToggleSelect: (sourcePath: string) => void;
}

function ImportPreviewGridCell({
  columnIndex,
  rowIndex,
  style,
  ariaAttributes,
  items,
  columnCount,
  selectedSourcePaths,
  onToggleSelect,
}: CellComponentProps<CellProps>) {
  const index = rowIndex * columnCount + columnIndex;
  const item = items[index];

  if (!item) {
    return <div style={style} {...ariaAttributes} />;
  }

  return (
    <div style={style} {...ariaAttributes}>
      <ImportPreviewThumbnail
        item={item}
        isSelected={selectedSourcePaths.has(item.sourcePath)}
        onToggleSelect={onToggleSelect}
      />
    </div>
  );
}

/** 取り込みプレビュー用の仮想スクロールグリッド。既存`PhotoGrid`と同じ
 * react-windowパターンを踏襲しつつ、DB由来の`Photo`型には依存しない
 * `ImportPreviewItem`を扱う（完了条件）。 */
export function ImportPreviewGrid({
  items,
  selectedSourcePaths,
  onToggleSelect,
}: ImportPreviewGridProps) {
  const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });

  if (items.length === 0) {
    return (
      <p className="import-preview-grid__empty">
        取り込み対象の写真/動画が見つかりませんでした。
      </p>
    );
  }

  const columnCount = Math.max(1, Math.floor(size.width / TARGET_CELL_SIZE));
  const columnWidth = size.width / columnCount;
  const rowCount = Math.ceil(items.length / columnCount);

  return (
    <Grid
      className="import-preview-grid"
      aria-label="取り込みプレビュー"
      cellComponent={ImportPreviewGridCell}
      cellProps={{ items, columnCount, selectedSourcePaths, onToggleSelect }}
      columnCount={columnCount}
      columnWidth={columnWidth}
      rowCount={rowCount}
      rowHeight={columnWidth}
      defaultWidth={DEFAULT_WIDTH}
      defaultHeight={DEFAULT_HEIGHT}
      overscanCount={2}
      onResize={(nextSize) => setSize(nextSize)}
    />
  );
}
