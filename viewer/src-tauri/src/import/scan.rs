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
const PHOTO_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif"];

/// 動画として取り込み対象とする拡張子。`mime.rs`が既に扱っている
/// mov/mp4に加え、一般的なスマホ・デジカメの動画拡張子を含める。
const VIDEO_EXTENSIONS: &[&str] = &["mov", "mp4", "m4v", "avi"];

/// 写真としては認識できるが`image`クレートがデコーダを持たないため
/// 取り込み対象外とする拡張子。
///
/// `.heic`/`.heif`: 2026-09-16の実装時検証で、本クレートが依存する
/// `image = "0.25"`（追加のheif/libheif系featureは指定していない）には
/// `image::ImageFormat::Heic`というバリアント自体が存在せず
/// （`image::ImageFormat::Heic`と書くとコンパイルエラーになることを確認済み）、
/// `image::ImageFormat::from_extension("heic")`もNoneを返す。つまり拡張子解決の
/// 問題ではなく、デコーダそのものが存在しないためHEICは構造的にデコード不可能。
/// よってv1では対象外とし、将来libheif系クレートを追加する場合に再検討する
/// （TASK-384、C-5でこの検証を`scan_folder_with_skipped`の再現可能なテストとして
/// 固定した。README/docsにもv1では非対応である旨を明記する）。
///
/// RAW拡張子（cr2/nef/dng/arw等）も同様に`image`クレートがデコーダを持たず
/// （`from_extension`はいずれもNoneを返すことを確認済み）、対象外とする。
const UNSUPPORTED_MEDIA_EXTENSIONS: &[&str] = &[
    "heic", "heif", "cr2", "nef", "dng", "arw", "raf", "orf", "rw2",
];

/// ファイルがスキャン対象から除外された理由。プレビュー画面で
/// 「なぜこのファイルが取り込み候補に含まれないのか」をユーザーに
/// 説明できるよう、単純に無視するのではなく理由付きで記録する
/// （TASK-384、C-5完了条件: HEIC等のスキップ理由が正しく記録されること）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SkipReason {
    /// 写真/動画ファイルらしいが、`image`クレートにデコーダが存在しない
    /// 形式（HEIC/HEIF、各社RAW形式等）。
    UnsupportedFormat,
}

/// スキップされたファイルとその理由。
#[derive(Debug, Clone, PartialEq)]
pub struct SkippedFile {
    pub path: PathBuf,
    pub reason: SkipReason,
}

/// `scan_folder_with_skipped`の走査結果。取り込み候補として見つかった
/// ファイルと、既知だが非対応の形式のため除外されたファイルの両方を保持する。
/// 拡張子が無い・写真/動画と無関係なファイル（テキストファイル等、フォルダの
/// 雑多な内容物）は`skipped`にも含めず、単純に無視する
/// （プレビュー画面がSDカード内の無関係なファイルでノイズだらけになるのを防ぐ）。
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ScanOutcome {
    pub found: Vec<ScannedFile>,
    pub skipped: Vec<SkippedFile>,
}

enum ExtensionClassification {
    Media(MediaKind),
    Unsupported(SkipReason),
    Irrelevant,
}

/// 拡張子（ドット無し、大文字小文字は問わない）を分類する。
fn classify_extension_detailed(extension: &str) -> ExtensionClassification {
    let lower = extension.to_lowercase();
    if PHOTO_EXTENSIONS.contains(&lower.as_str()) {
        ExtensionClassification::Media(MediaKind::Photo)
    } else if VIDEO_EXTENSIONS.contains(&lower.as_str()) {
        ExtensionClassification::Media(MediaKind::Video)
    } else if UNSUPPORTED_MEDIA_EXTENSIONS.contains(&lower.as_str()) {
        ExtensionClassification::Unsupported(SkipReason::UnsupportedFormat)
    } else {
        ExtensionClassification::Irrelevant
    }
}

/// 拡張子（ドット無し、大文字小文字は問わない）から`MediaKind`を判定する。
/// 対象外の拡張子（RAW、HEIC、ドキュメント類等）の場合はNoneを返す。
/// 本番コードでは`classify_extension_detailed`に統合されたため直接は
/// 呼ばれないが、既存の単体テスト（分類ロジック単体の回帰確認）のために残す。
#[cfg_attr(not(test), allow(dead_code))]
fn classify_extension(extension: &str) -> Option<MediaKind> {
    match classify_extension_detailed(extension) {
        ExtensionClassification::Media(kind) => Some(kind),
        _ => None,
    }
}

/// folder_path配下を再帰的に走査し、写真/動画候補ファイルの一覧
/// （`found`）と、既知だが非対応の形式のため除外されたファイルの一覧
/// （`skipped`、理由付き）を返す。拡張子が無い・写真/動画と無関係な
/// ファイルはどちらにも含めず単純に無視する。走査中に読み取り不能な
/// エントリ（権限エラー等）に遭遇した場合も、全体を中断せずそのエントリ
/// だけをスキップする。
pub fn scan_folder_with_skipped(folder_path: &Path) -> ScanOutcome {
    let mut outcome = ScanOutcome::default();

    for entry in WalkDir::new(folder_path)
        .into_iter()
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_type().is_file())
    {
        let Some(extension) = entry.path().extension().and_then(|e| e.to_str()) else {
            continue;
        };

        match classify_extension_detailed(extension) {
            ExtensionClassification::Media(kind) => outcome.found.push(ScannedFile {
                path: entry.path().to_path_buf(),
                kind,
            }),
            ExtensionClassification::Unsupported(reason) => outcome.skipped.push(SkippedFile {
                path: entry.path().to_path_buf(),
                reason,
            }),
            ExtensionClassification::Irrelevant => {}
        }
    }

    outcome
}

/// folder_path配下を再帰的に走査し、写真/動画候補ファイルの一覧を返す。
/// 拡張子が無い・対象外拡張子（RAW/HEIC等）のファイルはスキップする。
/// 走査中に読み取り不能なエントリ（権限エラー等）に遭遇した場合も、
/// 全体を中断せずそのエントリだけをスキップする。
///
/// スキップ理由も必要な呼び出し元（プレビュー画面での表示）は
/// `scan_folder_with_skipped`を使うこと。TASK-384（C-5）でコマンド層は
/// `scan_folder_with_skipped`に切り替わったため、本番コードからは直接
/// 呼ばれなくなったが、後方互換のAPIおよび分類ロジック単体の回帰テスト用に残す。
#[cfg_attr(not(test), allow(dead_code))]
pub fn scan_folder(folder_path: &Path) -> Vec<ScannedFile> {
    scan_folder_with_skipped(folder_path).found
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

    // -----------------------------------------------------------------
    // TASK-384（C-5）: `.heic`の実デコード可否検証をテストとして固定する。
    // -----------------------------------------------------------------

    #[test]
    fn scan_folder_with_skipped_records_heic_files_with_unsupported_format_reason() {
        // 実際に`.heic`拡張子のダミーファイルを使い、スキャン結果で
        // スキップ理由(unsupported_format)が正しく記録されることを検証する
        // （完了条件1）。`image = "0.25"`にHEICデコーダが存在しないことは
        // `UNSUPPORTED_MEDIA_EXTENSIONS`のコメントに実装時の検証根拠を明記済み。
        let tmp = tempfile::tempdir().unwrap();
        touch(&tmp.path().join("IMG_0001.heic"));
        touch(&tmp.path().join("IMG_0002.HEIF"));
        touch(&tmp.path().join("keep.jpg"));

        let outcome = scan_folder_with_skipped(tmp.path());

        assert_eq!(outcome.found.len(), 1, "keep.jpgのみ取り込み候補になること");
        assert!(outcome.found[0].path.ends_with("keep.jpg"));

        assert_eq!(
            outcome.skipped.len(),
            2,
            "2件のHEIC/HEIFがスキップ記録されること"
        );
        assert!(outcome
            .skipped
            .iter()
            .all(|s| s.reason == SkipReason::UnsupportedFormat));
        assert!(outcome
            .skipped
            .iter()
            .any(|s| s.path.ends_with("IMG_0001.heic")));
        assert!(outcome
            .skipped
            .iter()
            .any(|s| s.path.ends_with("IMG_0002.HEIF")));
    }

    #[test]
    fn scan_folder_with_skipped_records_raw_files_with_unsupported_format_reason() {
        let tmp = tempfile::tempdir().unwrap();
        touch(&tmp.path().join("photo.CR2"));

        let outcome = scan_folder_with_skipped(tmp.path());

        assert!(outcome.found.is_empty());
        assert_eq!(outcome.skipped.len(), 1);
        assert_eq!(outcome.skipped[0].reason, SkipReason::UnsupportedFormat);
    }

    #[test]
    fn scan_folder_with_skipped_does_not_report_unrelated_non_media_files_as_skipped() {
        // .txtや拡張子無しのファイルは、フォルダの雑多な内容物であって
        // ユーザーへの「非対応形式」通知が必要な対象ではないため、
        // skippedには含めず単純に無視する（プレビュー画面のノイズ防止）。
        let tmp = tempfile::tempdir().unwrap();
        touch(&tmp.path().join("README"));
        touch(&tmp.path().join("notes.txt"));
        touch(&tmp.path().join("Thumbs.db"));

        let outcome = scan_folder_with_skipped(tmp.path());

        assert!(outcome.found.is_empty());
        assert!(
            outcome.skipped.is_empty(),
            "無関係なファイルはskippedにも含めないこと: {:?}",
            outcome.skipped
        );
    }

    #[test]
    fn scan_folder_with_skipped_returns_empty_outcome_for_empty_directory() {
        let tmp = tempfile::tempdir().unwrap();

        let outcome = scan_folder_with_skipped(tmp.path());

        assert!(outcome.found.is_empty());
        assert!(outcome.skipped.is_empty());
    }

    #[test]
    fn scan_folder_delegates_to_scan_folder_with_skipped_found_list() {
        // 既存の`scan_folder`（後方互換用の薄いラッパー）は
        // `scan_folder_with_skipped().found`と同じ結果を返し続けること。
        let tmp = tempfile::tempdir().unwrap();
        touch(&tmp.path().join("a.jpg"));
        touch(&tmp.path().join("b.heic"));

        let via_wrapper = scan_folder(tmp.path());
        let via_outcome = scan_folder_with_skipped(tmp.path()).found;

        assert_eq!(via_wrapper, via_outcome);
    }
}
