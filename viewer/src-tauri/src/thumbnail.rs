use std::path::{Path, PathBuf};

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

/// source_pathの画像を縮小し、JPEGとしてcache_pathへ保存する。
/// フォーマットは常にJPEGに統一するため、HEIC等ブラウザ側で直接
/// 表示できない形式の写真もサムネイルとしては問題なく表示できる。
pub fn generate_thumbnail(source_path: &Path, cache_path: &Path) -> Result<(), ThumbnailError> {
    let img = image::ImageReader::open(source_path)?
        .with_guessed_format()?
        .decode()?;

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
    use image::{Rgb, RgbImage};

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

        generate_thumbnail(&source, &cache).unwrap();

        assert!(cache.exists());
    }

    #[test]
    fn generate_thumbnail_shrinks_large_images_within_max_dimension() {
        let tmp = tempfile::tempdir().unwrap();
        let source = tmp.path().join("source.jpg");
        let cache = tmp.path().join("thumb.jpg");
        write_sample_image(&source, 2000, 1000);

        generate_thumbnail(&source, &cache).unwrap();

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

        generate_thumbnail(&source, &cache).unwrap();

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

        generate_thumbnail(&source, &cache).unwrap();

        let generated = image::open(&cache).unwrap();
        assert_eq!(generated.width(), 50);
        assert_eq!(generated.height(), 40);
    }

    #[test]
    fn generate_thumbnail_returns_error_for_missing_source() {
        let tmp = tempfile::tempdir().unwrap();
        let source = tmp.path().join("does_not_exist.jpg");
        let cache = tmp.path().join("thumb.jpg");

        let result = generate_thumbnail(&source, &cache);

        assert!(result.is_err());
    }

    #[test]
    fn thumbnail_cache_path_is_scoped_under_thumbnails_dir() {
        let archive_root = Path::new("E:/archive");

        let path = thumbnail_cache_path(archive_root, "UUID-1");

        assert_eq!(path, Path::new("E:/archive/.thumbnails/UUID-1.jpg"));
    }
}
