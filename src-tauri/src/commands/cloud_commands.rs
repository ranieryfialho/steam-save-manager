use tauri::{AppHandle, command, State};
use crate::models::{AuthState, GoogleProfile};
use crate::services::cloud_service::CloudService;

#[command]
pub fn check_auth_status(state: State<'_, AuthState>) -> bool {
    state.access_token.lock().unwrap().is_some()
}

#[command]
pub fn logout_google(state: State<'_, AuthState>) -> String {
    *state.access_token.lock().unwrap() = None;
    "Desconectado".to_string()
}

#[command]
pub async fn login_google_drive(app_handle: AppHandle) -> Result<String, String> {
    CloudService::login_google(app_handle).await
}

#[command]
pub async fn get_google_user(state: State<'_, AuthState>) -> Result<GoogleProfile, String> {
    let token = state.access_token.lock().unwrap().as_ref()
        .ok_or("Não conectado")?.clone();
    CloudService::get_user_profile(token).await
}

#[command]
pub async fn upload_to_drive(state: State<'_, AuthState>, file_path: String, game_name: String) -> Result<String, String> {
    let token = state.access_token.lock().unwrap().as_ref()
        .ok_or("Não conectado")?.clone();
    CloudService::upload_file(token, file_path, game_name).await
}