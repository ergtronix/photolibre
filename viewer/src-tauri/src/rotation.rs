use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// 手動回転の指定は元の写真ファイルを一切書き換えず、
/// archive_root配下の専用ファイルに「photo_id -> 回転角度」として保存する。
fn rotation_store_path(archive_root: &Path) -> PathBuf {
    archive_root.join(".viewer_state").join("rotations.json")
}

/// 任意の角度を0/90/180/270のいずれかに正規化する。
pub fn normalize_degrees(degrees: i32) -> i32 {
    degrees.rem_euclid(360) / 90 * 90
}

fn load_all(archive_root: &Path) -> HashMap<String, i32> {
    let path = rotation_store_path(archive_root);
    let Ok(content) = std::fs::read_to_string(&path) else {
        return HashMap::new();
    };
    serde_json::from_str(&content).unwrap_or_default()
}

fn save_all(archive_root: &Path, overrides: &HashMap<String, i32>) -> std::io::Result<()> {
    let path = rotation_store_path(archive_root);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let content = serde_json::to_string_pretty(overrides).unwrap_or_default();
    std::fs::write(path, content)
}

/// photo_idに対する手動回転の指定角度を返す（未指定なら0）。
pub fn get_rotation(archive_root: &Path, photo_id: &str) -> i32 {
    load_all(archive_root).get(photo_id).copied().unwrap_or(0)
}

/// photo_idの手動回転角度を保存する。degreesが0の場合は指定を取り消す。
pub fn set_rotation(archive_root: &Path, photo_id: &str, degrees: i32) -> std::io::Result<()> {
    let normalized = normalize_degrees(degrees);
    let mut overrides = load_all(archive_root);

    if normalized == 0 {
        overrides.remove(photo_id);
    } else {
        overrides.insert(photo_id.to_string(), normalized);
    }

    save_all(archive_root, &overrides)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_degrees_snaps_to_nearest_multiple_of_90() {
        assert_eq!(normalize_degrees(0), 0);
        assert_eq!(normalize_degrees(90), 90);
        assert_eq!(normalize_degrees(180), 180);
        assert_eq!(normalize_degrees(270), 270);
        assert_eq!(normalize_degrees(360), 0);
        assert_eq!(normalize_degrees(45), 0);
        assert_eq!(normalize_degrees(135), 90);
    }

    #[test]
    fn normalize_degrees_handles_negative_values() {
        assert_eq!(normalize_degrees(-90), 270);
        assert_eq!(normalize_degrees(-180), 180);
    }

    #[test]
    fn get_rotation_returns_zero_when_no_override_exists() {
        let tmp = tempfile::tempdir().unwrap();

        assert_eq!(get_rotation(tmp.path(), "PHOTO-1"), 0);
    }

    #[test]
    fn set_rotation_then_get_rotation_roundtrips() {
        let tmp = tempfile::tempdir().unwrap();

        set_rotation(tmp.path(), "PHOTO-1", 90).unwrap();

        assert_eq!(get_rotation(tmp.path(), "PHOTO-1"), 90);
    }

    #[test]
    fn set_rotation_only_affects_the_specified_photo() {
        let tmp = tempfile::tempdir().unwrap();

        set_rotation(tmp.path(), "PHOTO-1", 90).unwrap();
        set_rotation(tmp.path(), "PHOTO-2", 180).unwrap();

        assert_eq!(get_rotation(tmp.path(), "PHOTO-1"), 90);
        assert_eq!(get_rotation(tmp.path(), "PHOTO-2"), 180);
    }

    #[test]
    fn set_rotation_to_zero_removes_the_override() {
        let tmp = tempfile::tempdir().unwrap();
        set_rotation(tmp.path(), "PHOTO-1", 90).unwrap();

        set_rotation(tmp.path(), "PHOTO-1", 0).unwrap();

        assert_eq!(get_rotation(tmp.path(), "PHOTO-1"), 0);
    }

    #[test]
    fn set_rotation_updates_an_existing_override() {
        let tmp = tempfile::tempdir().unwrap();
        set_rotation(tmp.path(), "PHOTO-1", 90).unwrap();

        set_rotation(tmp.path(), "PHOTO-1", 270).unwrap();

        assert_eq!(get_rotation(tmp.path(), "PHOTO-1"), 270);
    }
}
