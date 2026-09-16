use std::collections::HashMap;
use std::path::{Path, PathBuf};

use rusqlite::Connection;

#[derive(Debug, thiserror::Error)]
pub enum DedupError {
    #[error("archive.dbからsha256一覧を読み込めません: {0}")]
    Db(#[from] rusqlite::Error),
}

/// 重複判定の結果。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DedupStatus {
    /// archive.db・同一バッチのいずれにも存在しない新規ファイル。
    New,
    /// archive.dbに既に取り込み済みの写真と同じ内容（photo_idを保持）。
    DuplicateOfExisting { photo_id: String },
    /// 同一インポートバッチ内で、先に処理した別ファイルと同じ内容
    /// （SDカード内でのファイル二重保存等を検出する）。
    DuplicateWithinBatch { first_seen_path: PathBuf },
}

/// archive.db内の全写真のsha256一覧を、sha256 -> photo_idのマップとして
/// 一括ロードする。インポート開始時に一度だけ呼び出し、以降はメモリ上の
/// このマップと突き合わせることで、候補ファイルごとにDBへ問い合わせる
/// （毎回SELECTする）よりも効率的に重複判定を行う。
pub fn load_known_hashes(conn: &Connection) -> Result<HashMap<String, String>, DedupError> {
    let mut stmt = conn.prepare("SELECT id, sha256 FROM photos")?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>("sha256")?, row.get::<_, String>("id")?))
    })?;

    let mut known = HashMap::new();
    for row in rows {
        let (sha256, photo_id) = row?;
        known.insert(sha256, photo_id);
    }
    Ok(known)
}

/// candidates（走査済みファイルとその内容のsha256のペア）をknown_hashes
/// （archive.db内の既存写真のsha256一覧）と突き合わせ、それぞれの
/// `DedupStatus`を判定する。同一バッチ内での重複（SDカード内の
/// 二重保存ファイル等）も、candidatesを先頭から順に処理することで検出する。
pub fn classify_batch(
    candidates: &[(PathBuf, String)],
    known_hashes: &HashMap<String, String>,
) -> Vec<(PathBuf, DedupStatus)> {
    let mut seen_in_this_batch: HashMap<&str, &Path> = HashMap::new();
    let mut results = Vec::with_capacity(candidates.len());

    for (path, sha256) in candidates {
        let status = if let Some(photo_id) = known_hashes.get(sha256.as_str()) {
            DedupStatus::DuplicateOfExisting {
                photo_id: photo_id.clone(),
            }
        } else if let Some(&first_seen_path) = seen_in_this_batch.get(sha256.as_str()) {
            DedupStatus::DuplicateWithinBatch {
                first_seen_path: first_seen_path.to_path_buf(),
            }
        } else {
            seen_in_this_batch.insert(sha256.as_str(), path.as_path());
            DedupStatus::New
        };
        results.push((path.clone(), status));
    }

    results
}

#[cfg(test)]
mod tests {
    use super::*;

    fn open_test_db_with_photos(entries: &[(&str, &str)]) -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE photos (id TEXT PRIMARY KEY, sha256 TEXT NOT NULL);")
            .unwrap();
        for (id, sha256) in entries {
            conn.execute(
                "INSERT INTO photos (id, sha256) VALUES (?1, ?2)",
                rusqlite::params![id, sha256],
            )
            .unwrap();
        }
        conn
    }

    #[test]
    fn load_known_hashes_returns_empty_map_for_empty_archive() {
        let conn = open_test_db_with_photos(&[]);

        let known = load_known_hashes(&conn).unwrap();

        assert!(known.is_empty());
    }

    #[test]
    fn load_known_hashes_maps_sha256_to_photo_id() {
        let conn = open_test_db_with_photos(&[("PHOTO-1", "hash-a"), ("PHOTO-2", "hash-b")]);

        let known = load_known_hashes(&conn).unwrap();

        assert_eq!(known.get("hash-a"), Some(&"PHOTO-1".to_string()));
        assert_eq!(known.get("hash-b"), Some(&"PHOTO-2".to_string()));
        assert_eq!(known.len(), 2);
    }

    #[test]
    fn load_known_hashes_returns_error_when_photos_table_is_missing() {
        let conn = Connection::open_in_memory().unwrap();

        let result = load_known_hashes(&conn);

        assert!(result.is_err());
    }

    #[test]
    fn classify_batch_marks_unmatched_files_as_new() {
        let known = HashMap::new();
        let candidates = vec![(PathBuf::from("a.jpg"), "hash-new".to_string())];

        let results = classify_batch(&candidates, &known);

        assert_eq!(results, vec![(PathBuf::from("a.jpg"), DedupStatus::New)]);
    }

    #[test]
    fn classify_batch_detects_duplicate_of_existing_archive_photo() {
        let mut known = HashMap::new();
        known.insert("hash-existing".to_string(), "PHOTO-99".to_string());
        let candidates = vec![(PathBuf::from("dup.jpg"), "hash-existing".to_string())];

        let results = classify_batch(&candidates, &known);

        assert_eq!(
            results,
            vec![(
                PathBuf::from("dup.jpg"),
                DedupStatus::DuplicateOfExisting {
                    photo_id: "PHOTO-99".to_string()
                }
            )]
        );
    }

    #[test]
    fn classify_batch_detects_duplicate_within_the_same_batch() {
        let known = HashMap::new();
        let candidates = vec![
            (PathBuf::from("first.jpg"), "hash-x".to_string()),
            (PathBuf::from("second.jpg"), "hash-x".to_string()),
        ];

        let results = classify_batch(&candidates, &known);

        assert_eq!(results[0], (PathBuf::from("first.jpg"), DedupStatus::New));
        assert_eq!(
            results[1],
            (
                PathBuf::from("second.jpg"),
                DedupStatus::DuplicateWithinBatch {
                    first_seen_path: PathBuf::from("first.jpg")
                }
            )
        );
    }

    #[test]
    fn classify_batch_prefers_existing_archive_match_over_within_batch_match() {
        // 同一バッチ内で複数回登場するハッシュが、かつarchive.dbにも
        // 既に存在する場合は、全てDuplicateOfExisting判定になるべき
        // （バッチ内重複よりアーカイブとの重複を優先して報告する）。
        let mut known = HashMap::new();
        known.insert("hash-existing".to_string(), "PHOTO-1".to_string());
        let candidates = vec![
            (PathBuf::from("a.jpg"), "hash-existing".to_string()),
            (PathBuf::from("b.jpg"), "hash-existing".to_string()),
        ];

        let results = classify_batch(&candidates, &known);

        for (_, status) in &results {
            assert_eq!(
                status,
                &DedupStatus::DuplicateOfExisting {
                    photo_id: "PHOTO-1".to_string()
                }
            );
        }
    }

    #[test]
    fn classify_batch_handles_empty_candidates() {
        let known = HashMap::new();
        let candidates: Vec<(PathBuf, String)> = Vec::new();

        let results = classify_batch(&candidates, &known);

        assert!(results.is_empty());
    }
}
