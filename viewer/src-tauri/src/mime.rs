/// ファイル拡張子からMIMEタイプを推測する（写真ビュワーが表示する範囲のみ対応）。
pub fn mime_type_for_extension(extension: &str) -> &'static str {
    match extension.to_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "heic" | "heif" => "image/heic",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "mov" => "video/quicktime",
        "mp4" => "video/mp4",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_common_photo_extensions() {
        assert_eq!(mime_type_for_extension("jpg"), "image/jpeg");
        assert_eq!(mime_type_for_extension("JPG"), "image/jpeg");
        assert_eq!(mime_type_for_extension("jpeg"), "image/jpeg");
        assert_eq!(mime_type_for_extension("png"), "image/png");
        assert_eq!(mime_type_for_extension("heic"), "image/heic");
    }

    #[test]
    fn maps_video_extensions() {
        assert_eq!(mime_type_for_extension("mov"), "video/quicktime");
        assert_eq!(mime_type_for_extension("mp4"), "video/mp4");
    }

    #[test]
    fn falls_back_to_octet_stream_for_unknown_extension() {
        assert_eq!(mime_type_for_extension("xyz"), "application/octet-stream");
    }
}
