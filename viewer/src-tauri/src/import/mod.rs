//! カメラ/スマホ取り込み機能（TASK-053）のバックエンド基盤モジュール群。
//!
//! この段階（C-1、TASK-380）では、DB書き込み・Tauriコマンド登録・
//! フロントエンドUIには一切接続しない。各サブモジュールは`cargo test`で
//! 単体検証できる独立したロジックとしてのみ実装する。次段階（C-2〜）で
//! `db::queries`やTauriコマンド層と接続する。
//!
//! C-2/C-3でqueries.rs・コマンド層と接続するまでの間、pub use先が
//! どこからも使われないため一時的にunused_imports警告を抑制する。
#![allow(unused_imports)]

mod dedup;
mod hash;
mod layout;
mod metadata;
mod scan;
mod state;

pub use dedup::{classify_batch, load_known_hashes, DedupError, DedupStatus};
pub use hash::{hash_file, HashError};
pub use layout::{build_destination, place_photo, LayoutError};
pub use metadata::{read_metadata, DateSource, PhotoMetadata};
pub use scan::{scan_folder, MediaKind, ScannedFile};
pub use state::{ImportState, PendingImport, PendingImportItem};
