export interface Photo {
  id: string;
  filename: string;
  filepath: string;
  mediaType: string;
  dateTaken: string | null;
  dateAdded: string | null;
  latitude: number | null;
  longitude: number | null;
  favorite: boolean;
  hidden: boolean;
  title: string | null;
  description: string | null;
  width: number | null;
  height: number | null;
  source: string;
  /** 検索結果でのみ設定される、この写真が属するアルバム名の一覧。 */
  albumNames: string[] | null;
}

export interface Album {
  id: string;
  name: string;
  albumType: string;
  source: string;
  photoCount: number;
}

/** 左ペインでの表示対象。"すべての写真"・"未分類"・個別アルバム・
 * "取り込み結果"の4種類を排他的に表現する（string|nullの組み合わせだと
 * 不正な状態を作れてしまうため）。"importResult"は取り込みウィザード完了後、
 * 「取り込んだ写真を見る」で遷移する一時的なビュー（サイドバーには対応する
 * 項目を持たない、`photoIds`で指定された写真だけを表示する）。 */
export type AlbumSelection =
  | { kind: "all" }
  | { kind: "unfiled" }
  | { kind: "album"; albumId: string }
  | { kind: "importResult"; photoIds: string[] };

export interface PhotoFilter {
  favoriteOnly: boolean;
  year: number | null;
  month: number | null;
  keyword: string | null;
}

export const EMPTY_FILTER: PhotoFilter = {
  favoriteOnly: false,
  year: null,
  month: null,
  keyword: null,
};

// --- デジカメ/SDカード取り込み機能（TASK-053、C-4: フロントエンドUI） ---
//
// DB由来の`Photo`とは別の型群。プレビュー段階のアイテムはまだarchive.dbに
// 属さない（コピー前の元ファイル）ため、意図的に型を分けている
// （完了条件: 「プレビューグリッドはDB由来のPhoto型には依存しない別型を使う」）。
// Rust側`commands.rs`の`ImportPreview`/`ImportPreviewItem`/`ImportCommitResult`
// （`#[serde(rename_all = "camelCase")]`）とフィールド名を一致させている。

export type ImportMediaKind = "photo" | "video";

/** Rust側`DedupStatusDto`（`#[serde(tag = "status", rename_all = "snake_case")]`）
 * に対応する判別可能ユニオン。`status`フィールドで判別する。 */
export type ImportDedupStatus =
  | { status: "new" }
  | { status: "duplicate_of_existing"; photoId: string }
  | { status: "duplicate_within_batch"; firstSeenPath: string };

/** `dateTaken`がEXIFの実際の撮影日時（`"captured"`）か、ファイルのmtimeに
 * よる推定（`"estimated"`）かを示す。動画は撮影日時を解析できないため
 * 常に`"estimated"`になる（TASK-384、C-5完了条件2）。`?`はRust側`Option`が
 * `null`にシリアライズされる既存テストフィクスチャとの互換のため。 */
export type ImportDateSource = "captured" | "estimated";

export interface ImportPreviewItem {
  sourcePath: string;
  filename: string;
  kind: ImportMediaKind;
  dedupStatus: ImportDedupStatus;
  dateTaken: string | null;
  dateSource?: ImportDateSource | null;
}

/** 非対応形式（HEIC/RAW等）のため取り込み候補から除外されたファイル
 * （TASK-384、C-5完了条件1）。 */
export type ImportSkipReason = "unsupported_format";

export interface ImportSkippedItem {
  filename: string;
  reason: ImportSkipReason;
}

export interface ImportPreview {
  newCount: number;
  duplicateCount: number;
  errorCount: number;
  items: ImportPreviewItem[];
  /** 非対応形式のためスキップされた件数。既存のテストフィクスチャ・
   * モックとの互換のため任意（未指定時は0件として扱う）。 */
  skippedCount?: number;
  skippedItems?: ImportSkippedItem[];
}

export interface ImportCommitResult {
  insertedCount: number;
  /** 実際に挿入された写真のID一覧。「取り込んだ写真を見る」で
   * `listPhotosByIds`にそのまま渡す。 */
  insertedPhotoIds: string[];
  duplicateCount: number;
  failedFiles: string[];
}

export type ImportProgressPhase = "scanning" | "copying";

/** `import-progress`イベント（`useImportProgress`）のペイロード。 */
export interface ImportProgress {
  phase: ImportProgressPhase;
  current: number;
  total: number;
  currentFile: string;
}
