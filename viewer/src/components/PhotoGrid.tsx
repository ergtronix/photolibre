import { useState } from "react";
import { Grid, type CellComponentProps } from "react-window";

import { PhotoThumbnail } from "./PhotoThumbnail";
import type { Photo } from "../lib/types";

interface PhotoGridProps {
  photos: Photo[];
  onSelect: (index: number) => void;
  photoVersions: Record<string, number>;
}

const TARGET_CELL_SIZE = 160;
const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 600;

interface CellProps {
  photos: Photo[];
  columnCount: number;
  onSelect: (index: number) => void;
  photoVersions: Record<string, number>;
}

function PhotoGridCell({
  columnIndex,
  rowIndex,
  style,
  ariaAttributes,
  photos,
  columnCount,
  onSelect,
  photoVersions,
}: CellComponentProps<CellProps>) {
  const index = rowIndex * columnCount + columnIndex;
  const photo = photos[index];

  if (!photo) {
    return <div style={style} {...ariaAttributes} />;
  }

  // 手動回転を行うとphotoVersionsの値が増え、keyが変わることで
  // PhotoThumbnailを再マウントし、更新後のサムネイルを取得し直させる。
  const version = photoVersions[photo.id] ?? 0;

  return (
    <div style={style} {...ariaAttributes}>
      <PhotoThumbnail key={`${photo.id}:${version}`} photo={photo} onClick={() => onSelect(index)} />
    </div>
  );
}

export function PhotoGrid({ photos, onSelect, photoVersions }: PhotoGridProps) {
  const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });

  if (photos.length === 0) {
    return <p className="photo-grid__empty">写真が見つかりませんでした。</p>;
  }

  const columnCount = Math.max(1, Math.floor(size.width / TARGET_CELL_SIZE));
  const columnWidth = size.width / columnCount;
  const rowCount = Math.ceil(photos.length / columnCount);

  return (
    <Grid
      className="photo-grid"
      aria-label="写真一覧"
      cellComponent={PhotoGridCell}
      cellProps={{ photos, columnCount, onSelect, photoVersions }}
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
