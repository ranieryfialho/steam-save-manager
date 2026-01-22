use chrono::Local;
use directories::{BaseDirs, UserDirs};
use dotenv_codegen::dotenv;
use oauth2::reqwest::http_client;
use oauth2::{
    basic::BasicClient, AuthUrl, AuthorizationCode, ClientId, ClientSecret, CsrfToken, RedirectUrl,
    Scope, TokenResponse, TokenUrl,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use steamlocate::SteamDir;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use tiny_http::{Response, Server};
use url::Url;
use zip::write::SimpleFileOptions;

const REMOTE_MANIFEST_URL: &str = "https://raw.githubusercontent.com/mtkennerly/ludusavi-manifest/master/data/manifest.yaml";
const GOOGLE_CLIENT_ID: &str = dotenv!("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET: &str = dotenv!("GOOGLE_CLIENT_SECRET");
struct AuthState {
    access_token: Mutex<Option<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
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
struct LudusaviManifest {
    #[serde(flatten)]
    games: HashMap<String, LudusaviGame>,
}

#[derive(Debug, Deserialize)]
struct LudusaviGame {
    steam: Option<LudusaviSteam>,
    files: Option<HashMap<String, serde_yaml::Value>>,
}

#[derive(Debug, Deserialize)]
struct LudusaviSteam {
    id: u32,
}

#[derive(Debug, Deserialize)]
struct CustomGameEntry {
    win: String,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AuthState {
            access_token: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            get_installed_games,
            backup_game,
            update_manifest_db,
            get_backups,
            restore_backup,
            create_zip_for_cloud,
            login_google_drive,
            check_auth_status,
            upload_to_drive,
            get_google_user,
            logout_google
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn check_auth_status(state: State<'_, AuthState>) -> bool {
    let guard = state.access_token.lock().unwrap();
    guard.is_some()
}

#[tauri::command]
fn logout_google(state: State<'_, AuthState>) -> String {
    let mut guard = state.access_token.lock().unwrap();
    *guard = None;
    "Desconectado".to_string()
}

#[tauri::command]
async fn get_google_user(state: State<'_, AuthState>) -> Result<GoogleProfile, String> {
    let token = {
        let guard = state.access_token.lock().unwrap();
        match &*guard {
            Some(t) => t.clone(),
            None => return Err("Não conectado".to_string()),
        }
    };

    let client = reqwest::Client::new();
    let res = client
        .get("https://www.googleapis.com/oauth2/v2/userinfo")
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        let profile = res
            .json::<GoogleProfile>()
            .await
            .map_err(|e| e.to_string())?;
        Ok(profile)
    } else {
        Err("Falha ao buscar perfil".to_string())
    }
}

#[tauri::command]
async fn login_google_drive(app_handle: AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let client = BasicClient::new(
            ClientId::new(GOOGLE_CLIENT_ID.to_string()),
            Some(ClientSecret::new(GOOGLE_CLIENT_SECRET.to_string())),
            AuthUrl::new("https://accounts.google.com/o/oauth2/v2/auth".to_string()).unwrap(),
            Some(TokenUrl::new("https://oauth2.googleapis.com/token".to_string()).unwrap()),
        )
        .set_redirect_uri(RedirectUrl::new("http://localhost:3000".to_string()).unwrap());

        let (auth_url, _csrf_token) = client
            .authorize_url(CsrfToken::new_random)
            .add_scope(Scope::new(
                "https://www.googleapis.com/auth/drive.file".to_string(),
            ))
            .add_scope(Scope::new(
                "https://www.googleapis.com/auth/userinfo.profile".to_string(),
            ))
            .url();

        if open::that(auth_url.as_str()).is_err() {
            return Err("Erro ao abrir navegador.".to_string());
        }

        let server = Server::http("127.0.0.1:3000").map_err(|e| e.to_string())?;
        
        if let Ok(request) = server.recv() {
            let full_url = format!("http://localhost:3000{}", request.url());
            
            let parsed_url = Url::parse(&full_url).map_err(|_| "URL inválida".to_string())?;
            
            let code_option = parsed_url.query_pairs()
                .find(|(key, _)| key == "code")
                .map(|(_, value)| value.to_string());

            let code = match code_option {
                Some(c) => c,
                None => {
                    let _ = request.respond(Response::from_string("Erro: Codigo nao encontrado."));
                    return Err("Código não encontrado.".to_string());
                }
            };

            match client
                .exchange_code(AuthorizationCode::new(code))
                .request(http_client)
            {
                Ok(token_response) => {
                    let access_token = token_response.access_token().secret().clone();
                    let state = app_handle.state::<AuthState>();
                    *state.access_token.lock().unwrap() = Some(access_token);
                    
                    let _ = request.respond(Response::from_string("<html><body style='background:#121212;color:#4caf50;text-align:center;padding:50px;font-family:sans-serif;'><h1>SUCESSO!</h1><p>Você pode fechar esta janela.</p></body></html>").with_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html"[..]).unwrap()));
                    return Ok("Conectado".to_string());
                }
                Err(e) => {
                    let _ = request.respond(Response::from_string(format!("Erro: {:?}", e)));
                    return Err(format!("Falha Auth: {:?}", e));
                }
            }
        }
        Err("Timeout".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

async fn get_or_create_folder(
    client: &reqwest::Client,
    token: &str,
    folder_name: &str,
    parent_id: Option<&str>,
) -> Result<String, String> {
    let parent_query = match parent_id {
        Some(id) => format!("'{}' in parents", id),
        None => "'root' in parents".to_string(),
    };

    let query = format!(
        "name = '{}' and mimeType = 'application/vnd.google-apps.folder' and {} and trashed = false",
        folder_name, parent_query
    );

    let res = client
        .get("https://www.googleapis.com/drive/v3/files")
        .bearer_auth(token)
        .query(&[("q", query.as_str()), ("fields", "files(id)")])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Erro ao buscar pasta: {}", res.status()));
    }

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;

    if let Some(files) = json["files"].as_array() {
        if let Some(first) = files.first() {
            return Ok(first["id"].as_str().unwrap().to_string());
        }
    }

    let mut metadata = json!({
        "name": folder_name,
        "mimeType": "application/vnd.google-apps.folder"
    });

    if let Some(pid) = parent_id {
        metadata["parents"] = json!([pid]);
    }

    let create_res = client
        .post("https://www.googleapis.com/drive/v3/files")
        .bearer_auth(token)
        .json(&metadata)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !create_res.status().is_success() {
        return Err(format!("Erro ao criar pasta: {}", create_res.status()));
    }

    let create_json: serde_json::Value = create_res.json().await.map_err(|e| e.to_string())?;
    Ok(create_json["id"].as_str().unwrap().to_string())
}

#[tauri::command]
async fn upload_to_drive(
    _app: AppHandle,
    state: State<'_, AuthState>,
    file_path: String,
    game_name: String,
) -> Result<String, String> {
    let token = {
        let guard = state.access_token.lock().unwrap();
        match &*guard {
            Some(t) => t.clone(),
            None => return Err("Não conectado.".to_string()),
        }
    };

    let client = reqwest::Client::new();
    
    let root_id = get_or_create_folder(&client, &token, "Steam Save Manager", None).await?;
    let game_folder_id =
        get_or_create_folder(&client, &token, &game_name, Some(&root_id)).await?;

    let path = Path::new(&file_path);
    if !path.exists() {
        return Err("Arquivo não encontrado.".to_string());
    }

    let filename = path.file_name().unwrap().to_string_lossy().to_string();
    let file_bytes = fs::read(path).map_err(|e| e.to_string())?;

    let metadata_json = json!({
        "name": filename,
        "mimeType": "application/zip",
        "parents": [game_folder_id]
    })
    .to_string();

    let metadata_part = reqwest::multipart::Part::text(metadata_json)
        .mime_str("application/json; charset=UTF-8")
        .map_err(|e| e.to_string())?;

    let file_part = reqwest::multipart::Part::bytes(file_bytes)
        .mime_str("application/zip")
        .map_err(|e| e.to_string())?;

    let form = reqwest::multipart::Form::new()
        .part("metadata", metadata_part)
        .part("file", file_part);

    let res = client
        .post("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart")
        .bearer_auth(token)
        .multipart(form)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        Ok(format!("Salvo em: Steam Save Manager/{}/", game_name))
    } else {
        let err_msg = res.text().await.unwrap_or_default();
        Err(format!("Erro Google API: {}", err_msg))
    }
}

#[tauri::command]
async fn update_manifest_db(app: AppHandle) -> Result<String, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    }
    let local_path = app_dir.join("manifest.yaml");
    let client = reqwest::Client::new();
    let response = client
        .get(REMOTE_MANIFEST_URL)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }
    let content = response.text().await.map_err(|e| e.to_string())?;
    if serde_yaml::from_str::<LudusaviManifest>(&content).is_ok() {
        fs::write(&local_path, &content).map_err(|e| e.to_string())?;
        Ok("Atualizado.".to_string())
    } else {
        Err("YAML inválido.".to_string())
    }
}

fn resolve_path_root(path_str: &str, game_id: u32) -> PathBuf {
    let base_dirs = BaseDirs::new().expect("BaseDirs error");
    let user_dirs = UserDirs::new().expect("UserDirs error");

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
                    let s = p.to_string_lossy()[2..].to_string();
                    p = PathBuf::from(s);
                }
                return p;
            }
        }
    }

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

    if cfg!(target_os = "windows") {
        resolved = resolved.replace("/", "\\");
    } else {
        resolved = resolved.replace("\\", "/");
    }

    PathBuf::from(resolved.trim_end_matches(|c| c == '/' || c == '\\'))
}

fn get_manifest_paths(app: &AppHandle, game_id: u32) -> Vec<PathBuf> {
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
                                    let mut keys: Vec<String> =
                                        files_map.keys().cloned().collect();
                                    keys.sort();
                                    for path_key in keys {
                                        found_paths.push(resolve_path_root(&path_key, game_id));
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

fn get_custom_path(app: &AppHandle, game_id: u32) -> Option<PathBuf> {
    if let Ok(app_dir) = app.path().app_data_dir() {
        let custom_path = app_dir.join("custom_manifest.json");
        if custom_path.exists() {
            if let Ok(content) = fs::read_to_string(custom_path) {
                if let Ok(json) =
                    serde_json::from_str::<HashMap<String, CustomGameEntry>>(&content)
                {
                    if let Some(entry) = json.get(&game_id.to_string()) {
                        return Some(resolve_path_root(&entry.win, game_id));
                    }
                }
            }
        }
    }
    None
}

fn zip_directory(
    dir: &Path,
    prefix: &str,
    zip: &mut zip::ZipWriter<File>,
    options: SimpleFileOptions,
) -> zip::result::ZipResult<()> {
    let prefix = if prefix.is_empty() {
        "".to_string()
    } else {
        format!("{}/", prefix)
    };
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let zip_path = format!("{}{}", prefix, name);
        if path.is_dir() {
            zip.add_directory(&zip_path, options)?;
            zip_directory(&path, &zip_path, zip, options)?;
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

#[tauri::command]
fn create_zip_for_cloud(game_name: String, timestamp: String) -> String {
    let user_dirs = UserDirs::new().unwrap();
    let doc_dir = user_dirs
        .document_dir()
        .unwrap_or_else(|| user_dirs.home_dir());
    let safe_name = game_name.replace(|c: char| !c.is_alphanumeric() && c != ' ', "_");
    let backup_path = doc_dir
        .join("SaveManagerBackups")
        .join(&safe_name)
        .join(&timestamp);
    let zip_file_path = doc_dir
        .join("SaveManagerBackups")
        .join(&safe_name)
        .join(format!("{}.zip", timestamp));
    if !backup_path.exists() {
        return "Erro: Pasta de backup não existe.".to_string();
    }
    if zip_file_path.exists() {
        return "Aviso: Arquivo Zip já existe.".to_string();
    }
    let file = match File::create(&zip_file_path) {
        Ok(f) => f,
        Err(e) => return format!("Erro ao criar arquivo zip: {}", e),
    };
    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o755);
    match zip_directory(&backup_path, "", &mut zip, options) {
        Ok(_) => {
            let _ = zip.finish();
            format!("Sucesso:{:?}", zip_file_path)
        }
        Err(e) => format!("Erro na compressão: {}", e),
    }
}

fn check_existing_backup(game_name: &str) -> Option<String> {
    let user_dirs = UserDirs::new()?;
    let doc_dir = user_dirs.document_dir()?;
    let safe_name = game_name.replace(|c: char| !c.is_alphanumeric() && c != ' ', "_");
    let backup_path = doc_dir.join("SaveManagerBackups").join(safe_name);
    if !backup_path.exists() {
        return None;
    }
    let mut entries: Vec<String> = fs::read_dir(backup_path)
        .ok()?
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().is_dir())
        .map(|entry| entry.file_name().to_string_lossy().to_string())
        .collect();
    entries.sort();
    entries.pop()
}

#[tauri::command]
fn get_installed_games() -> Vec<GameInfo> {
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
                    last_backup: check_existing_backup(&name),
                });
            }
        }
    }
    games_list
}

#[tauri::command]
fn get_backups(game_name: String) -> Vec<BackupEntry> {
    let user_dirs = UserDirs::new().unwrap();
    let doc_dir = user_dirs
        .document_dir()
        .unwrap_or_else(|| user_dirs.home_dir());
    let safe_name = game_name.replace(|c: char| !c.is_alphanumeric() && c != ' ', "_");
    let backup_root = doc_dir.join("SaveManagerBackups").join(safe_name);
    if !backup_root.exists() {
        return Vec::new();
    }
    let mut backups = Vec::new();
    if let Ok(entries) = fs::read_dir(&backup_root) {
        for entry in entries.flatten() {
            if let Ok(ft) = entry.file_type() {
                if ft.is_dir() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    let zip_path = backup_root.join(format!("{}.zip", name));
                    let size = fs_extra::dir::get_size(entry.path()).unwrap_or(0);
                    backups.push(BackupEntry {
                        name: name,
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

#[tauri::command]
fn backup_game(app: AppHandle, game_id: u32, game_name: String) -> String {
    let user_dirs = UserDirs::new().unwrap();
    let doc_dir = user_dirs
        .document_dir()
        .unwrap_or_else(|| user_dirs.home_dir());
    let timestamp = Local::now().format("%Y-%m-%d_%H-%M-%S").to_string();
    let safe_name = game_name.replace(|c: char| !c.is_alphanumeric() && c != ' ', "_");
    let backup_root = doc_dir
        .join("SaveManagerBackups")
        .join(&safe_name)
        .join(&timestamp);
    if let Err(e) = fs::create_dir_all(&backup_root) {
        return format!("Erro IO: {}", e);
    }
    let mut count = 0;
    let options = fs_extra::dir::CopyOptions::new()
        .overwrite(true)
        .copy_inside(true);
    if let Some(path) = get_custom_path(&app, game_id) {
        if path.exists() {
            let _ = fs::create_dir_all(backup_root.join("Custom_Saves"));
            if fs_extra::dir::copy(&path, backup_root.join("Custom_Saves"), &options).is_ok() {
                count += 1;
            }
        }
    }
    let manifest_paths = get_manifest_paths(&app, game_id);
    for (idx, path) in manifest_paths.iter().enumerate() {
        if path.exists() {
            let _ = fs::create_dir_all(backup_root.join(format!("Game_Data_{}", idx)));
            if fs_extra::dir::copy(path, backup_root.join(format!("Game_Data_{}", idx)), &options)
                .is_ok()
            {
                count += 1;
            }
        }
    }
    if let Ok(steamdir) = SteamDir::locate() {
        if let Ok(entries) = fs::read_dir(steamdir.path().join("userdata")) {
            for entry in entries.flatten() {
                let possible = entry.path().join(game_id.to_string());
                if possible.exists() {
                    let _ = fs::create_dir_all(backup_root.join("Steam_Cloud"));
                    if fs_extra::dir::copy(
                        &possible,
                        backup_root.join("Steam_Cloud"),
                        &options,
                    )
                    .is_ok()
                    {
                        count += 1;
                    }
                }
            }
        }
    }
    if count > 0 {
        format!("Sucesso:{}", timestamp)
    } else {
        let _ = fs::remove_dir_all(&backup_root);
        format!("Aviso: Nenhum arquivo encontrado.")
    }
}

#[tauri::command]
fn restore_backup(
    app: AppHandle,
    game_id: u32,
    game_name: String,
    timestamp: String,
) -> String {
    let user_dirs = UserDirs::new().unwrap();
    let doc_dir = user_dirs
        .document_dir()
        .unwrap_or_else(|| user_dirs.home_dir());
    let safe_name = game_name.replace(|c: char| !c.is_alphanumeric() && c != ' ', "_");
    let backup_root = doc_dir
        .join("SaveManagerBackups")
        .join(&safe_name)
        .join(&timestamp);
    if !backup_root.exists() {
        return "Erro: Backup não encontrado.".to_string();
    }
    let mut restored_count = 0;
    let mut options = fs_extra::dir::CopyOptions::new()
        .overwrite(true)
        .copy_inside(true);
    options.content_only = true;
    if let Some(target_path) = get_custom_path(&app, game_id) {
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
    let manifest_paths = get_manifest_paths(&app, game_id);
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
    if let Ok(steamdir) = SteamDir::locate() {
        if let Ok(entries) = fs::read_dir(steamdir.path().join("userdata")) {
            for entry in entries.flatten() {
                let target_path = entry.path().join(game_id.to_string());
                let source_root = backup_root.join("Steam_Cloud");
                if target_path.exists() && source_root.exists() {
                    if let Ok(inner_entries) = fs::read_dir(&source_root) {
                        for inner in inner_entries.flatten() {
                            let _ = fs_extra::dir::copy(inner.path(), &target_path, &options);
                        }
                        restored_count += 1;
                    }
                }
            }
        }
    }
    if restored_count > 0 {
        "Sucesso:Arquivos Restaurados".to_string()
    } else {
        "Erro: Nada restaurado.".to_string()
    }
}