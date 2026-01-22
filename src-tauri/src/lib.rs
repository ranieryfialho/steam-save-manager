mod models;
mod services;
mod commands;

use std::sync::Mutex;
use models::AuthState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AuthState {
            access_token: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            commands::game_commands::get_installed_games,
            commands::game_commands::backup_game,
            commands::game_commands::update_manifest_db,
            commands::game_commands::get_backups,
            commands::game_commands::restore_backup,
            commands::game_commands::create_zip_for_cloud,
            commands::cloud_commands::login_google_drive,
            commands::cloud_commands::check_auth_status,
            commands::cloud_commands::upload_to_drive,
            commands::cloud_commands::get_google_user,
            commands::cloud_commands::logout_google
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}