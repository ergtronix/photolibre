use std::path::{Path, PathBuf};

use walkdir::WalkDir;

/// 走査対象として分類されたファイルの種別。
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MediaKind {
    Photo,
    Video,
}

/// 走査で見つかった写真/動画候補ファイル。
#[derive(Debug, Clone, PartialEq)]
pub struct ScannedFile {
    pub path: PathBuf,
    pub kind: MediaKind,
}

/// 写真として取り込み対象とする拡張子（`image`クレートでデコード可能なもの）。
///
/// `.heic`/`.heif`は対象外: 2026-09-16の実装時検証で、本クレートが依存する
/// `image = "0.25"`（追加のheif/libheif系featureは指定していない）には
/// `image::ImageFormat::Heic`というバリアント自体が存在せず
/// （`image::ImageFormat::Heic`と書くとコンパイルエラーになることを確認済み）、
/// `image::ImageFormat::from_extension("heic")`もNoneを返す。つまり拡張子解決の
/// 問題ではなく、デコーダそのものが存在しないためHEICは構造的にデコード不可能。
/// よってv1では対象外とし、将来libheif系クレートを追加する場合に再検討する。
///
/// RAW拡張子（cr2/nef/dng/arw等）も同様に`image`クレートがデコーダを持たず
/// （`from_extension`はいずれもNoneを返すことを確認済み）、対象外とする。
const PHOTO_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif"];

/// 動画として取り込み対象とする拡張子。`mime.rs`が既に扱っている
/// mov/mp4に加え、一般的なスマホ・デジカメの動画拡張子を含める。
const VIDEO_EXTENSIONS: &[&str] = &["mov", "mp4", "m4v", "avi"];

/// 拡張子（ドット無し、大文字小文字は問わない）から`MediaKind`を判定する。
/// 対象外の拡張子（RAW、HEIC、ドキュメント類等）の場合はNoneを返す。
fn classify_extension(extension: &str) -> Option<MediaKind> {
    let lower = extension.to_lowercase();
    if PHOTO_EXTENSIONS.contains(&lower.as_str()) {
        Some(MediaKind::Photo)
    } else if VIDEO_EXTENSIONS.contains(&lower.as_str()) {
        Some(MediaKind::Video)
    } else {
        None
    }
}

/// folder_path配下を再帰的に走査し、写真/動画候補ファイルの一覧を返す。
/// 拡張子が無い・対象外拡張子（RAW/HEIC等）のファイルはスキップする。
/// 走査中に読み取り不能なエントリ（権限エラー等）に遭遇した場合も、
/// 全体を中断せずそのエントリだけをスキップする。
pub fn scan_folder(folder_path: &Path) -> Vec<ScannedFile> {
    WalkDir::new(folder_path)
        .into_iter()
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_type().is_file())
        .filter_map(|entry| {
            let extension = entry.path().extension()?.to_str()?;
            let kind = classify_extension(extension)?;
            Some(ScannedFile {
                path: entry.path().to_path_buf(),
                kind,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn touch(path: &Path) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, b"dummy").unwrap();
    }

    #[test]
    fn classify_extension_recognizes_common_photo_extensions() {
        assert_eq!(classify_extension("jpg"), Some(MediaKind::Photo));
        assert_eq!(classify_extension("JPG"), Some(MediaKind::Photo));
        assert_eq!(classify_extension("jpeg"), Some(MediaKind::Photo));
        assert_eq!(classify_extension("png"), Some(MediaKind::Photo));
    }

    #[test]
    fn classify_extension_recognizes_common_video_extensions() {
        assert_eq!(classify_extension("mov"), Some(MediaKind::Video));
        assert_eq!(classify_extension("MP4"), Some(MediaKind::Video));
    }

    #[test]
    fn classify_extension_rejects_raw_extensions() {
        for ext in ["cr2", "nef", "dng", "arw", "raf", "orf", "rw2"] {
            assert_eq!(classify_extension(ext), None, "{ext} should be rejected");
        }
    }

    #[test]
    fn classify_extension_rejects_heic_and_heif() {
        // image 0.25はHEICデコーダ自体を持たない（実装時に検証済み）ため対象外。
        assert_eq!(classify_extension("heic"), None);
        assert_eq!(classify_extension("heif"), None);
    }

    #[test]
    fn classify_extension_rejects_unknown_extensions() {
        assert_eq!(classify_extension("txt"), None);
        assert_eq!(classify_extension("db"), None);
    }

    #[test]
    fn scan_folder_finds_photo_and_video_files_in_nested_directories() {
        let tmp = tempfile::tempdir().unwrap();
        touch(&tmp.path().join("root.jpg"));
        touch(&tmp.path().join("sub").join("nested.mp4"));
        touch(&tmp.path().join("sub").join("deeper").join("another.PNG"));

        let mut results = scan_folder(tmp.path());
        results.sort_by_key(|f| f.path.clone());

        assert_eq!(results.len(), 3);
        assert!(results
            .iter()
            .any(|f| f.path.ends_with("root.jpg") && f.kind == MediaKind::Photo));
        assert!(results
            .iter()
            .any(|f| f.path.ends_with("nested.mp4") && f.kind == MediaKind::Video));
        assert!(results
            .iter()
            .any(|f| f.path.ends_with("another.PNG") && f.kind == MediaKind::Photo));
    }

    #[test]
    fn scan_folder_excludes_raw_and_heic_files() {
        let tmp = tempfile::tempdir().unwrap();
        touch(&tmp.path().join("photo.CR2"));
        touch(&tmp.path().join("photo.heic"));
        touch(&tmp.path().join("keep.jpg"));

        let results = scan_folder(tmp.path());

        assert_eq!(results.len(), 1);
        assert!(results[0].path.ends_with("keep.jpg"));
    }

    #[test]
    fn scan_folder_ignores_extensionless_and_unrelated_files() {
        let tmp = tempfile::tempdir().unwrap();
        touch(&tmp.path().join("README"));
        touch(&tmp.path().join("notes.txt"));

        let results = scan_folder(tmp.path());

        assert!(results.is_empty());
    }

    #[test]
    fn scan_folder_returns_empty_for_empty_directory() {
        let tmp = tempfile::tempdir().unwrap();

        let results = scan_folder(tmp.path());

        assert!(results.is_empty());
    }

    #[test]
    fn scan_folder_returns_empty_for_nonexistent_directory() {
        let missing = Path::new("Z:/does/not/exist/at/all");

        let results = scan_folder(missing);

        assert!(results.is_empty());
    }
}
