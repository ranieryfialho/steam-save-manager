use std::path::Path;
use std::fs;
use tauri::{AppHandle, Manager}; // Removido o import 'State' não utilizado
use oauth2::basic::BasicClient;
use oauth2::reqwest::http_client;
use oauth2::{
    AuthUrl, AuthorizationCode, ClientId, ClientSecret, CsrfToken, RedirectUrl,
    Scope, TokenResponse, TokenUrl,
};
use tiny_http::{Response, Server};
use url::Url;
use serde_json::json;
use dotenv_codegen::dotenv;
use crate::models::{AuthState, GoogleProfile};

const GOOGLE_CLIENT_ID: &str = dotenv!("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET: &str = dotenv!("GOOGLE_CLIENT_SECRET");

pub struct CloudService;

impl CloudService {
    pub async fn login_google(app_handle: AppHandle) -> Result<String, String> {
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
                .add_scope(Scope::new("https://www.googleapis.com/auth/drive.file".to_string()))
                .add_scope(Scope::new("https://www.googleapis.com/auth/userinfo.profile".to_string()))
                .url();

            if open::that(auth_url.as_str()).is_err() {
                return Err("Erro ao abrir navegador.".to_string());
            }

            let server = Server::http("127.0.0.1:3000").map_err(|e| e.to_string())?;
            
            if let Ok(request) = server.recv() {
                let full_url = format!("http://localhost:3000{}", request.url());
                let parsed_url = Url::parse(&full_url).map_err(|_| "URL inválida".to_string())?;
                
                // Corrigido: Usando match para evitar o 'move' indevido do request
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

                match client.exchange_code(AuthorizationCode::new(code)).request(http_client) {
                    Ok(token_response) => {
                        let access_token = token_response.access_token().secret().clone();
                        let state = app_handle.state::<AuthState>();
                        *state.access_token.lock().unwrap() = Some(access_token);
                        
                        let html = "<html><body style='background:#121212;color:#4caf50;text-align:center;padding:50px;font-family:sans-serif;'><h1>SUCESSO!</h1><p>Você pode fechar esta janela.</p></body></html>";
                        let response = Response::from_string(html)
                            .with_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html"[..]).unwrap());
                        let _ = request.respond(response);
                        return Ok("Conectado".to_string());
                    }
                    Err(e) => return Err(format!("Falha Auth: {:?}", e)),
                }
            }
            Err("Timeout".to_string())
        }).await.map_err(|e| e.to_string())?
    }

    // ... (restante das funções get_user_profile, upload_file e get_or_create_folder permanecem iguais)
    pub async fn get_user_profile(token: String) -> Result<GoogleProfile, String> {
        let client = reqwest::Client::new();
        let res = client.get("https://www.googleapis.com/oauth2/v2/userinfo")
            .bearer_auth(token)
            .send().await.map_err(|e| e.to_string())?;

        if res.status().is_success() {
            res.json::<GoogleProfile>().await.map_err(|e| e.to_string())
        } else {
            Err("Falha ao buscar perfil".to_string())
        }
    }

    pub async fn upload_file(token: String, file_path: String, game_name: String) -> Result<String, String> {
        let client = reqwest::Client::new();
        let root_id = Self::get_or_create_folder(&client, &token, "Steam Save Manager", None).await?;
        let game_folder_id = Self::get_or_create_folder(&client, &token, &game_name, Some(&root_id)).await?;

        let path = Path::new(&file_path);
        if !path.exists() { return Err("Arquivo não encontrado.".to_string()); }

        let filename = path.file_name().unwrap().to_string_lossy().to_string();
        let file_bytes = fs::read(path).map_err(|e| e.to_string())?;

        let metadata = json!({
            "name": filename,
            "mimeType": "application/zip",
            "parents": [game_folder_id]
        }).to_string();

        let form = reqwest::multipart::Form::new()
            .part("metadata", reqwest::multipart::Part::text(metadata).mime_str("application/json; charset=UTF-8").unwrap())
            .part("file", reqwest::multipart::Part::bytes(file_bytes).mime_str("application/zip").unwrap());

        let res = client.post("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart")
            .bearer_auth(token).multipart(form).send().await.map_err(|e| e.to_string())?;

        if res.status().is_success() {
            Ok(format!("Salvo em: Steam Save Manager/{}/", game_name))
        } else {
            Err(format!("Erro Google API: {}", res.status()))
        }
    }

    async fn get_or_create_folder(client: &reqwest::Client, token: &str, folder_name: &str, parent_id: Option<&str>) -> Result<String, String> {
        let parent_query = match parent_id {
            Some(id) => format!("'{}' in parents", id),
            None => "'root' in parents".to_string(),
        };

        let query = format!("name = '{}' and mimeType = 'application/vnd.google-apps.folder' and {} and trashed = false", folder_name, parent_query);

        let res = client.get("https://www.googleapis.com/drive/v3/files")
            .bearer_auth(token).query(&[("q", query.as_str()), ("fields", "files(id)")]).send().await.map_err(|e| e.to_string())?;

        let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
        if let Some(files) = json["files"].as_array() {
            if let Some(first) = files.first() {
                return Ok(first["id"].as_str().unwrap().to_string());
            }
        }

        let mut metadata = json!({ "name": folder_name, "mimeType": "application/vnd.google-apps.folder" });
        if let Some(pid) = parent_id { metadata["parents"] = json!([pid]); }

        let create_res = client.post("https://www.googleapis.com/drive/v3/files")
            .bearer_auth(token).json(&metadata).send().await.map_err(|e| e.to_string())?;

        let create_json: serde_json::Value = create_res.json().await.map_err(|e| e.to_string())?;
        Ok(create_json["id"].as_str().unwrap().to_string())
    }
}