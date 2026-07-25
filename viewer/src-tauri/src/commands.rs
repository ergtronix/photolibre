use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use base64::Engine;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;

use crate::db::{self, Album, Photo, PhotoFilter};
use crate::mime::mime_type_for_extension;
use crate::rotation::{self, rotated_full_cache_path};
use crate::thumbnail::{generate_thumbnail, rotate_by_degrees, thumbnail_cache_path};

pub struct ArchiveState(pub Mutex<Option<PathBuf>>);

fn config_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("設定ディレクトリの取得に失敗しました: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("archive_path.txt"))
}

#[tauri::command]
pub fn set_archive_path(
    app: AppHandle,
    state: State<ArchiveState>,
    path: String,
) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);
    let config_path = config_file_path(&app)?;
    std::fs::write(&config_path, &path).map_err(|e| e.to_string())?;
    *state.0.lock().unwrap() = Some(path_buf);
    Ok(())
}

#[tauri::command]
pub fn get_archive_path(
    app: AppHandle,
    state: State<ArchiveState>,
) -> Result<Option<String>, String> {
    if let Some(path) = state.0.lock().unwrap().as_ref() {
        return Ok(Some(path.to_string_lossy().to_string()));
    }

    let config_path = config_file_path(&app)?;
    if let Ok(saved) = std::fs::read_to_string(&config_path) {
        let trimmed = saved.trim().to_string();
        if !trimmed.is_empty() {
            *state.0.lock().unwrap() = Some(PathBuf::from(&trimmed));
            return Ok(Some(trimmed));
        }
    }
    Ok(None)
}

fn require_archive_path(state: &State<ArchiveState>) -> Result<PathBuf, String> {
    state
        .0
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "アーカイブフォルダが設定されていません".to_string())
}

#[tauri::command]
pub fn list_photos_command(
    state: State<ArchiveState>,
    favorite_only: bool,
    year: Option<i32>,
    month: Option<u32>,
    keyword: Option<String>,
) -> Result<Vec<Photo>, String> {
    let archive_root = require_archive_path(&state)?;
    let conn = db::open_archive(&archive_root).map_err(|e| e.to_string())?;
    let filter = PhotoFilter {
        favorite_only,
        year,
        month,
        keyword,
    };
    db::list_photos(&conn, &filter).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_albums_command(state: State<ArchiveState>) -> Result<Vec<Album>, String> {
    let archive_root = require_archive_path(&state)?;
    let conn = db::open_archive(&archive_root).map_err(|e| e.to_string())?;
    db::list_albums(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_album_photos_command(
    state: State<ArchiveState>,
    album_id: String,
) -> Result<Vec<Photo>, String> {
    let archive_root = require_archive_path(&state)?;
    let conn = db::open_archive(&archive_root).map_err(|e| e.to_string())?;
    db::list_album_photos(&conn, &album_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_photos_command(
    state: State<ArchiveState>,
    query: String,
) -> Result<Vec<Photo>, String> {
    let archive_root = require_archive_path(&state)?;
    let conn = db::open_archive(&archive_root).map_err(|e| e.to_string())?;
    db::search_photos(&conn, &query).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_unfiled_photos_command(state: State<ArchiveState>) -> Result<Vec<Photo>, String> {
    let archive_root = require_archive_path(&state)?;
    let conn = db::open_archive(&archive_root).map_err(|e| e.to_string())?;
    db::list_unfiled_photos(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn count_unfiled_photos_command(state: State<ArchiveState>) -> Result<i64, String> {
    let archive_root = require_archive_path(&state)?;
    let conn = db::open_archive(&archive_root).map_err(|e| e.to_string())?;
    db::count_unfiled_photos(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_album_command(state: State<ArchiveState>, name: String) -> Result<Album, String> {
    let archive_root = require_archive_path(&state)?;
    let conn = db::open_archive_read_write(&archive_root).map_err(|e| e.to_string())?;
    db::create_album(&conn, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_album_command(
    state: State<ArchiveState>,
    album_id: String,
    new_name: String,
) -> Result<(), String> {
    let archive_root = require_archive_path(&state)?;
    let conn = db::open_archive_read_write(&archive_root).map_err(|e| e.to_string())?;
    db::rename_album(&conn, &album_id, &new_name).map_err(|e| e.to_string())
}

/// アルバム新規作成のUndo専用。アプリ上にアルバム削除ボタンは存在せず、
/// このコマンドもUndoスタックの内部処理からのみ呼び出される想定
/// （db::delete_viewer_albumがsource='viewer'以外の削除をクエリレベルで拒否する）。
#[tauri::command]
pub fn delete_viewer_album_command(
    state: State<ArchiveState>,
    album_id: String,
) -> Result<(), String> {
    let archive_root = require_archive_path(&state)?;
    let conn = db::open_archive_read_write(&archive_root).map_err(|e| e.to_string())?;
    db::delete_viewer_album(&conn, &album_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_photos_to_album_command(
    state: State<ArchiveState>,
    album_id: String,
    photo_ids: Vec<String>,
) -> Result<(), String> {
    let archive_root = require_archive_path(&state)?;
    let conn = db::open_archive_read_write(&archive_root).map_err(|e| e.to_string())?;
    db::add_photos_to_album(&conn, &album_id, &photo_ids).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_photo_from_album_command(
    state: State<ArchiveState>,
    album_id: String,
    photo_id: String,
) -> Result<(), String> {
    let archive_root = require_archive_path(&state)?;
    let conn = db::open_archive_read_write(&archive_root).map_err(|e| e.to_string())?;
    db::remove_photo_from_album(&conn, &album_id, &photo_id).map_err(|e| e.to_string())
}

/// 写真を未分類へ移動する（すべてのアルバムから外す）。入れ替え作業のため
/// 一時的に未分類へ戻したいというERGの要望により追加。写真IDごとに、
/// 外す前に属していたアルバムIDの一覧を返す（フロントエンドのUndoが
/// 元のアルバムへ正確に戻せるようにするため）。
#[tauri::command]
pub fn unfile_photos_command(
    state: State<ArchiveState>,
    photo_ids: Vec<String>,
) -> Result<HashMap<String, Vec<String>>, String> {
    let archive_root = require_archive_path(&state)?;
    let conn = db::open_archive_read_write(&archive_root).map_err(|e| e.to_string())?;
    let mut previous_albums = HashMap::new();
    for photo_id in photo_ids {
        let album_ids = db::unfile_photo(&conn, &photo_id).map_err(|e| e.to_string())?;
        previous_albums.insert(photo_id, album_ids);
    }
    Ok(previous_albums)
}

/// archive_root配下のrelative_pathを解決する。`..`等でarchive_rootの外に
/// 出ようとするパスは拒否する（フロントエンドから渡される文字列を信頼しない）。
fn resolve_safe_path(archive_root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let candidate = archive_root.join(relative_path);
    let canonical_root = archive_root
        .canonicalize()
        .map_err(|e| format!("archive_rootの解決に失敗しました: {e}"))?;
    let canonical_candidate = candidate
        .canonicalize()
        .map_err(|e| format!("ファイルが見つかりません: {e}"))?;

    if !canonical_candidate.starts_with(&canonical_root) {
        return Err("許可されていないパスです".to_string());
    }
    Ok(canonical_candidate)
}

#[tauri::command]
pub async fn read_photo_data_url(
    state: State<'_, ArchiveState>,
    relative_path: String,
    photo_id: String,
) -> Result<String, String> {
    let archive_root = require_archive_path(&state)?;
    let resolved = resolve_safe_path(&archive_root, &relative_path)?;
    let rotation_degrees = rotation::get_rotation(&archive_root, &photo_id);

    if rotation_degrees == 0 {
        // 回転指定が無ければ元ファイルをそのまま返す（デコード・再エンコードのコストを避ける）
        let extension = resolved.extension().and_then(|e| e.to_str()).unwrap_or("");
        let mime = mime_type_for_extension(extension);
        let bytes = std::fs::read(&resolved).map_err(|e| e.to_string())?;
        let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
        return Ok(format!("data:{mime};base64,{encoded}"));
    }

    // 回転済みフルサイズ画像のキャッシュがあれば、デコード・再エンコードせず
    // そのまま返す（表示のたびに毎回回転処理をやり直すと非常に遅いため）。
    let cache_path = rotated_full_cache_path(&archive_root, &photo_id)
        .ok_or_else(|| "不正な写真IDです".to_string())?;
    if !cache_path.exists() {
        let cache_path_for_task = cache_path.clone();
        tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
            let img = image::ImageReader::open(&resolved)
                .map_err(|e| e.to_string())?
                .with_guessed_format()
                .map_err(|e| e.to_string())?
                .decode()
                .map_err(|e| e.to_string())?;
            let rotated = rotate_by_degrees(img, rotation_degrees);
            if let Some(parent) = cache_path_for_task.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut output =
                std::fs::File::create(&cache_path_for_task).map_err(|e| e.to_string())?;
            rotated
                .write_to(&mut output, image::ImageFormat::Jpeg)
                .map_err(|e| e.to_string())?;
            Ok(())
        })
        .await
        .map_err(|e| e.to_string())??;
    }

    let bytes = std::fs::read(&cache_path).map_err(|e| e.to_string())?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(format!("data:image/jpeg;base64,{encoded}"))
}

/// 一覧・グリッド表示用の縮小サムネイルを返す。初回はarchive_root/.thumbnails/に
/// 生成・キャッシュし、以降はキャッシュを読むだけにする。デコード・リサイズは
/// CPU負荷が高いため、専用のブロッキングスレッドで実行しUIをブロックしない。
#[tauri::command]
pub async fn get_thumbnail_data_url(
    state: State<'_, ArchiveState>,
    photo_id: String,
    relative_path: String,
) -> Result<String, String> {
    let archive_root = require_archive_path(&state)?;
    let cache_path = thumbnail_cache_path(&archive_root, &photo_id)
        .ok_or_else(|| "不正な写真IDです".to_string())?;

    if !cache_path.exists() {
        let resolved_source = resolve_safe_path(&archive_root, &relative_path)?;
        let rotation_degrees = rotation::get_rotation(&archive_root, &photo_id);
        let cache_path_for_task = cache_path.clone();
        tauri::async_runtime::spawn_blocking(move || {
            generate_thumbnail(&resolved_source, &cache_path_for_task, rotation_degrees)
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    }

    let bytes = std::fs::read(&cache_path).map_err(|e| e.to_string())?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(format!("data:image/jpeg;base64,{encoded}"))
}

#[tauri::command]
pub fn get_photo_rotation(state: State<ArchiveState>, photo_id: String) -> Result<i32, String> {
    let archive_root = require_archive_path(&state)?;
    Ok(rotation::get_rotation(&archive_root, &photo_id))
}

/// ERGが手動で指定した写真の回転角度を保存する。元ファイルは一切変更せず、
/// archive_root配下の別ファイルに記録するのみ。既存のキャッシュ済みサムネイル・
/// 回転済みフルサイズ画像は古い向きのまま残ってしまうため削除し、
/// 次回アクセス時に新しい向きで再生成させる。
#[tauri::command]
pub fn set_photo_rotation(
    state: State<ArchiveState>,
    photo_id: String,
    degrees: i32,
) -> Result<(), String> {
    let archive_root = require_archive_path(&state)?;
    rotation::set_rotation(&archive_root, &photo_id, degrees).map_err(|e| e.to_string())?;

    let thumb_cache_path = thumbnail_cache_path(&archive_root, &photo_id)
        .ok_or_else(|| "不正な写真IDです".to_string())?;
    if thumb_cache_path.exists() {
        std::fs::remove_file(&thumb_cache_path).map_err(|e| e.to_string())?;
    }

    let full_cache_path = rotated_full_cache_path(&archive_root, &photo_id)
        .ok_or_else(|| "不正な写真IDです".to_string())?;
    if full_cache_path.exists() {
        std::fs::remove_file(&full_cache_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 動画ファイルをOS標準の動画プレイヤーで開く。動画のインライン再生や
/// コマ抽出サムネイル生成は実装コストが大きいため、既存の動画アプリに
/// 再生を任せる設計とした（ERGと合意済み）。
#[tauri::command]
pub fn open_photo_file(
    app: AppHandle,
    state: State<ArchiveState>,
    relative_path: String,
) -> Result<(), String> {
    let archive_root = require_archive_path(&state)?;
    let resolved = resolve_safe_path(&archive_root, &relative_path)?;
    app.opener()
        .open_path(resolved.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_safe_path_allows_file_within_archive_root() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(tmp.path().join("photos/2020/01")).unwrap();
        std::fs::write(tmp.path().join("photos/2020/01/a.jpg"), b"data").unwrap();

        let resolved = resolve_safe_path(tmp.path(), "photos/2020/01/a.jpg").unwrap();

        assert!(resolved.ends_with("a.jpg"));
    }

    #[test]
    fn resolve_safe_path_rejects_path_traversal_outside_archive_root() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(tmp.path().join("archive/photos")).unwrap();
        std::fs::write(tmp.path().join("secret.txt"), b"secret").unwrap();

        let archive_root = tmp.path().join("archive");
        let result = resolve_safe_path(&archive_root, "../secret.txt");

        assert!(result.is_err());
    }

    #[test]
    fn resolve_safe_path_rejects_missing_file() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(tmp.path()).unwrap();

        let result = resolve_safe_path(tmp.path(), "does_not_exist.jpg");

        assert!(result.is_err());
    }
}
