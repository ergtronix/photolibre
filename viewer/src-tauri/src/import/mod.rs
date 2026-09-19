//! カメラ/スマホ取り込み機能（TASK-053）のバックエンド基盤モジュール群。
//!
//! C-3（TASK-382）でTauriコマンド層（`commands.rs`）・`db::queries`と接続済み。
//! 各サブモジュールは引き続き`cargo test`で単体検証できる独立したロジックとして
//! 実装している。

mod dedup;
mod hash;
mod layout;
mod metadata;
mod scan;
mod state;

pub use dedup::{classify_batch, load_known_hashes, DedupStatus};
pub use hash::hash_file;
pub use layout::{place_photo, LayoutError};
pub use metadata::read_metadata;
pub use scan::{scan_folder_with_skipped, MediaKind, ScannedFile, SkipReason, SkippedFile};

// `ScanOutcome`は`commands.rs`から`scan_folder_with_skipped`の戻り値として
// 直接使われるが、フィールドを分解して使う箇所が多いため型名としての
// 参照頻度は低い。将来の拡張（プレビューDTOへの直接変換等）に備えて残す。
#[allow(unused_imports)]
pub use scan::ScanOutcome;
// TASK-384（C-5）でTauriコマンド層はスキップ理由も必要な`scan_folder_with_skipped`
// を使うようになったため、`scan_folder`自体は本番コードから直接は呼ばれなく
// なった。後方互換の薄いラッパーとして`scan.rs`内に残し、単体テストで
// 引き続き検証しているため、この再エクスポートも維持する。
#[allow(unused_imports)]
pub use scan::scan_folder;
pub use state::{ImportState, PendingImport, PendingImportItem};

// 以下は現時点でTauriコマンド層からは名前で直接参照されないが、`import`モジュールの
// 公開APIとして意味のある型のため残す（将来のC-4フロントエンドUIやエラー詳細表示で
// 使う可能性がある）。個別に`#[allow(unused_imports)]`を付けて警告のみ抑制する。
#[allow(unused_imports)]
pub use dedup::DedupError;
#[allow(unused_imports)]
pub use hash::HashError;
#[allow(unused_imports)]
pub use layout::build_destination;
#[allow(unused_imports)]
pub use metadata::{DateSource, PhotoMetadata};
