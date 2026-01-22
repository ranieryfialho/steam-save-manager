use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path};
use chrono::Local;
use directories::UserDirs;
use steamlocate::SteamDir;
use tauri::{AppHandle, Window, Emitter};
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

        let _ = window.emit("backup-status", format!("Iniciando backup de {}...", game_name));

        if let Err(e) = fs::create_dir_all(&backup_root) {
            return format!("Erro IO: {}", e);
        }

        let mut count = 0;
        let options = fs_extra::dir::CopyOptions::new().overwrite(true).copy_inside(true);

        if let Some(path) = SteamService::get_custom_path(&app, game_id) {
            if path.exists() {
                let _ = window.emit("backup-status", "Copiando arquivos customizados...");
                let _ = fs::create_dir_all(backup_root.join("Custom_Saves"));
                if fs_extra::dir::copy(&path, backup_root.join("Custom_Saves"), &options).is_ok() {
                    count += 1;
                }
            }
        }

        let manifest_paths = SteamService::get_manifest_paths(&app, game_id);
        if !manifest_paths.is_empty() {
            let _ = window.emit("backup-status", "Sincronizando dados do manifesto...");
            for (idx, path) in manifest_paths.iter().enumerate() {
                if path.exists() {
                    let _ = fs::create_dir_all(backup_root.join(format!("Game_Data_{}", idx)));
                    if fs_extra::dir::copy(path, backup_root.join(format!("Game_Data_{}", idx)), &options).is_ok() {
                        count += 1;
                    }
                }
            }
        }

        if let Ok(steamdir) = SteamDir::locate() {
            let _ = window.emit("backup-status", "Buscando saves na nuvem local...");
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
            let _ = window.emit("backup-status", "Backup finalizado com sucesso!");
            format!("Sucesso:{}", timestamp)
        } else {
            let _ = fs::remove_dir_all(&backup_root);
            "Aviso: Nenhum arquivo encontrado.".to_string()
        }
    }

    pub fn list_backups(game_name: String) -> Vec<BackupEntry> {
        let user_dirs = UserDirs::new().unwrap();
        let doc_dir = user_dirs.document_dir().unwrap_or_else(|| user_dirs.home_dir());
        let safe_name = game_name.replace(|c: char| !c.is_alphanumeric() && c != ' ', "_");
        let backup_root = doc_dir.join("SaveManagerBackups").join(safe_name);
        
        if !backup_root.exists() { return Vec::new(); }
        
        let mut backups = Vec::new();
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

        if !backup_root.exists() { return "Erro: Backup inexistente.".to_string(); }

        let mut restored_count = 0;
        let mut options = fs_extra::dir::CopyOptions::new().overwrite(true).copy_inside(true);
        options.content_only = true;

        if let Some(target_path) = SteamService::get_custom_path(&app, game_id) {
            let source = backup_root.join("Custom_Saves");
            if source.exists() && target_path.exists() {
                if let Ok(entries) = fs::read_dir(&source) {
                    for entry in entries.flatten() {
                        let _ = fs_extra::dir::copy(entry.path(), &target_path, &options);
                    }
                    restored_count += 1;
                }
            }
        }

        let manifest_paths = SteamService::get_manifest_paths(&app, game_id);
        for (idx, target_path) in manifest_paths.iter().enumerate() {
            let source_root = backup_root.join(format!("Game_Data_{}", idx));
            if source_root.exists() && target_path.exists() {
                if let Ok(entries) = fs::read_dir(&source_root) {
                    for entry in entries.flatten() {
                        let _ = fs_extra::dir::copy(entry.path(), &target_path, &options);
                    }
                    restored_count += 1;
                }
            }
        }

        if restored_count > 0 { "Sucesso:Arquivos Restaurados".to_string() } else { "Erro".to_string() }
    }

    pub fn zip_for_cloud(game_name: String, timestamp: String) -> String {
        let user_dirs = UserDirs::new().unwrap();
        let doc_dir = user_dirs.document_dir().unwrap_or_else(|| user_dirs.home_dir());
        let safe_name = game_name.replace(|c: char| !c.is_alphanumeric() && c != ' ', "_");
        let backup_path = doc_dir.join("SaveManagerBackups").join(&safe_name).join(&timestamp);
        let zip_file_path = doc_dir.join("SaveManagerBackups").join(&safe_name).join(format!("{}.zip", timestamp));

        if !backup_path.exists() { return "Erro".to_string(); }

        let file = File::create(&zip_file_path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

        Self::zip_directory(&backup_path, "", &mut zip, options).unwrap();
        zip.finish().unwrap();
        format!("Sucesso:{:?}", zip_file_path)
    }

    fn zip_directory(dir: &Path, prefix: &str, zip: &mut zip::ZipWriter<File>, options: SimpleFileOptions) -> zip::result::ZipResult<()> {
        let prefix = if prefix.is_empty() { "".to_string() } else { format!("{}/", prefix) };
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let zip_path = format!("{}{}", prefix, name);
            if path.is_dir() {
                zip.add_directory(&zip_path, options)?;
                Self::zip_directory(&path, &zip_path, zip, options)?;
            } else {
                zip.start_file(&zip_path, options)?;
                let mut f = File::open(path)?;
                let mut buffer = Vec::new();
                f.read_to_end(&mut buffer)?;
                zip.write_all(&buffer)?;
            }
        }
        Ok(())
    }
}