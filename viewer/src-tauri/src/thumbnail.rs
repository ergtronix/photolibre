use std::path::{Path, PathBuf};

use image::DynamicImage;

const THUMBNAIL_MAX_DIMENSION: u32 = 320;

#[derive(Debug, thiserror::Error)]
pub enum ThumbnailError {
    #[error("画像を処理できません: {0}")]
    Image(#[from] image::ImageError),
    #[error("ファイル入出力エラー: {0}")]
    Io(#[from] std::io::Error),
}

/// サムネイルキャッシュのパスを返す（archive_root/.thumbnails/{photo_id}.jpg）。
pub fn thumbnail_cache_path(archive_root: &Path, photo_id: &str) -> PathBuf {
    archive_root
        .join(".thumbnails")
        .join(format!("{photo_id}.jpg"))
}

/// EXIFのOrientationタグ（1〜8）に従い、画像を正しい向きに補正する。
/// `image`クレートのデコーダはこのタグを見ないため、生のピクセルデータのまま
/// 横向きに見えてしまう問題（カメラが縦持ちで撮影した写真等）に対処する。
pub fn apply_exif_orientation(img: DynamicImage, orientation: u32) -> DynamicImage {
    match orientation {
        2 => img.fliph(),
        3 => img.rotate180(),
        4 => img.flipv(),
        5 => img.rotate90().fliph(),
        6 => img.rotate90(),
        7 => img.rotate270().fliph(),
        8 => img.rotate270(),
        _ => img,
    }
}

/// source_pathからEXIFのOrientation値を読み取る。EXIFが無い・読み取れない
/// 場合はNone（=回転不要として扱う）。
fn read_exif_orientation(source_path: &Path) -> Option<u32> {
    let file = std::fs::File::open(source_path).ok()?;
    let mut reader = std::io::BufReader::new(file);
    let exif = exif::Reader::new().read_from_container(&mut reader).ok()?;
    let field = exif.get_field(exif::Tag::Orientation, exif::In::PRIMARY)?;
    field.value.get_uint(0)
}

/// ERGが手動で指定した回転角度（0/90/180/270）を適用する。
/// EXIF補正の後に追加で適用する、ユーザー指定の上書き回転。
pub fn rotate_by_degrees(img: DynamicImage, degrees: i32) -> DynamicImage {
    match degrees {
        90 => img.rotate90(),
        180 => img.rotate180(),
        270 => img.rotate270(),
        _ => img,
    }
}

/// source_pathの画像を縮小し、JPEGとしてcache_pathへ保存する。
/// フォーマットは常にJPEGに統一するため、HEIC等ブラウザ側で直接
/// 表示できない形式の写真もサムネイルとしては問題なく表示できる。
/// manual_rotation_degreesはERGが手動指定した追加の回転角度（0/90/180/270）。
pub fn generate_thumbnail(
    source_path: &Path,
    cache_path: &Path,
    manual_rotation_degrees: i32,
) -> Result<(), ThumbnailError> {
    let img = image::ImageReader::open(source_path)?
        .with_guessed_format()?
        .decode()?;

    let img = match read_exif_orientation(source_path) {
        Some(orientation) => apply_exif_orientation(img, orientation),
        None => img,
    };
    let img = rotate_by_degrees(img, manual_rotation_degrees);

    // image::thumbnail()は指定サイズより小さい画像を拡大してしまうため、
    // 既に上限以下の場合はリサイズせずそのまま使う。
    let thumbnail =
        if img.width() <= THUMBNAIL_MAX_DIMENSION && img.height() <= THUMBNAIL_MAX_DIMENSION {
            img
        } else {
            img.thumbnail(THUMBNAIL_MAX_DIMENSION, THUMBNAIL_MAX_DIMENSION)
        };

    if let Some(parent) = cache_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let mut output = std::fs::File::create(cache_path)?;
    thumbnail.write_to(&mut output, image::ImageFormat::Jpeg)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{GenericImageView, Rgb, RgbImage};

    fn write_sample_image(path: &Path, width: u32, height: u32) {
        let img = RgbImage::from_pixel(width, height, Rgb([200, 100, 50]));
        img.save(path).unwrap();
    }

    #[test]
    fn generate_thumbnail_creates_a_file_at_cache_path() {
        let tmp = tempfile::tempdir().unwrap();
        let source = tmp.path().join("source.jpg");
        let cache = tmp.path().join(".thumbnails").join("abc.jpg");
        write_sample_image(&source, 1000, 800);

        generate_thumbnail(&source, &cache, 0).unwrap();

        assert!(cache.exists());
    }

    #[test]
    fn generate_thumbnail_shrinks_large_images_within_max_dimension() {
        let tmp = tempfile::tempdir().unwrap();
        let source = tmp.path().join("source.jpg");
        let cache = tmp.path().join("thumb.jpg");
        write_sample_image(&source, 2000, 1000);

        generate_thumbnail(&source, &cache, 0).unwrap();

        let generated = image::open(&cache).unwrap();
        assert!(generated.width() <= THUMBNAIL_MAX_DIMENSION);
        assert!(generated.height() <= THUMBNAIL_MAX_DIMENSION);
    }

    #[test]
    fn generate_thumbnail_preserves_aspect_ratio() {
        let tmp = tempfile::tempdir().unwrap();
        let source = tmp.path().join("source.jpg");
        let cache = tmp.path().join("thumb.jpg");
        write_sample_image(&source, 2000, 1000); // 2:1

        generate_thumbnail(&source, &cache, 0).unwrap();

        let generated = image::open(&cache).unwrap();
        let ratio = generated.width() as f64 / generated.height() as f64;
        assert!((ratio - 2.0).abs() < 0.05);
    }

    #[test]
    fn generate_thumbnail_does_not_upscale_small_images() {
        let tmp = tempfile::tempdir().unwrap();
        let source = tmp.path().join("source.jpg");
        let cache = tmp.path().join("thumb.jpg");
        write_sample_image(&source, 50, 40);

        generate_thumbnail(&source, &cache, 0).unwrap();

        let generated = image::open(&cache).unwrap();
        assert_eq!(generated.width(), 50);
        assert_eq!(generated.height(), 40);
    }

    #[test]
    fn generate_thumbnail_returns_error_for_missing_source() {
        let tmp = tempfile::tempdir().unwrap();
        let source = tmp.path().join("does_not_exist.jpg");
        let cache = tmp.path().join("thumb.jpg");

        let result = generate_thumbnail(&source, &cache, 0);

        assert!(result.is_err());
    }

    #[test]
    fn thumbnail_cache_path_is_scoped_under_thumbnails_dir() {
        let archive_root = Path::new("E:/archive");

        let path = thumbnail_cache_path(archive_root, "UUID-1");

        assert_eq!(path, Path::new("E:/archive/.thumbnails/UUID-1.jpg"));
    }

    fn wide_test_image() -> image::DynamicImage {
        // 2x1の画像: 左=赤、右=青。回転方向の正しさを判定できるようにする。
        let mut img = RgbImage::new(2, 1);
        img.put_pixel(0, 0, Rgb([255, 0, 0]));
        img.put_pixel(1, 0, Rgb([0, 0, 255]));
        image::DynamicImage::ImageRgb8(img)
    }

    #[test]
    fn apply_exif_orientation_1_leaves_image_unchanged() {
        let img = wide_test_image();
        let result = apply_exif_orientation(img.clone(), 1);

        assert_eq!(result.width(), img.width());
        assert_eq!(result.height(), img.height());
        assert_eq!(result.get_pixel(0, 0), img.get_pixel(0, 0));
    }

    #[test]
    fn apply_exif_orientation_3_rotates_180_degrees() {
        let img = wide_test_image();
        let result = apply_exif_orientation(img.clone(), 3);

        assert_eq!(result.width(), 2);
        assert_eq!(result.height(), 1);
        // 180度回転で赤と青の位置が入れ替わる
        assert_eq!(result.get_pixel(0, 0), img.get_pixel(1, 0));
        assert_eq!(result.get_pixel(1, 0), img.get_pixel(0, 0));
    }

    #[test]
    fn apply_exif_orientation_6_rotates_90_degrees_clockwise_and_swaps_dimensions() {
        let img = wide_test_image();
        let result = apply_exif_orientation(img.clone(), 6);

        // 2x1 -> 1x2（縦横が入れ替わる）
        assert_eq!(result.width(), 1);
        assert_eq!(result.height(), 2);
    }

    #[test]
    fn apply_exif_orientation_8_rotates_270_degrees_and_swaps_dimensions() {
        let img = wide_test_image();
        let result = apply_exif_orientation(img.clone(), 8);

        assert_eq!(result.width(), 1);
        assert_eq!(result.height(), 2);
    }

    #[test]
    fn apply_exif_orientation_unknown_value_leaves_image_unchanged() {
        let img = wide_test_image();
        let result = apply_exif_orientation(img.clone(), 99);

        assert_eq!(result.width(), img.width());
        assert_eq!(result.height(), img.height());
    }

    #[test]
    fn generate_thumbnail_succeeds_for_images_without_exif_metadata() {
        // image::RgbImage::save()で書き出したJPEGにはEXIFが含まれないため、
        // read_exif_orientationがNoneを返す経路（回転なし）を検証する。
        let tmp = tempfile::tempdir().unwrap();
        let source = tmp.path().join("source.jpg");
        let cache = tmp.path().join("thumb.jpg");
        write_sample_image(&source, 100, 50);

        let result = generate_thumbnail(&source, &cache, 0);

        assert!(result.is_ok());
        let generated = image::open(&cache).unwrap();
        assert_eq!(generated.width(), 100);
        assert_eq!(generated.height(), 50);
    }

    #[test]
    fn rotate_by_degrees_90_swaps_dimensions() {
        let img = wide_test_image();
        let result = rotate_by_degrees(img.clone(), 90);

        assert_eq!(result.width(), 1);
        assert_eq!(result.height(), 2);
    }

    #[test]
    fn rotate_by_degrees_180_keeps_dimensions_but_flips_content() {
        let img = wide_test_image();
        let result = rotate_by_degrees(img.clone(), 180);

        assert_eq!(result.width(), 2);
        assert_eq!(result.height(), 1);
        assert_eq!(result.get_pixel(0, 0), img.get_pixel(1, 0));
    }

    #[test]
    fn rotate_by_degrees_0_leaves_image_unchanged() {
        let img = wide_test_image();
        let result = rotate_by_degrees(img.clone(), 0);

        assert_eq!(result.get_pixel(0, 0), img.get_pixel(0, 0));
        assert_eq!(result.get_pixel(1, 0), img.get_pixel(1, 0));
    }

    #[test]
    fn generate_thumbnail_applies_manual_rotation_on_top_of_no_exif() {
        let tmp = tempfile::tempdir().unwrap();
        let source = tmp.path().join("source.jpg");
        let cache = tmp.path().join("thumb.jpg");
        write_sample_image(&source, 100, 50);

        generate_thumbnail(&source, &cache, 90).unwrap();

        let generated = image::open(&cache).unwrap();
        assert_eq!(generated.width(), 50);
        assert_eq!(generated.height(), 100);
    }
}
