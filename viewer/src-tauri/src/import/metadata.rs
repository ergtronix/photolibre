use std::path::Path;
use std::time::SystemTime;

use chrono::{DateTime, NaiveDateTime, Utc};

use super::scan::MediaKind;

/// date_takenがどこから得られたかを示すフラグ。UI側で「撮影日」と
/// 「推定日時」を区別して表示するために使う。
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DateSource {
    /// EXIFのDateTimeOriginalタグから取得した実際の撮影日時。
    Captured,
    /// EXIFが無い、またはEXIFを解釈できない（動画等）ため、
    /// ファイルの更新日時(mtime)で代用した推定日時。
    Estimated,
}

/// 写真/動画1件分のメタデータ。DB書き込み（C-2）ではこの内容を
/// `photos`テーブルの対応カラムにそのままマッピングする想定。
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoMetadata {
    /// ISO8601相当の日時文字列。EXIF由来（date_source=Captured）の場合は
    /// タイムゾーン情報を持たないローカル時刻表現（例: "2023-07-04T15:30:45"）。
    /// mtime由来（date_source=Estimated）の場合はRFC3339形式（UTCオフセット付き）。
    pub date_taken: Option<String>,
    pub date_source: Option<DateSource>,
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub focal_length: Option<f64>,
    pub aperture: Option<f64>,
    pub shutter_speed: Option<String>,
    pub iso: Option<i64>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
}

fn ascii_field_to_string(value: &exif::Value) -> Option<String> {
    if let exif::Value::Ascii(ascii) = value {
        let bytes = ascii.first()?;
        let text = String::from_utf8_lossy(bytes).trim().to_string();
        if text.is_empty() {
            None
        } else {
            Some(text)
        }
    } else {
        None
    }
}

fn rational_at(value: &exif::Value, index: usize) -> Option<f64> {
    if let exif::Value::Rational(values) = value {
        values.get(index).map(|r| r.to_f64())
    } else {
        None
    }
}

fn gcd(a: u32, b: u32) -> u32 {
    if b == 0 {
        a
    } else {
        gcd(b, a % b)
    }
}

/// ExposureTime（Rational）を"1/250"のような分数表記の文字列にする。
fn shutter_speed_string(value: &exif::Value) -> Option<String> {
    if let exif::Value::Rational(values) = value {
        let r = values.first()?;
        if r.num == 0 || r.denom == 0 {
            return Some(format!("{}/{}", r.num, r.denom.max(1)));
        }
        let divisor = gcd(r.num, r.denom);
        Some(format!("{}/{}", r.num / divisor, r.denom / divisor))
    } else {
        None
    }
}

fn iso_value(value: &exif::Value) -> Option<i64> {
    match value {
        exif::Value::Short(values) => values.first().map(|&v| v as i64),
        exif::Value::Long(values) => values.first().map(|&v| v as i64),
        _ => None,
    }
}

/// GPS度分秒（Rational3要素）を10進度に変換する。
fn dms_to_decimal(value: &exif::Value) -> Option<f64> {
    if let exif::Value::Rational(values) = value {
        if values.len() < 3 {
            return None;
        }
        let degrees = values[0].to_f64();
        let minutes = values[1].to_f64();
        let seconds = values[2].to_f64();
        Some(degrees + minutes / 60.0 + seconds / 3600.0)
    } else {
        None
    }
}

/// GPSLatitudeRef/GPSLongitudeRefが"S"/"W"の場合は符号を反転させる。
fn apply_hemisphere(value: f64, reference: Option<&str>) -> f64 {
    match reference {
        Some("S") | Some("W") => -value,
        _ => value,
    }
}

fn read_exif(path: &Path) -> Option<exif::Exif> {
    let file = std::fs::File::open(path).ok()?;
    let mut reader = std::io::BufReader::new(file);
    exif::Reader::new().read_from_container(&mut reader).ok()
}

/// EXIFのDateTimeOriginal（"YYYY:MM:DD HH:MM:SS"形式）をISO8601相当の
/// 文字列（"YYYY-MM-DDTHH:MM:SS"）に変換する。
fn parse_exif_datetime(raw: &str) -> Option<String> {
    NaiveDateTime::parse_from_str(raw, "%Y:%m:%d %H:%M:%S")
        .ok()
        .map(|dt| dt.format("%Y-%m-%dT%H:%M:%S").to_string())
}

/// ファイルの更新日時(mtime)をRFC3339形式の文字列にする。
/// 取得できない場合（ファイルが存在しない等）はNone。
fn mtime_iso(path: &Path) -> Option<String> {
    let modified: SystemTime = std::fs::metadata(path).ok()?.modified().ok()?;
    let datetime: DateTime<Utc> = modified.into();
    Some(datetime.to_rfc3339())
}

fn find_field(exif: &exif::Exif, tag: exif::Tag) -> Option<&exif::Field> {
    exif.get_field(tag, exif::In::PRIMARY)
}

/// 写真ファイルからEXIFメタデータを読み取る。EXIFが無い・
/// DateTimeOriginalが読み取れない場合はファイルのmtimeにフォールバックする
/// （date_source=Estimated）。
fn read_photo_metadata(path: &Path) -> PhotoMetadata {
    let mut result = PhotoMetadata::default();

    if let Some(exif) = read_exif(path) {
        if let Some(field) = find_field(&exif, exif::Tag::DateTimeOriginal) {
            if let Some(raw) = ascii_field_to_string(&field.value) {
                if let Some(parsed) = parse_exif_datetime(&raw) {
                    result.date_taken = Some(parsed);
                    result.date_source = Some(DateSource::Captured);
                }
            }
        }
        if let Some(field) = find_field(&exif, exif::Tag::Make) {
            result.camera_make = ascii_field_to_string(&field.value);
        }
        if let Some(field) = find_field(&exif, exif::Tag::Model) {
            result.camera_model = ascii_field_to_string(&field.value);
        }
        if let Some(field) = find_field(&exif, exif::Tag::FocalLength) {
            result.focal_length = rational_at(&field.value, 0);
        }
        if let Some(field) = find_field(&exif, exif::Tag::FNumber) {
            result.aperture = rational_at(&field.value, 0);
        }
        if let Some(field) = find_field(&exif, exif::Tag::ExposureTime) {
            result.shutter_speed = shutter_speed_string(&field.value);
        }
        if let Some(field) = find_field(&exif, exif::Tag::PhotographicSensitivity) {
            result.iso = iso_value(&field.value);
        }

        let latitude =
            find_field(&exif, exif::Tag::GPSLatitude).and_then(|f| dms_to_decimal(&f.value));
        let latitude_ref = find_field(&exif, exif::Tag::GPSLatitudeRef)
            .and_then(|f| ascii_field_to_string(&f.value));
        if let Some(lat) = latitude {
            result.latitude = Some(apply_hemisphere(lat, latitude_ref.as_deref()));
        }

        let longitude =
            find_field(&exif, exif::Tag::GPSLongitude).and_then(|f| dms_to_decimal(&f.value));
        let longitude_ref = find_field(&exif, exif::Tag::GPSLongitudeRef)
            .and_then(|f| ascii_field_to_string(&f.value));
        if let Some(lon) = longitude {
            result.longitude = Some(apply_hemisphere(lon, longitude_ref.as_deref()));
        }
    }

    if result.date_taken.is_none() {
        if let Some(mtime) = mtime_iso(path) {
            result.date_taken = Some(mtime);
            result.date_source = Some(DateSource::Estimated);
        }
    }

    result
}

/// 動画ファイルのメタデータを読み取る。`kamadak-exif`は動画コンテナを
/// 解釈できないため、v1では常にファイルのmtimeにフォールバックし
/// date_source=Estimatedとする（専用の動画メタデータクレート導入は
/// 将来の改善課題）。
fn read_video_metadata(path: &Path) -> PhotoMetadata {
    let mut result = PhotoMetadata::default();
    if let Some(mtime) = mtime_iso(path) {
        result.date_taken = Some(mtime);
        result.date_source = Some(DateSource::Estimated);
    }
    result
}

/// メディア種別に応じてメタデータを読み取る（scan.rsの分類結果をそのまま使う）。
pub fn read_metadata(path: &Path, kind: MediaKind) -> PhotoMetadata {
    match kind {
        MediaKind::Photo => read_photo_metadata(path),
        MediaKind::Video => read_video_metadata(path),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn fixture(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join(name)
    }

    #[test]
    fn read_metadata_extracts_full_exif_fields_from_photo() {
        let metadata = read_metadata(&fixture("sample_with_exif.jpg"), MediaKind::Photo);

        assert_eq!(metadata.date_taken.as_deref(), Some("2023-07-04T15:30:45"));
        assert_eq!(metadata.date_source, Some(DateSource::Captured));
        assert_eq!(metadata.camera_make.as_deref(), Some("Canon"));
        assert_eq!(metadata.camera_model.as_deref(), Some("EOS R5"));
        assert_eq!(metadata.shutter_speed.as_deref(), Some("1/250"));
        assert!((metadata.aperture.unwrap() - 2.8).abs() < 0.01);
        assert!((metadata.focal_length.unwrap() - 50.0).abs() < 0.01);
        assert_eq!(metadata.iso, Some(400));
    }

    #[test]
    fn read_metadata_converts_gps_dms_to_decimal_degrees() {
        let metadata = read_metadata(&fixture("sample_with_exif.jpg"), MediaKind::Photo);

        // 35 deg 39 min 29.2 sec N -> 約35.658111...
        let lat = metadata.latitude.expect("latitude should be present");
        assert!((lat - 35.658_111).abs() < 0.001, "lat = {lat}");

        // 139 deg 44 min 28.8 sec E -> 約139.741333...
        let lon = metadata.longitude.expect("longitude should be present");
        assert!((lon - 139.741_333).abs() < 0.001, "lon = {lon}");
    }

    #[test]
    fn read_metadata_falls_back_to_mtime_when_exif_is_absent() {
        let path = fixture("sample_without_exif.jpg");

        let metadata = read_metadata(&path, MediaKind::Photo);

        assert!(metadata.date_taken.is_some());
        assert_eq!(metadata.date_source, Some(DateSource::Estimated));
        assert_eq!(metadata.camera_make, None);
        assert_eq!(metadata.iso, None);
    }

    #[test]
    fn read_metadata_for_video_always_uses_mtime_fallback() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("clip.mp4");
        std::fs::write(&path, b"not a real video, just for mtime test").unwrap();

        let metadata = read_metadata(&path, MediaKind::Video);

        assert!(metadata.date_taken.is_some());
        assert_eq!(metadata.date_source, Some(DateSource::Estimated));
        assert_eq!(metadata.camera_make, None);
        assert_eq!(metadata.latitude, None);
    }

    #[test]
    fn read_metadata_returns_all_none_when_file_does_not_exist() {
        let missing = Path::new("Z:/does/not/exist.jpg");

        let metadata = read_metadata(missing, MediaKind::Photo);

        assert_eq!(metadata.date_taken, None);
        assert_eq!(metadata.date_source, None);
    }

    #[test]
    fn shutter_speed_string_reduces_fraction() {
        let value = exif::Value::Rational(vec![exif::Rational {
            num: 10,
            denom: 2500,
        }]);

        assert_eq!(shutter_speed_string(&value).as_deref(), Some("1/250"));
    }

    #[test]
    fn apply_hemisphere_negates_for_south_and_west() {
        assert_eq!(apply_hemisphere(10.0, Some("S")), -10.0);
        assert_eq!(apply_hemisphere(10.0, Some("W")), -10.0);
        assert_eq!(apply_hemisphere(10.0, Some("N")), 10.0);
        assert_eq!(apply_hemisphere(10.0, Some("E")), 10.0);
        assert_eq!(apply_hemisphere(10.0, None), 10.0);
    }
}
