use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;

pub struct AuthState {
    pub access_token: Mutex<Option<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GameInfo {
    pub id: u32,
    pub name: String,
    pub install_dir: String,
    pub last_backup: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupEntry {
    pub name: String,
    pub path: String,
    pub has_zip: bool,
    pub size_mb: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GoogleProfile {
    pub name: String,
    pub picture: String,
}

#[derive(Debug, Deserialize)]
pub struct LudusaviManifest {
    #[serde(flatten)]
    pub games: HashMap<String, LudusaviGame>,
}

#[derive(Debug, Deserialize)]
pub struct LudusaviGame {
    pub steam: Option<LudusaviSteam>,
    pub files: Option<HashMap<String, serde_yaml::Value>>,
}

#[derive(Debug, Deserialize)]
pub struct LudusaviSteam {
    pub id: u32,
}

#[derive(Debug, Deserialize)]
pub struct CustomGameEntry {
    pub win: String,
}