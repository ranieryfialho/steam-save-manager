// src-tauri/src/services/config_service.rs
use serde::{Deserialize, Serialize};
use std::fs;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub retention_limit: usize,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self { retention_limit: 10 }
    }
}

pub struct ConfigService;

impl ConfigService {
    pub fn get_config_path(app: &AppHandle) -> std::path::PathBuf {
        app.path().app_data_dir().unwrap().join("config.json")
    }

    pub fn load_config(app: &AppHandle) -> AppConfig {
        let path = Self::get_config_path(app);
        if !path.exists() { return AppConfig::default(); }
        
        let content = fs::read_to_string(path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_default()
    }

    pub fn save_config(app: &AppHandle, config: AppConfig) -> Result<(), String> {
        let path = Self::get_config_path(app);
        
        // Garante que a pasta app_data existe
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }

        let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
        fs::write(path, content).map_err(|e| e.to_string())
    }
}