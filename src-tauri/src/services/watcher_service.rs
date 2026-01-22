// src-tauri/src/services/watcher_service.rs
use notify::{Watcher, RecursiveMode, Config, Event};
use std::path::PathBuf;
use std::sync::mpsc::channel;
use std::time::Duration;
use tauri::{AppHandle, Window};
use crate::services::backup_service::BackupService;

pub struct WatcherService;

impl WatcherService {
    pub fn start_watching(window: Window, app: AppHandle, game_id: u32, game_name: String, paths: Vec<PathBuf>) {
        tauri::async_runtime::spawn(async move {
            let (tx, rx) = channel();

            let mut watcher = match notify::RecommendedWatcher::new(tx, Config::default()) {
                Ok(w) => w,
                Err(e) => {
                    eprintln!("Erro ao iniciar watcher: {:?}", e);
                    return;
                }
            };

            for path in paths {
                if path.exists() {
                    let _ = watcher.watch(&path, RecursiveMode::Recursive);
                }
            }

            println!("Watcher iniciado para: {}", game_name);

            while let Ok(res) = rx.recv() {
                match res {
                    Ok(Event { kind, .. }) => {
                        if kind.is_modify() {
                            // Delay para estabilização da escrita do jogo
                            tokio::time::sleep(Duration::from_secs(5)).await;
                            
                            let _ = BackupService::perform_backup(
                                window.clone(), 
                                app.clone(), 
                                game_id, 
                                game_name.clone()
                            );
                            
                            // Na automação, mantemos o limite padrão de 10
                            let _ = BackupService::cleanup_old_backups(game_name.clone(), 10);
                        }
                    }
                    Err(e) => println!("Erro no watcher: {:?}", e),
                }
            }
        });
    }
}