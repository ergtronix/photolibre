mod commands;
mod db;
mod mime;
mod rotation;
mod thumbnail;

use commands::ArchiveState;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(ArchiveState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            commands::set_archive_path,
            commands::get_archive_path,
            commands::list_photos_command,
            commands::list_albums_command,
            commands::list_album_photos_command,
            commands::search_photos_command,
            commands::read_photo_data_url,
            commands::get_thumbnail_data_url,
            commands::get_photo_rotation,
            commands::set_photo_rotation,
            commands::open_photo_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
