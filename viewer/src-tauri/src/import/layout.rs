use std::path::{Path, PathBuf};

/// Python版`importer/src/photolibre_importer/layout.py`と同じ配置規則:
/// `{archive_root}/photos/{YYYY}/{MM}/{filename}`。年月が不明（date_takenが
/// 無い）場合は`{archive_root}/photos/unknown/{filename}`。
#[derive(Debug, thiserror::Error)]
pub enum LayoutError {
    #[error("コピー元ファイルを読み込めません: {0}")]
    Io(#[from] std::io::Error),
}

/// date_takenの年月から配置先ディレクトリを含む完全パスを組み立てる
/// （ファイル名衝突の解決は行わない。それは`resolve_collision`が担当する）。
/// date_takenがNoneの場合は`photos/unknown/`配下に置く。
pub fn build_destination(
    archive_root: &Path,
    date_taken: Option<(i32, u32)>,
    filename: &str,
) -> PathBuf {
    match date_taken {
        None => archive_root.join("photos").join("unknown").join(filename),
        Some((year, month)) => archive_root
            .join("photos")
            .join(format!("{year:04}"))
            .join(format!("{month:02}"))
            .join(filename),
    }
}

/// destが既に存在する場合、ファイル名に`_{連番}`を付与して衝突しない
/// パスを探す（Python版`_resolve_collision`と同じロジック）。
fn resolve_collision(dest: &Path) -> PathBuf {
    if !dest.exists() {
        return dest.to_path_buf();
    }

    let stem = dest
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let extension = dest.extension().map(|e| e.to_string_lossy().to_string());
    let parent = dest.parent().map(PathBuf::from).unwrap_or_default();

    let mut counter = 1;
    loop {
        let candidate_name = match &extension {
            Some(ext) => format!("{stem}_{counter}.{ext}"),
            None => format!("{stem}_{counter}"),
        };
        let candidate = parent.join(candidate_name);
        if !candidate.exists() {
            return candidate;
        }
        counter += 1;
    }
}

/// source_pathをarchive_root配下の適切な位置へコピーする。
/// - 配置先はdate_takenの年月から決定する（不明ならphotos/unknown/）
/// - ファイル名が衝突する場合は`_{連番}`を付与する
/// - コピー元ファイルは一切変更・削除しない（既存の非破壊原則を継承）
/// - コピー後、コピー元のmtimeをコピー先にも設定する
///   （`std::fs::copy`はメタデータの一部しか保持しないため、明示的に
///   `set_modified`で上書きする）
///
/// 戻り値は実際にコピーされた先のパス。
pub fn place_photo(
    source_path: &Path,
    archive_root: &Path,
    date_taken: Option<(i32, u32)>,
) -> Result<PathBuf, LayoutError> {
    let filename = source_path
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_default();

    let dest = build_destination(archive_root, date_taken, &filename);
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let dest = resolve_collision(&dest);

    std::fs::copy(source_path, &dest)?;

    let source_metadata = std::fs::metadata(source_path)?;
    if let Ok(modified) = source_metadata.modified() {
        // Windowsではset_modified()にFILE_WRITE_ATTRIBUTES権限が必要なため、
        // 読み取り専用で開くFile::open()ではなくOpenOptions::write(true)で開く。
        let dest_file = std::fs::OpenOptions::new().write(true).open(&dest)?;
        dest_file.set_modified(modified)?;
    }

    Ok(dest)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_destination_uses_year_month_subdirectories() {
        let root = Path::new("E:/archive");

        let dest = build_destination(root, Some((2024, 3)), "photo.jpg");

        assert_eq!(dest, PathBuf::from("E:/archive/photos/2024/03/photo.jpg"));
    }

    #[test]
    fn build_destination_pads_single_digit_month() {
        let root = Path::new("E:/archive");

        let dest = build_destination(root, Some((2024, 1)), "photo.jpg");

        assert_eq!(dest, PathBuf::from("E:/archive/photos/2024/01/photo.jpg"));
    }

    #[test]
    fn build_destination_uses_unknown_when_date_taken_is_none() {
        let root = Path::new("E:/archive");

        let dest = build_destination(root, None, "photo.jpg");

        assert_eq!(dest, PathBuf::from("E:/archive/photos/unknown/photo.jpg"));
    }

    #[test]
    fn place_photo_copies_file_into_year_month_directory() {
        let tmp = tempfile::tempdir().unwrap();
        let archive_root = tmp.path().join("archive");
        let source = tmp.path().join("IMG_0001.jpg");
        std::fs::write(&source, b"photo bytes").unwrap();

        let dest = place_photo(&source, &archive_root, Some((2023, 7))).unwrap();

        assert_eq!(
            dest,
            archive_root
                .join("photos")
                .join("2023")
                .join("07")
                .join("IMG_0001.jpg")
        );
        assert!(dest.exists());
        assert_eq!(std::fs::read(&dest).unwrap(), b"photo bytes");
        // 元ファイルは変更・削除されない
        assert!(source.exists());
        assert_eq!(std::fs::read(&source).unwrap(), b"photo bytes");
    }

    #[test]
    fn place_photo_places_unknown_date_under_unknown_directory() {
        let tmp = tempfile::tempdir().unwrap();
        let archive_root = tmp.path().join("archive");
        let source = tmp.path().join("IMG_0002.jpg");
        std::fs::write(&source, b"photo bytes").unwrap();

        let dest = place_photo(&source, &archive_root, None).unwrap();

        assert_eq!(
            dest,
            archive_root
                .join("photos")
                .join("unknown")
                .join("IMG_0002.jpg")
        );
    }

    #[test]
    fn place_photo_resolves_filename_collision_with_suffix() {
        let tmp = tempfile::tempdir().unwrap();
        let archive_root = tmp.path().join("archive");
        let source1 = tmp.path().join("IMG_0003.jpg");
        std::fs::write(&source1, b"first").unwrap();
        let source2_dir = tmp.path().join("second");
        std::fs::create_dir_all(&source2_dir).unwrap();
        let source2 = source2_dir.join("IMG_0003.jpg");
        std::fs::write(&source2, b"second").unwrap();

        let dest1 = place_photo(&source1, &archive_root, Some((2024, 5))).unwrap();
        let dest2 = place_photo(&source2, &archive_root, Some((2024, 5))).unwrap();

        assert_ne!(dest1, dest2);
        assert_eq!(
            dest2,
            archive_root
                .join("photos")
                .join("2024")
                .join("05")
                .join("IMG_0003_1.jpg")
        );
        assert_eq!(std::fs::read(&dest1).unwrap(), b"first");
        assert_eq!(std::fs::read(&dest2).unwrap(), b"second");
    }

    #[test]
    fn place_photo_resolves_multiple_collisions_incrementally() {
        let tmp = tempfile::tempdir().unwrap();
        let archive_root = tmp.path().join("archive");
        for i in 0..3 {
            let dir = tmp.path().join(format!("src{i}"));
            std::fs::create_dir_all(&dir).unwrap();
            let source = dir.join("dup.jpg");
            std::fs::write(&source, format!("content-{i}")).unwrap();
            place_photo(&source, &archive_root, Some((2024, 5))).unwrap();
        }

        let base = archive_root.join("photos").join("2024").join("05");
        assert!(base.join("dup.jpg").exists());
        assert!(base.join("dup_1.jpg").exists());
        assert!(base.join("dup_2.jpg").exists());
    }

    #[test]
    fn place_photo_preserves_source_modification_time() {
        let tmp = tempfile::tempdir().unwrap();
        let archive_root = tmp.path().join("archive");
        let source = tmp.path().join("IMG_0010.jpg");
        std::fs::write(&source, b"photo bytes").unwrap();

        // 意図的に過去の日時へ変更し、コピー後も保持されるか検証する。
        let past = std::time::SystemTime::now() - std::time::Duration::from_secs(3600 * 24 * 30);
        let file = std::fs::OpenOptions::new()
            .write(true)
            .open(&source)
            .unwrap();
        file.set_modified(past).unwrap();

        let dest = place_photo(&source, &archive_root, Some((2024, 6))).unwrap();

        let source_mtime = std::fs::metadata(&source).unwrap().modified().unwrap();
        let dest_mtime = std::fs::metadata(&dest).unwrap().modified().unwrap();
        assert_eq!(source_mtime, dest_mtime);
    }

    #[test]
    fn place_photo_returns_error_when_source_does_not_exist() {
        let tmp = tempfile::tempdir().unwrap();
        let archive_root = tmp.path().join("archive");
        let missing = tmp.path().join("does_not_exist.jpg");

        let result = place_photo(&missing, &archive_root, Some((2024, 1)));

        assert!(result.is_err());
    }
}
