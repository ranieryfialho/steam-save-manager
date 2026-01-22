// src-tauri/src/commands/game_commands.rs
use tauri::{AppHandle, command, Window, Emitter, Manager};
use crate::models::{GameInfo, BackupEntry, LudusaviManifest};
use crate::services::steam_service::SteamService;
use crate::services::backup_service::BackupService;
use crate::services::watcher_service::WatcherService;
use crate::services::config_service::{ConfigService, AppConfig}; // Agora vai funcionar
use std::fs;

#[command]
pub fn get_installed_games() -> Vec<GameInfo> {
    SteamService::list_installed_games()
}

#[command]
pub async fn backup_game(
    window: Window, 
    app: AppHandle, 
    game_id: u32, 
    game_name: String,
    retention_limit: usize
) -> String {
    tauri::async_runtime::spawn_blocking(move || {
        let res = BackupService::perform_backup(window.clone(), app, game_id, game_name.clone());
        if res.starts_with("Sucesso") {
            let _ = BackupService::cleanup_old_backups(game_name, retention_limit);
            let _ = window.emit("backup-status", "Política de retenção aplicada.");
        }
        res
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
pub async fn toggle_auto_backup(
    window: Window, 
    app: AppHandle, 
    game_id: u32, 
    game_name: String, 
    enable: bool
) -> Result<String, String> {
    if enable {
        let mut paths = SteamService::get_manifest_paths(&app, game_id);
        if let Some(cp) = SteamService::get_custom_path(&app, game_id) {
            paths.push(cp);
        }
        if paths.is_empty() { return Err("Caminho não encontrado.".to_string()); }
        WatcherService::start_watching(window, app, game_id, game_name, paths);
        Ok("Ativado".to_string())
    } else {
        Ok("Desativado".to_string())
    }
}

#[command]
pub fn load_app_config(app: AppHandle) -> AppConfig {
    ConfigService::load_config(&app)
}

#[command]
pub fn save_app_config(app: AppHandle, retention_limit: usize) -> Result<(), String> {
    ConfigService::save_config(&app, AppConfig { retention_limit })
}

#[command]
pub async fn update_manifest_db(app: AppHandle) -> Result<String, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    if !app_dir.exists() { fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?; }
    let local_path = app_dir.join("manifest.yaml");
    let res = reqwest::get("https://raw.githubusercontent.com/mtkennerly/ludusavi-manifest/master/data/manifest.yaml")
        .await.map_err(|e| e.to_string())?;
    let content = res.text().await.map_err(|e| e.to_string())?;
    if serde_yaml::from_str::<LudusaviManifest>(&content).is_ok() {
        fs::write(&local_path, &content).map_err(|e| e.to_string())?;
        Ok("Sincronizado".to_string())
    } else {
        Err("YAML inválido".to_string())
    }
}