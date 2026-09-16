use std::path::PathBuf;
use std::sync::Mutex;

use super::dedup::DedupStatus;
use super::metadata::PhotoMetadata;
use super::scan::MediaKind;

/// スキャン（ハッシュ計算・メタデータ抽出・重複判定まで完了済み）の
/// 1件分の結果。プレビュー画面での表示、および確定（コミット）時に
/// 再スキャンせずそのまま使うためのデータ。
#[derive(Debug, Clone, PartialEq)]
pub struct PendingImportItem {
    pub source_path: PathBuf,
    pub kind: MediaKind,
    pub sha256: String,
    pub metadata: PhotoMetadata,
    pub dedup_status: DedupStatus,
}

/// スキャン開始時に選択されたフォルダと、スキャン結果一式を保持する。
/// C-3（Tauriコマンド層）で`scan_import_source_command`が生成し、
/// `commit_import_command`がこれを読み出してコピー・DB挿入を行う想定
/// （プレビューからコミットまでの間、ユーザーが選んだフォルダを
/// 再スキャンせずに済ませるための状態保持）。
#[derive(Debug, Clone, PartialEq)]
pub struct PendingImport {
    pub source_folder: PathBuf,
    pub items: Vec<PendingImportItem>,
}

/// Tauriの`State`として`.manage()`登録するためのラッパー。
/// `ArchiveState`（`commands.rs`）と同じ「Mutex<Option<T>>」の形に揃えている。
///
/// この段階（C-1、TASK-380）では型定義のみを行い、`lib.rs`の`.manage()`への
/// 登録はC-3（Tauriコマンド層）で行う。
pub struct ImportState(pub Mutex<Option<PendingImport>>);

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_item() -> PendingImportItem {
        PendingImportItem {
            source_path: PathBuf::from("D:/DCIM/100CANON/IMG_0001.JPG"),
            kind: MediaKind::Photo,
            sha256: "abc123".to_string(),
            metadata: PhotoMetadata::default(),
            dedup_status: DedupStatus::New,
        }
    }

    #[test]
    fn import_state_starts_empty() {
        let state = ImportState(Mutex::new(None));

        let guard = state.0.lock().unwrap();

        assert!(guard.is_none());
    }

    #[test]
    fn import_state_can_hold_a_pending_import() {
        let pending = PendingImport {
            source_folder: PathBuf::from("D:/DCIM"),
            items: vec![sample_item()],
        };
        let state = ImportState(Mutex::new(Some(pending.clone())));

        let guard = state.0.lock().unwrap();

        assert_eq!(guard.as_ref(), Some(&pending));
    }

    #[test]
    fn import_state_can_be_replaced_after_being_set() {
        let state = ImportState(Mutex::new(Some(PendingImport {
            source_folder: PathBuf::from("D:/old"),
            items: vec![],
        })));

        {
            let mut guard = state.0.lock().unwrap();
            *guard = Some(PendingImport {
                source_folder: PathBuf::from("D:/new"),
                items: vec![sample_item()],
            });
        }

        let guard = state.0.lock().unwrap();
        assert_eq!(
            guard.as_ref().unwrap().source_folder,
            PathBuf::from("D:/new")
        );
        assert_eq!(guard.as_ref().unwrap().items.len(), 1);
    }

    #[test]
    fn import_state_can_be_cleared_after_commit() {
        let state = ImportState(Mutex::new(Some(PendingImport {
            source_folder: PathBuf::from("D:/DCIM"),
            items: vec![sample_item()],
        })));

        {
            let mut guard = state.0.lock().unwrap();
            *guard = None;
        }

        let guard = state.0.lock().unwrap();
        assert!(guard.is_none());
    }
}
