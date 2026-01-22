use std::path::{PathBuf};
use std::fs;
use std::collections::HashMap;
use steamlocate::SteamDir;
use directories::{BaseDirs, UserDirs};
use tauri::{AppHandle, Manager};
use crate::models::{GameInfo, LudusaviManifest, CustomGameEntry};

pub struct SteamService;

impl SteamService {
    pub fn list_installed_games() -> Vec<GameInfo> {
        let steamdir = match SteamDir::locate() {
            Ok(d) => d,
            Err(_) => return Vec::new(),
        };
        
        let mut games_list = Vec::new();
        if let Ok(libraries) = steamdir.libraries() {
            for library in libraries.flatten() {
                for app in library.apps().flatten() {
                    let name = app.name.clone().unwrap_or("Unknown".to_string());
                    if name == "Steamworks Common Redistributables" || name.contains("Proton") {
                        continue;
                    }
                    games_list.push(GameInfo {
                        id: app.app_id,
                        name: name.clone(),
                        install_dir: app.install_dir.to_string(),
                        last_backup: Self::check_existing_backup(&name),
                    });
                }
            }
        }
        games_list
    }

    pub fn check_existing_backup(game_name: &str) -> Option<String> {
        let user_dirs = UserDirs::new()?;
        let doc_dir = user_dirs.document_dir()?;
        let safe_name = game_name.replace(|c: char| !c.is_alphanumeric() && c != ' ', "_");
        let backup_path = doc_dir.join("SaveManagerBackups").join(safe_name);
        
        if !backup_path.exists() { return None; }
        
        let mut entries: Vec<String> = fs::read_dir(backup_path)
            .ok()?
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.path().is_dir())
            .map(|entry| entry.file_name().to_string_lossy().to_string())
            .collect();
        
        entries.sort();
        entries.pop()
    }

    pub fn resolve_path_root(path_str: &str, game_id: u32) -> PathBuf {
        let base_dirs = BaseDirs::new().expect("BaseDirs error");
        let user_dirs = UserDirs::new().expect("UserDirs error");

        // Lógica para Linux/Proton
        if cfg!(target_os = "linux") && (path_str.contains("AppData") || path_str.contains("Saved Games")) {
            if let Ok(steamdir) = SteamDir::locate() {
                let proton_path = steamdir.path()
                    .join("steamapps")
                    .join("compatdata")
                    .join(game_id.to_string())
                    .join("pfx")
                    .join("drive_c")
                    .join("users")
                    .join("steamuser");

                if proton_path.exists() {
                    let mut resolved = path_str.to_string();
                    resolved = resolved.replace("%USERPROFILE%", proton_path.to_str().unwrap());
                    resolved = resolved.replace("<home>", proton_path.to_str().unwrap());
                    resolved = resolved.replace("%APPDATA%", proton_path.join("AppData").join("Roaming").to_str().unwrap());
                    resolved = resolved.replace("%LOCALAPPDATA%", proton_path.join("AppData").join("Local").to_str().unwrap());

                    let mut p = PathBuf::from(resolved.replace("\\", "/"));
                    if p.to_string_lossy().starts_with("C:") || p.to_string_lossy().starts_with("c:") {
                        p = PathBuf::from(p.to_string_lossy()[2..].to_string());
                    }
                    return p;
                }
            }
        }

        // Mapeamento de variáveis de ambiente
        let mut replacements = HashMap::new();
        replacements.insert("%LOCALAPPDATA%", base_dirs.data_local_dir().to_str().unwrap());
        replacements.insert("%APPDATA%", base_dirs.config_dir().to_str().unwrap());
        replacements.insert("%USERPROFILE%", user_dirs.home_dir().to_str().unwrap());
        replacements.insert("<home>", user_dirs.home_dir().to_str().unwrap());
        replacements.insert("<winAppData>", base_dirs.config_dir().to_str().unwrap());
        replacements.insert("<winLocalAppData>", base_dirs.data_local_dir().to_str().unwrap());

        if let Some(doc) = user_dirs.document_dir() {
            replacements.insert("%DOCUMENTS%", doc.to_str().unwrap());
            replacements.insert("<winDocuments>", doc.to_str().unwrap());
        }

        let mut resolved = path_str.to_string();
        for (key, val) in replacements {
            resolved = resolved.replace(key, val);
        }

        let stop_chars = ['<', '*', '?'];
        if let Some(idx) = resolved.find(|c| stop_chars.contains(&c)) {
            resolved = resolved[..idx].to_string();
        }

        let p = PathBuf::from(if cfg!(target_os = "windows") {
            resolved.replace("/", "\\")
        } else {
            resolved.replace("\\", "/")
        });
        
        PathBuf::from(p.to_string_lossy().trim_end_matches(|c| c == '/' || c == '\\'))
    }

    pub fn get_manifest_paths(app: &AppHandle, game_id: u32) -> Vec<PathBuf> {
        let mut found_paths = Vec::new();
        if let Ok(app_dir) = app.path().app_data_dir() {
            let local_path = app_dir.join("manifest.yaml");
            if local_path.exists() {
                if let Ok(content) = fs::read_to_string(local_path) {
                    if let Ok(manifest) = serde_yaml::from_str::<LudusaviManifest>(&content) {
                        for (_name, data) in manifest.games {
                            if let Some(steam) = data.steam {
                                if steam.id == game_id {
                                    if let Some(files_map) = data.files {
                                        let mut keys: Vec<String> = files_map.keys().cloned().collect();
                                        keys.sort();
                                        for path_key in keys {
                                            found_paths.push(Self::resolve_path_root(&path_key, game_id));
                                        }
                                    }
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
        found_paths
    }

    pub fn get_custom_path(app: &AppHandle, game_id: u32) -> Option<PathBuf> {
        if let Ok(app_dir) = app.path().app_data_dir() {
            let custom_path = app_dir.join("custom_manifest.json");
            if custom_path.exists() {
                if let Ok(content) = fs::read_to_string(custom_path) {
                    if let Ok(json) = serde_json::from_str::<HashMap<String, CustomGameEntry>>(&content) {
                        if let Some(entry) = json.get(&game_id.to_string()) {
                            return Some(Self::resolve_path_root(&entry.win, game_id));
                        }
                    }
                }
            }
        }
        None
    }
}