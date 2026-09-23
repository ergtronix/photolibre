mod commands;
mod db;
mod import;
mod mime;
mod rotation;
mod safe_id;
mod thumbnail;

use commands::ArchiveState;
use import::ImportState;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 2回目の起動を検知したら、新しいウィンドウを作らず、
            // 既存のウィンドウを前面に出す（二重起動防止、TASK-394）。
            if let Some(window) = app.get_webview_window("main") {
                if let Err(e) = window.show() {
                    eprintln!("single-instance: failed to show window: {e}");
                }
                if let Err(e) = window.unminimize() {
                    eprintln!("single-instance: failed to unminimize window: {e}");
                }
                if let Err(e) = window.set_focus() {
                    eprintln!("single-instance: failed to focus window: {e}");
                }
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(ArchiveState(Mutex::new(None)))
        .manage(ImportState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            commands::set_archive_path,
            commands::get_archive_path,
            commands::list_photos_command,
            commands::list_photo_years_command,
            commands::list_albums_command,
            commands::list_album_photos_command,
            commands::search_photos_command,
            commands::list_unfiled_photos_command,
            commands::count_unfiled_photos_command,
            commands::create_album_command,
            commands::rename_album_command,
            commands::delete_viewer_album_command,
            commands::add_photos_to_album_command,
            commands::remove_photo_from_album_command,
            commands::unfile_photos_command,
            commands::read_photo_data_url,
            commands::get_thumbnail_data_url,
            commands::get_photo_rotation,
            commands::set_photo_rotation,
            commands::open_photo_file,
            commands::scan_import_source_command,
            commands::commit_import_command,
            commands::get_import_preview_thumbnail_command,
            commands::list_photos_by_ids_command,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
