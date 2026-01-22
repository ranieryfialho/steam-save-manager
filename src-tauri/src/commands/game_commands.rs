use tauri::{AppHandle, command, Manager, Window};
use crate::models::{GameInfo, BackupEntry, LudusaviManifest};
use crate::services::steam_service::SteamService;
use crate::services::backup_service::BackupService;
use std::fs;

#[command]
pub fn get_installed_games() -> Vec<GameInfo> {
    SteamService::list_installed_games()
}

#[command]
pub async fn backup_game(window: Window, app: AppHandle, game_id: u32, game_name: String) -> String {
    tauri::async_runtime::spawn_blocking(move || {
        BackupService::perform_backup(window, app, game_id, game_name)
    }).await.unwrap_or_else(|e| format!("Erro: {}", e))
}

#[command]
pub fn get_backups(game_name: String) -> Vec<BackupEntry> {
    BackupService::list_backups(game_name)
}

#[command]
pub fn restore_backup(app: AppHandle, game_id: u32, game_name: String, timestamp: String) -> String {
    BackupService::restore_backup(app, game_id, game_name, timestamp)
}

#[command]
pub fn create_zip_for_cloud(game_name: String, timestamp: String) -> String {
    BackupService::zip_for_cloud(game_name, timestamp)
}

#[command]
pub async fn update_manifest_db(app: AppHandle) -> Result<String, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    if !app_dir.exists() { fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?; }
    let local_path = app_dir.join("manifest.yaml");
    let response = reqwest::get("https://raw.githubusercontent.com/mtkennerly/ludusavi-manifest/master/data/manifest.yaml")
        .await.map_err(|e| e.to_string())?;
    let content = response.text().await.map_err(|e| e.to_string())?;
    if serde_yaml::from_str::<LudusaviManifest>(&content).is_ok() {
        fs::write(&local_path, &content).map_err(|e| e.to_string())?;
        Ok("Atualizado.".to_string())
    } else {
        Err("YAML inválido.".to_string())
    }
}