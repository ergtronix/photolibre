use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use base64::Engine;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

use crate::db::{self, Album, Photo, PhotoFilter};
use crate::import::{self, DedupStatus, ImportState, MediaKind, PendingImport, PendingImportItem};
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

// ---------------------------------------------------------------------------
// デジカメ/SDカード取り込み機能（TASK-053、C-3: Tauriコマンド層）
// ---------------------------------------------------------------------------

/// `import-progress`イベントの送信間隔を制御する。UIの再描画コストを
/// 抑えるため、通常は`INTERVAL`未満の間隔での連続送信を間引くが、
/// `is_last = true`（バッチの最後の1件）の場合は間隔に関わらず必ず送信する
/// （完了条件: 100〜150ms間隔でスロットル、最終100%は必ず送る）。
struct ProgressThrottle {
    last_emit: Instant,
    interval: Duration,
}

impl ProgressThrottle {
    const INTERVAL_MS: u64 = 120;

    fn new() -> Self {
        Self {
            // 初回呼び出しが必ず送信されるよう、intervalぶん過去の時刻から始める。
            last_emit: Instant::now() - Duration::from_millis(Self::INTERVAL_MS * 2),
            interval: Duration::from_millis(Self::INTERVAL_MS),
        }
    }

    fn should_emit(&mut self, is_last: bool) -> bool {
        if is_last || self.last_emit.elapsed() >= self.interval {
            self.last_emit = Instant::now();
            true
        } else {
            false
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportProgressPayload {
    phase: String,
    current: usize,
    total: usize,
    current_file: String,
}

/// フロントエンド向けにシリアライズ可能な`DedupStatus`のDTO表現。
/// `import::DedupStatus`自体は`Serialize`を実装していない（DB層専用の内部型の
/// ため）ので、コマンド層でこの変換用の型を持つ。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum DedupStatusDto {
    New,
    #[serde(rename_all = "camelCase")]
    DuplicateOfExisting {
        photo_id: String,
    },
    #[serde(rename_all = "camelCase")]
    DuplicateWithinBatch {
        first_seen_path: String,
    },
}

impl From<&DedupStatus> for DedupStatusDto {
    fn from(status: &DedupStatus) -> Self {
        match status {
            DedupStatus::New => DedupStatusDto::New,
            DedupStatus::DuplicateOfExisting { photo_id } => DedupStatusDto::DuplicateOfExisting {
                photo_id: photo_id.clone(),
            },
            DedupStatus::DuplicateWithinBatch { first_seen_path } => {
                DedupStatusDto::DuplicateWithinBatch {
                    first_seen_path: first_seen_path.to_string_lossy().to_string(),
                }
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreviewItem {
    pub source_path: String,
    pub filename: String,
    pub kind: MediaKind,
    pub dedup_status: DedupStatusDto,
    pub date_taken: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview {
    pub new_count: usize,
    pub duplicate_count: usize,
    pub error_count: usize,
    pub items: Vec<ImportPreviewItem>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportCommitResult {
    pub inserted_count: usize,
    pub duplicate_count: usize,
    pub failed_files: Vec<String>,
}

impl From<db::ImportCommitSummary> for ImportCommitResult {
    fn from(summary: db::ImportCommitSummary) -> Self {
        Self {
            inserted_count: summary.inserted_photo_ids.len(),
            duplicate_count: summary.duplicate_count,
            failed_files: summary.failed_files,
        }
    }
}

/// 走査済みファイル一覧に対してハッシュ計算・重複判定を行う（`scan_folder`自体は
/// 呼び出し側で実行済みという前提）。単体テストで実際のファイルシステム走査を
/// 経由せずにハッシュ失敗（`on_progress`のスキップ挙動含む）を再現できるよう、
/// `import::scan_folder`の呼び出しと分離している。
///
/// ハッシュ計算に失敗したファイルは中断せずスキップし、`error_count`に数える
/// （完了条件: 書き込みは一切せず、エラー件数を含むプレビューを返す）。
fn classify_scanned_files<F>(
    source_folder: &Path,
    scanned: Vec<import::ScannedFile>,
    known_hashes: &HashMap<String, String>,
    mut on_progress: F,
) -> (PendingImport, usize)
where
    F: FnMut(usize, usize, &Path),
{
    let total = scanned.len();
    let mut error_count = 0usize;
    let mut hashed: Vec<(PathBuf, MediaKind, String)> = Vec::with_capacity(total);

    for (index, file) in scanned.into_iter().enumerate() {
        on_progress(index + 1, total, &file.path);
        match import::hash_file(&file.path) {
            Ok(sha256) => hashed.push((file.path, file.kind, sha256)),
            Err(err) => {
                eprintln!(
                    "scan_import_source_command: {}のハッシュ計算に失敗したためスキップします: {err}",
                    file.path.display()
                );
                error_count += 1;
            }
        }
    }

    let candidates: Vec<(PathBuf, String)> = hashed
        .iter()
        .map(|(path, _, sha256)| (path.clone(), sha256.clone()))
        .collect();
    let classified = import::classify_batch(&candidates, known_hashes);

    let items: Vec<PendingImportItem> = hashed
        .into_iter()
        .zip(classified)
        .map(
            |((path, kind, sha256), (_, dedup_status))| PendingImportItem {
                metadata: import::read_metadata(&path, kind),
                source_path: path,
                kind,
                sha256,
                dedup_status,
            },
        )
        .collect();

    (
        PendingImport {
            source_folder: source_folder.to_path_buf(),
            items,
        },
        error_count,
    )
}

/// `source_folder`配下を実際に走査してから`classify_scanned_files`に委譲する
/// 薄いラッパー（実ファイルシステムに依存するため単体テストは
/// `classify_scanned_files`側で行う）。
fn scan_and_classify_with_progress<F>(
    source_folder: &Path,
    known_hashes: &HashMap<String, String>,
    on_progress: F,
) -> (PendingImport, usize)
where
    F: FnMut(usize, usize, &Path),
{
    let scanned = import::scan_folder(source_folder);
    classify_scanned_files(source_folder, scanned, known_hashes, on_progress)
}

/// スキャン結果（`PendingImport`）から、フロントエンド向けの`ImportPreview`を
/// 組み立てる。書き込みは一切行わない。
fn build_import_preview(pending: &PendingImport, error_count: usize) -> ImportPreview {
    let mut new_count = 0usize;
    let mut duplicate_count = 0usize;

    let items = pending
        .items
        .iter()
        .map(|item| {
            match &item.dedup_status {
                DedupStatus::New => new_count += 1,
                DedupStatus::DuplicateOfExisting { .. }
                | DedupStatus::DuplicateWithinBatch { .. } => duplicate_count += 1,
            }
            ImportPreviewItem {
                source_path: item.source_path.to_string_lossy().to_string(),
                filename: item
                    .source_path
                    .file_name()
                    .map(|f| f.to_string_lossy().to_string())
                    .unwrap_or_default(),
                kind: item.kind,
                dedup_status: DedupStatusDto::from(&item.dedup_status),
                date_taken: item.metadata.date_taken.clone(),
            }
        })
        .collect();

    ImportPreview {
        new_count,
        duplicate_count,
        error_count,
        items,
    }
}

/// フロントエンドから渡された選択済みソースパス一覧に基づき、
/// プレビュー済みの`PendingImport`から実際にコミット対象とする項目だけを絞り込む。
fn select_pending_items(
    pending: PendingImport,
    selected_source_paths: &[String],
) -> Vec<PendingImportItem> {
    let selected: HashSet<PathBuf> = selected_source_paths.iter().map(PathBuf::from).collect();
    pending
        .items
        .into_iter()
        .filter(|item| selected.contains(&item.source_path))
        .collect()
}

/// プレビュー画面用に、元ファイルから直接サムネイルを生成しdata URLとして返す。
/// `archive_root/.thumbnails/`には一切書き込まない
/// （プレビュー段階のファイルはまだアーカイブに属さないため）。
/// `temp_dir`配下に一意な一時ファイルを作り、成功・失敗どちらの場合も
/// 必ず削除する（単体テストで`temp_dir`を差し替えられるようにするための分離）。
fn generate_preview_thumbnail_data_url_in(
    temp_dir: &Path,
    source_path: &Path,
) -> Result<String, String> {
    let temp_path = temp_dir.join(format!(
        "photolibre-import-preview-{}.jpg",
        uuid::Uuid::new_v4()
    ));

    let result = (|| -> Result<String, String> {
        generate_thumbnail(source_path, &temp_path, 0).map_err(|e| e.to_string())?;
        let bytes = std::fs::read(&temp_path).map_err(|e| e.to_string())?;
        let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
        Ok(format!("data:image/jpeg;base64,{encoded}"))
    })();

    if temp_path.exists() {
        if let Err(remove_err) = std::fs::remove_file(&temp_path) {
            eprintln!(
                "get_import_preview_thumbnail_command: 一時ファイル{}の削除に失敗しました: {remove_err}",
                temp_path.display()
            );
        }
    }

    result
}

fn generate_preview_thumbnail_data_url(source_path: &Path) -> Result<String, String> {
    generate_preview_thumbnail_data_url_in(&std::env::temp_dir(), source_path)
}

/// `source_path`が現在プレビュー中の`PendingImport`（`ImportState`）に含まれる
/// ファイルであることを検証する。`pending`が`None`（まだ走査されていない）の
/// 場合も拒否する。
///
/// rust-reviewer指摘（TASK-382 M1）: このチェックが無いと、Webview経由で
/// `source_path`に任意のローカルパスを渡すことで、`generate_thumbnail`が
/// 成功/失敗するかによってファイルの存在確認・画像内容の取得を許してしまう
/// （他のアーカイブ内パスを扱うコマンドが`resolve_safe_path`で許可範囲を
/// 限定しているのと同様、プレビュー対象はスキャン結果に含まれるパスのみに
/// 限定する）。
fn validate_preview_source_path(
    pending: Option<&PendingImport>,
    source_path: &Path,
) -> Result<(), String> {
    let pending = pending.ok_or_else(|| {
        "取り込み対象がプレビューされていません。先にフォルダを走査してください".to_string()
    })?;

    let is_allowed = pending
        .items
        .iter()
        .any(|item| item.source_path == source_path);

    if is_allowed {
        Ok(())
    } else {
        Err("指定されたパスはプレビュー対象に含まれていません".to_string())
    }
}

/// 選択したフォルダを走査し、ハッシュ計算・重複判定まで行う。**書き込みは
/// 一切行わない**（DBにも触れず、ファイルコピーもしない）。結果は`ImportState`に
/// 保存し、続く`commit_import_command`が再スキャンせずに使えるようにする。
#[tauri::command]
pub async fn scan_import_source_command(
    app: AppHandle,
    archive_state: State<'_, ArchiveState>,
    import_state: State<'_, ImportState>,
    source_folder: String,
) -> Result<ImportPreview, String> {
    let archive_root = require_archive_path(&archive_state)?;
    let source_folder_path = PathBuf::from(&source_folder);

    let conn = db::open_archive(&archive_root).map_err(|e| e.to_string())?;
    let known_hashes = import::load_known_hashes(&conn).map_err(|e| e.to_string())?;
    drop(conn);

    let app_for_progress = app.clone();
    let (pending, error_count) = tauri::async_runtime::spawn_blocking(move || {
        let mut throttle = ProgressThrottle::new();
        scan_and_classify_with_progress(
            &source_folder_path,
            &known_hashes,
            move |current, total, path| {
                let is_last = current == total;
                if throttle.should_emit(is_last) {
                    let _ = app_for_progress.emit(
                        "import-progress",
                        ImportProgressPayload {
                            phase: "scanning".to_string(),
                            current,
                            total,
                            current_file: path
                                .file_name()
                                .map(|f| f.to_string_lossy().to_string())
                                .unwrap_or_default(),
                        },
                    );
                }
            },
        )
    })
    .await
    .map_err(|e| e.to_string())?;

    let preview = build_import_preview(&pending, error_count);
    *import_state.0.lock().unwrap() = Some(pending);
    Ok(preview)
}

/// プレビューで選択された項目のみを実際にコピー＋DB挿入する。1ファイル単位の
/// コピー失敗はスキップして続行し（失敗ファイル名一覧を返す）、連続失敗時は
/// 早期中断する（`db::commit_new_import_items_with_progress`が実装）。
/// `album_name`を指定した場合、新規作成したアルバムに今回挿入した写真を追加する。
#[tauri::command]
pub async fn commit_import_command(
    app: AppHandle,
    archive_state: State<'_, ArchiveState>,
    import_state: State<'_, ImportState>,
    selected_source_paths: Vec<String>,
    album_name: Option<String>,
) -> Result<ImportCommitResult, String> {
    let archive_root = require_archive_path(&archive_state)?;

    let pending = import_state.0.lock().unwrap().clone().ok_or_else(|| {
        "取り込み対象がプレビューされていません。先にフォルダを走査してください".to_string()
    })?;
    let selected_items = select_pending_items(pending, &selected_source_paths);

    let app_for_progress = app.clone();
    let archive_root_for_task = archive_root.clone();
    let summary =
        tauri::async_runtime::spawn_blocking(move || -> Result<db::ImportCommitSummary, String> {
            let mut conn =
                db::open_archive_read_write(&archive_root_for_task).map_err(|e| e.to_string())?;
            let mut throttle = ProgressThrottle::new();
            let summary = db::commit_new_import_items_with_progress(
                &mut conn,
                &archive_root_for_task,
                &selected_items,
                |current, total, filename, is_last| {
                    if throttle.should_emit(is_last) {
                        let _ = app_for_progress.emit(
                            "import-progress",
                            ImportProgressPayload {
                                phase: "copying".to_string(),
                                current,
                                total,
                                current_file: filename.to_string(),
                            },
                        );
                    }
                },
            )
            .map_err(|e| e.to_string())?;

            if let Some(name) = &album_name {
                if !summary.inserted_photo_ids.is_empty() {
                    let album = db::create_album(&conn, name).map_err(|e| e.to_string())?;
                    db::add_photos_to_album(&conn, &album.id, &summary.inserted_photo_ids)
                        .map_err(|e| e.to_string())?;
                }
            }

            Ok(summary)
        })
        .await
        .map_err(|e| e.to_string())??;

    *import_state.0.lock().unwrap() = None;

    Ok(ImportCommitResult::from(summary))
}

/// プレビュー画面用に、元ファイル（まだarchive_rootに属さない）から直接
/// サムネイルを都度生成して返す。`archive_root/.thumbnails/`には書き込まない。
///
/// `source_path`は現在プレビュー中の`ImportState`に含まれるパスのみ許可する
/// （M1: 任意ローカルパスを受け付けてしまうと、Webview経由でファイルの
/// 存在確認・内容取得のオラクルとして悪用され得るため）。
#[tauri::command]
pub async fn get_import_preview_thumbnail_command(
    import_state: State<'_, ImportState>,
    source_path: String,
) -> Result<String, String> {
    let source = PathBuf::from(source_path);
    validate_preview_source_path(import_state.0.lock().unwrap().as_ref(), &source)?;

    tauri::async_runtime::spawn_blocking(move || generate_preview_thumbnail_data_url(&source))
        .await
        .map_err(|e| e.to_string())?
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

    // -----------------------------------------------------------------
    // TASK-382（C-3: Tauriコマンド層）: デジカメ/SDカード取り込み機能
    // -----------------------------------------------------------------

    fn sample_item(source_path: &str, dedup_status: DedupStatus) -> PendingImportItem {
        PendingImportItem {
            source_path: PathBuf::from(source_path),
            kind: MediaKind::Photo,
            sha256: format!("hash-{source_path}"),
            metadata: import::PhotoMetadata::default(),
            dedup_status,
        }
    }

    #[test]
    fn progress_throttle_emits_first_call_immediately() {
        let mut throttle = ProgressThrottle::new();

        assert!(throttle.should_emit(false));
    }

    #[test]
    fn progress_throttle_suppresses_rapid_successive_calls() {
        let mut throttle = ProgressThrottle::new();
        assert!(throttle.should_emit(false));

        assert!(
            !throttle.should_emit(false),
            "直後の呼び出しはスロットルされ、送信されないこと"
        );
    }

    #[test]
    fn progress_throttle_always_emits_when_is_last_true() {
        let mut throttle = ProgressThrottle::new();
        assert!(throttle.should_emit(false));

        assert!(
            throttle.should_emit(true),
            "is_last=trueの場合は間隔に関わらず必ず送信されること"
        );
    }

    #[test]
    fn dedup_status_dto_converts_all_variants() {
        assert_eq!(DedupStatusDto::from(&DedupStatus::New), DedupStatusDto::New);
        assert_eq!(
            DedupStatusDto::from(&DedupStatus::DuplicateOfExisting {
                photo_id: "P-1".to_string()
            }),
            DedupStatusDto::DuplicateOfExisting {
                photo_id: "P-1".to_string()
            }
        );
        assert_eq!(
            DedupStatusDto::from(&DedupStatus::DuplicateWithinBatch {
                first_seen_path: PathBuf::from("a.jpg")
            }),
            DedupStatusDto::DuplicateWithinBatch {
                first_seen_path: "a.jpg".to_string()
            }
        );
    }

    #[test]
    fn classify_scanned_files_marks_new_and_duplicate_items() {
        let tmp = tempfile::tempdir().unwrap();
        let new_path = tmp.path().join("new.jpg");
        std::fs::write(&new_path, b"brand new").unwrap();
        let dup_path = tmp.path().join("dup.jpg");
        std::fs::write(&dup_path, b"duplicate content").unwrap();
        let dup_hash = import::hash_file(&dup_path).unwrap();

        let mut known_hashes = HashMap::new();
        known_hashes.insert(dup_hash, "EXISTING-1".to_string());

        let scanned = vec![
            import::ScannedFile {
                path: new_path,
                kind: MediaKind::Photo,
            },
            import::ScannedFile {
                path: dup_path,
                kind: MediaKind::Photo,
            },
        ];

        let (pending, error_count) =
            classify_scanned_files(tmp.path(), scanned, &known_hashes, |_, _, _| {});

        assert_eq!(error_count, 0);
        assert_eq!(pending.items.len(), 2);
        assert_eq!(pending.items[0].dedup_status, DedupStatus::New);
        assert_eq!(
            pending.items[1].dedup_status,
            DedupStatus::DuplicateOfExisting {
                photo_id: "EXISTING-1".to_string()
            }
        );
    }

    #[test]
    fn classify_scanned_files_counts_hash_errors_and_skips_them() {
        let tmp = tempfile::tempdir().unwrap();
        let missing_path = tmp.path().join("missing.jpg"); // 意図的に作成しない
        let ok_path = tmp.path().join("ok.jpg");
        std::fs::write(&ok_path, b"ok content").unwrap();

        let scanned = vec![
            import::ScannedFile {
                path: missing_path,
                kind: MediaKind::Photo,
            },
            import::ScannedFile {
                path: ok_path,
                kind: MediaKind::Photo,
            },
        ];

        let (pending, error_count) =
            classify_scanned_files(tmp.path(), scanned, &HashMap::new(), |_, _, _| {});

        assert_eq!(
            error_count, 1,
            "ハッシュ計算に失敗した1件がエラーとしてカウントされること"
        );
        assert_eq!(
            pending.items.len(),
            1,
            "失敗した項目はitemsに含まれないこと"
        );
        assert!(pending.items[0].source_path.ends_with("ok.jpg"));
    }

    #[test]
    fn classify_scanned_files_calls_on_progress_once_per_scanned_file() {
        let tmp = tempfile::tempdir().unwrap();
        let a = tmp.path().join("a.jpg");
        std::fs::write(&a, b"a").unwrap();
        let b = tmp.path().join("b.jpg");
        std::fs::write(&b, b"b").unwrap();

        let scanned = vec![
            import::ScannedFile {
                path: a,
                kind: MediaKind::Photo,
            },
            import::ScannedFile {
                path: b,
                kind: MediaKind::Photo,
            },
        ];

        let mut calls = Vec::new();
        classify_scanned_files(
            tmp.path(),
            scanned,
            &HashMap::new(),
            |current, total, _path| {
                calls.push((current, total));
            },
        );

        assert_eq!(calls, vec![(1, 2), (2, 2)]);
    }

    #[test]
    fn build_import_preview_counts_new_duplicate_and_error() {
        let pending = PendingImport {
            source_folder: PathBuf::from("D:/DCIM"),
            items: vec![
                sample_item("D:/DCIM/a.jpg", DedupStatus::New),
                sample_item(
                    "D:/DCIM/b.jpg",
                    DedupStatus::DuplicateOfExisting {
                        photo_id: "P-1".to_string(),
                    },
                ),
            ],
        };

        let preview = build_import_preview(&pending, 2);

        assert_eq!(preview.new_count, 1);
        assert_eq!(preview.duplicate_count, 1);
        assert_eq!(preview.error_count, 2);
        assert_eq!(preview.items.len(), 2);
        assert_eq!(preview.items[0].filename, "a.jpg");
    }

    #[test]
    fn select_pending_items_filters_by_selected_source_paths() {
        let item_a = sample_item("D:/DCIM/a.jpg", DedupStatus::New);
        let item_b = sample_item("D:/DCIM/b.jpg", DedupStatus::New);
        let pending = PendingImport {
            source_folder: PathBuf::from("D:/DCIM"),
            items: vec![item_a.clone(), item_b],
        };

        let selected = select_pending_items(pending, &["D:/DCIM/a.jpg".to_string()]);

        assert_eq!(selected, vec![item_a]);
    }

    #[test]
    fn select_pending_items_returns_empty_when_nothing_selected() {
        let pending = PendingImport {
            source_folder: PathBuf::from("D:/DCIM"),
            items: vec![sample_item("D:/DCIM/a.jpg", DedupStatus::New)],
        };

        let selected = select_pending_items(pending, &[]);

        assert!(selected.is_empty());
    }

    // -----------------------------------------------------------------
    // TASK-382差し戻し（rust-reviewer MEDIUM指摘M1）:
    // get_import_preview_thumbnail_commandが任意パスを未検証で受理し、
    // Webview経由でファイルの存在確認・内容取得のオラクルとして悪用され得る
    // 問題への対応。プレビュー対象（ImportStateに保持されたPendingImport）に
    // 含まれるsource_pathのみ許可する。
    // -----------------------------------------------------------------

    #[test]
    fn validate_preview_source_path_allows_path_present_in_pending_items() {
        let pending = PendingImport {
            source_folder: PathBuf::from("D:/DCIM"),
            items: vec![sample_item("D:/DCIM/a.jpg", DedupStatus::New)],
        };

        let result = validate_preview_source_path(Some(&pending), Path::new("D:/DCIM/a.jpg"));

        assert!(result.is_ok());
    }

    #[test]
    fn validate_preview_source_path_rejects_path_not_in_pending_items() {
        let pending = PendingImport {
            source_folder: PathBuf::from("D:/DCIM"),
            items: vec![sample_item("D:/DCIM/a.jpg", DedupStatus::New)],
        };

        let result = validate_preview_source_path(
            Some(&pending),
            Path::new("C:/Windows/System32/config/SAM"),
        );

        assert!(
            result.is_err(),
            "プレビュー対象に含まれない任意パスは拒否されること"
        );
    }

    #[test]
    fn validate_preview_source_path_rejects_when_no_pending_import() {
        let result = validate_preview_source_path(None, Path::new("D:/DCIM/a.jpg"));

        assert!(
            result.is_err(),
            "ImportStateが空（未走査）の場合は拒否されること"
        );
    }

    #[test]
    fn validate_preview_source_path_rejects_empty_pending_items() {
        let pending = PendingImport {
            source_folder: PathBuf::from("D:/DCIM"),
            items: vec![],
        };

        let result = validate_preview_source_path(Some(&pending), Path::new("D:/DCIM/a.jpg"));

        assert!(result.is_err());
    }

    fn write_sample_png(path: &Path) {
        let img = image::RgbImage::from_pixel(4, 4, image::Rgb([10, 20, 30]));
        img.save(path).unwrap();
    }

    #[test]
    fn generate_preview_thumbnail_data_url_in_returns_data_url_and_cleans_up_temp_dir() {
        let source_tmp = tempfile::tempdir().unwrap();
        let source = source_tmp.path().join("sample.png");
        write_sample_png(&source);
        let temp_dir = tempfile::tempdir().unwrap();

        let result = generate_preview_thumbnail_data_url_in(temp_dir.path(), &source).unwrap();

        assert!(result.starts_with("data:image/jpeg;base64,"));
        let remaining: Vec<_> = std::fs::read_dir(temp_dir.path()).unwrap().collect();
        assert!(
            remaining.is_empty(),
            "一時ファイルが削除され、temp_dirに何も残らないこと"
        );
    }

    #[test]
    fn generate_preview_thumbnail_data_url_in_cleans_up_temp_dir_even_on_failure() {
        let temp_dir = tempfile::tempdir().unwrap();
        let missing = Path::new("Z:/does/not/exist.jpg");

        let result = generate_preview_thumbnail_data_url_in(temp_dir.path(), missing);

        assert!(result.is_err());
        let remaining: Vec<_> = std::fs::read_dir(temp_dir.path()).unwrap().collect();
        assert!(remaining.is_empty(), "失敗時も一時ファイルが残らないこと");
    }

    #[test]
    fn generate_preview_thumbnail_data_url_in_never_writes_to_thumbnails_cache_dir() {
        let source_tmp = tempfile::tempdir().unwrap();
        let source = source_tmp.path().join("sample.png");
        write_sample_png(&source);

        let archive_root = tempfile::tempdir().unwrap();
        let thumbnails_dir = archive_root.path().join(".thumbnails");
        let temp_dir = tempfile::tempdir().unwrap();

        generate_preview_thumbnail_data_url_in(temp_dir.path(), &source).unwrap();

        assert!(
            !thumbnails_dir.exists(),
            "archive_root/.thumbnailsには一切書き込まれないこと"
        );
    }
}
