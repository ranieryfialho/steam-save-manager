// src-tauri/src/services/backup_service.rs
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::Path;
use chrono::Local;
use directories::UserDirs;
use steamlocate::SteamDir;
use tauri::{AppHandle, Window, Emitter}; // ESSENCIAL: Permite usar window.emit()
use zip::write::SimpleFileOptions;
use crate::models::BackupEntry;
use crate::services::steam_service::SteamService;

pub struct BackupService;

impl BackupService {
    pub fn perform_backup(window: Window, app: AppHandle, game_id: u32, game_name: String) -> String {
        let user_dirs = UserDirs::new().unwrap();
        let doc_dir = user_dirs.document_dir().unwrap_or_else(|| user_dirs.home_dir());
        let timestamp = Local::now().format("%Y-%m-%d_%H-%M-%S").to_string();
        let safe_name = game_name.replace(|c: char| !c.is_alphanumeric() && c != ' ', "_");
        let backup_root = doc_dir.join("SaveManagerBackups").join(&safe_name).join(&timestamp);

        // Notifica o frontend sobre o início do processo
        let _ = window.emit("backup-status", format!("Iniciando backup de {}...", game_name));

        if let Err(e) = fs::create_dir_all(&backup_root) {
            return format!("Erro IO: {}", e);
        }

        let mut count = 0;
        let options = fs_extra::dir::CopyOptions::new().overwrite(true).copy_inside(true);

        // 1. Saves Customizados
        if let Some(path) = SteamService::get_custom_path(&app, game_id) {
            if path.exists() {
                let _ = window.emit("backup-status", "Copiando saves manuais...");
                let _ = fs::create_dir_all(backup_root.join("Custom_Saves"));
                if fs_extra::dir::copy(&path, backup_root.join("Custom_Saves"), &options).is_ok() {
                    count += 1;
                }
            }
        }

        // 2. Saves via Manifesto (Ludusavi)
        let manifest_paths = SteamService::get_manifest_paths(&app, game_id);
        if !manifest_paths.is_empty() {
            let _ = window.emit("backup-status", "Sincronizando via Manifesto...");
            for (idx, path) in manifest_paths.iter().enumerate() {
                if path.exists() {
                    let _ = fs::create_dir_all(backup_root.join(format!("Game_Data_{}", idx)));
                    if fs_extra::dir::copy(path, backup_root.join(format!("Game_Data_{}", idx)), &options).is_ok() {
                        count += 1;
                    }
                }
            }
        }

        // 3. Saves Steam Cloud Local
        if let Ok(steamdir) = SteamDir::locate() {
            let _ = window.emit("backup-status", "Verificando Steam Cloud local...");
            if let Ok(entries) = fs::read_dir(steamdir.path().join("userdata")) {
                for entry in entries.flatten() {
                    let possible = entry.path().join(game_id.to_string());
                    if possible.exists() {
                        let _ = fs::create_dir_all(backup_root.join("Steam_Cloud"));
                        if fs_extra::dir::copy(&possible, backup_root.join("Steam_Cloud"), &options).is_ok() {
                            count += 1;
                        }
                    }
                }
            }
        }

        if count > 0 {
            let _ = window.emit("backup-status", "Backup concluído!");
            format!("Sucesso:{}", timestamp)
        } else {
            let _ = fs::remove_dir_all(&backup_root);
            "Erro: Nenhum arquivo localizado.".to_string()
        }
    }

    pub fn cleanup_old_backups(game_name: String, limit: usize) -> Result<usize, String> {
        let user_dirs = UserDirs::new().unwrap();
        let doc_dir = user_dirs.document_dir().unwrap_or_else(|| user_dirs.home_dir());
        let safe_name = game_name.replace(|c: char| !c.is_alphanumeric() && c != ' ', "_");
        let backup_root = doc_dir.join("SaveManagerBackups").join(&safe_name);

        if !backup_root.exists() { return Ok(0); }

        let mut entries: Vec<_> = fs::read_dir(&backup_root)
            .map_err(|e| e.to_string())?
            .filter_map(|res| res.ok())
            .filter(|e| e.path().is_dir())
            .collect();

        entries.sort_by_key(|e| e.file_name());

        let mut deleted = 0;
        if entries.len() > limit {
            let to_delete = entries.len() - limit;
            for i in 0..to_delete {
                if fs::remove_dir_all(entries[i].path()).is_ok() {
                    deleted += 1;
                }
            }
        }
        Ok(deleted)
    }

    pub fn list_backups(game_name: String) -> Vec<BackupEntry> {
        let user_dirs = UserDirs::new().unwrap();
        let doc_dir = user_dirs.document_dir().unwrap_or_else(|| user_dirs.home_dir());
        let safe_name = game_name.replace(|c: char| !c.is_alphanumeric() && c != ' ', "_");
        let backup_root = doc_dir.join("SaveManagerBackups").join(safe_name);
        
        let mut backups = Vec::new();
        if !backup_root.exists() { return backups; }
        
        if let Ok(entries) = fs::read_dir(&backup_root) {
            for entry in entries.flatten() {
                if let Ok(ft) = entry.file_type() {
                    if ft.is_dir() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        let zip_path = backup_root.join(format!("{}.zip", name));
                        let size = fs_extra::dir::get_size(entry.path()).unwrap_or(0);
                        backups.push(BackupEntry {
                            name,
                            path: entry.path().to_string_lossy().to_string(),
                            has_zip: zip_path.exists(),
                            size_mb: format!("{:.1} MB", size as f64 / 1024.0 / 1024.0),
                        });
                    }
                }
            }
        }
        backups.sort_by(|a, b| b.name.cmp(&a.name));
        backups
    }

    pub fn restore_backup(app: AppHandle, game_id: u32, game_name: String, timestamp: String) -> String {
        let user_dirs = UserDirs::new().unwrap();
        let doc_dir = user_dirs.document_dir().unwrap_or_else(|| user_dirs.home_dir());
        let safe_name = game_name.replace(|c: char| !c.is_alphanumeric() && c != ' ', "_");
        let backup_root = doc_dir.join("SaveManagerBackups").join(&safe_name).join(&timestamp);

        if !backup_root.exists() { return "Erro: Backup não encontrado.".to_string(); }

        let mut restored = 0;
        let mut options = fs_extra::dir::CopyOptions::new().overwrite(true).copy_inside(true);
        options.content_only = true;

        if let Some(target) = SteamService::get_custom_path(&app, game_id) {
            let source = backup_root.join("Custom_Saves");
            if source.exists() && target.exists() {
                let _ = fs_extra::dir::copy(&source, &target, &options);
                restored += 1;
            }
        }

        let manifest_paths = SteamService::get_manifest_paths(&app, game_id);
        for (idx, target) in manifest_paths.iter().enumerate() {
            let source = backup_root.join(format!("Game_Data_{}", idx));
            if source.exists() && target.exists() {
                let _ = fs_extra::dir::copy(&source, &target, &options);
                restored += 1;
            }
        }

        if restored > 0 { "Sucesso: Restaurado".to_string() } else { "Erro".to_string() }
    }

    pub fn zip_for_cloud(game_name: String, timestamp: String) -> String {
        let user_dirs = UserDirs::new().unwrap();
        let doc_dir = user_dirs.document_dir().unwrap_or_else(|| user_dirs.home_dir());
        let safe_name = game_name.replace(|c: char| !c.is_alphanumeric() && c != ' ', "_");
        let bkp_path = doc_dir.join("SaveManagerBackups").join(&safe_name).join(&timestamp);
        let zip_path = doc_dir.join("SaveManagerBackups").join(&safe_name).join(format!("{}.zip", timestamp));

        if !bkp_path.exists() { return "Erro: Pasta inexistente.".to_string(); }

        let file = File::create(&zip_path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

        fn zip_dir(dir: &Path, prefix: &str, zip: &mut zip::ZipWriter<File>, opt: SimpleFileOptions) -> Result<(), String> {
            for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                let path = entry.path();
                let name = entry.file_name().to_string_lossy().to_string();
                let zip_name = if prefix.is_empty() { name } else { format!("{}/{}", prefix, name) };
                if path.is_dir() {
                    zip.add_directory(&zip_name, opt).map_err(|e| e.to_string())?;
                    zip_dir(&path, &zip_name, zip, opt)?;
                } else {
                    zip.start_file(&zip_name, opt).map_err(|e| e.to_string())?;
                    let mut f = File::open(path).map_err(|e| e.to_string())?;
                    let mut buf = Vec::new();
                    f.read_to_end(&mut buf).map_err(|e| e.to_string())?;
                    zip.write_all(&buf).map_err(|e| e.to_string())?;
                }
            }
            Ok(())
        }

        if let Err(e) = zip_dir(&bkp_path, "", &mut zip, options) { return e; }
        zip.finish().unwrap();
        format!("Sucesso:{:?}", zip_path)
    }
}