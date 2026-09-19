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

// `ScanOutcome`・`scan_folder`はどちらも`scan.rs`内の単体テストからしか
// 参照されない（`commands.rs`は`scan_folder_with_skipped`の戻り値を
// 型名を書かずにフィールド分解して使うのみ、`scan_folder`自体はTASK-384
// でコマンド層が`scan_folder_with_skipped`に切り替わって以降、本番コードから
// 参照されなくなった）。実際に使われない再エクスポートを`#[allow(unused_imports)]`
// で隠して残すのはYAGNI違反（rust-reviewer指摘、TASK-384 C-5差し戻し）のため、
// `import`モジュールの公開APIからは削除する。
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
