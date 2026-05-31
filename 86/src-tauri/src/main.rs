#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod database;
mod parser;
mod syntax;
mod sync;
mod file_manager;
mod models;
mod crypto;
mod diff;

use database::Database;
use models::*;
use std::sync::Mutex;
use tauri::State;

struct AppState {
    db: Mutex<Option<Database>>,
    sync_config: Mutex<Option<SyncConfig>>,
}

#[tauri::command]
async fn parse_script(content: String, language: String) -> ParseResult {
    parser::parse(&content, &language).await
}

#[tauri::command]
async fn check_syntax(content: String, language: String) -> SyntaxCheckResult {
    syntax::check(&content, &language).await
}

#[tauri::command]
async fn load_project(path: String, state: State<'_, AppState>) -> Result<LocalProject, String> {
    file_manager::load_project(&path, &state)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_file(file: ScriptFile, state: State<'_, AppState>) -> Result<bool, String> {
    file_manager::save_file(&file, &state)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_file(path: String) -> Result<bool, String> {
    std::fs::remove_file(&path)
        .map(|_| true)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn create_project(
    name: String,
    path: String,
    description: Option<String>,
    state: State<'_, AppState>,
) -> Result<LocalProject, String> {
    file_manager::create_project(&name, &path, description.as_deref(), &state)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_projects(state: State<'_, AppState>) -> Result<Vec<LocalProject>, String> {
    file_manager::list_projects(&state)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_project(project_id: String, state: State<'_, AppState>) -> Result<bool, String> {
    file_manager::delete_project(&project_id, &state)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_version(
    script_id: String,
    content: String,
    message: Option<String>,
    state: State<'_, AppState>,
) -> Result<ScriptVersion, String> {
    database::save_version(&script_id, &content, message.as_deref(), &state)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_versions(
    script_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<ScriptVersion>, String> {
    database::get_versions(&script_id, &state)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn restore_version(
    script_id: String,
    version_id: String,
    state: State<'_, AppState>,
) -> Result<ScriptFile, String> {
    database::restore_version(&script_id, &version_id, &state)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn init_database(
    config: DatabaseConfig,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let db = Database::new(&config.db_path, config.encryption_key.as_deref())
        .map_err(|e| e.to_string())?;
    db.init().map_err(|e| e.to_string())?;
    *state.db.lock().unwrap() = Some(db);
    Ok(true)
}

#[tauri::command]
async fn save_sync_config(
    config: SyncConfig,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    database::save_sync_config(&config, &state)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn load_sync_config(
    state: State<'_, AppState>,
) -> Result<Option<SyncConfig>, String> {
    database::load_sync_config(&state)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn start_auto_sync(state: State<'_, AppState>) -> Result<(), String> {
    sync::start_auto_sync(&state).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn stop_auto_sync(state: State<'_, AppState>) -> Result<(), String> {
    sync::stop_auto_sync(&state).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_sync_status(state: State<'_, AppState>) -> Result<SyncStatus, String> {
    sync::get_status(&state).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn scan_directory(
    path: String,
    extensions: Option<Vec<String>>,
) -> Result<Vec<FileEntry>, String> {
    file_manager::scan_directory(&path, extensions.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn format_script(content: String, language: String) -> Result<String, String> {
    parser::format(&content, &language).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn sync_now(state: State<'_, AppState>) -> Result<(), String> {
    sync::sync_now(&state).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn test_connection(server_url: String, api_key: String) -> Result<bool, String> {
    sync::test_connection(&server_url, &api_key).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn verify_script(
    script_id: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let db = state.db.lock().unwrap();
    let db = db.as_ref().ok_or("Database not initialized")?;
    db.verify_script_checksum(&script_id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn repair_script(
    script_id: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let db = state.db.lock().unwrap();
    let db = db.as_ref().ok_or("Database not initialized")?;
    db.repair_script_checksum(&script_id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn encrypt_script(
    content: String,
    password: String,
) -> Result<String, String> {
    let crypto = crypto::CryptoService::new(&password).map_err(|e| e.to_string())?;
    crypto.encrypt(&content).map_err(|e| e.to_string())
}

#[tauri::command]
async fn decrypt_script(
    content: String,
    password: String,
) -> Result<String, String> {
    let crypto = crypto::CryptoService::new(&password).map_err(|e| e.to_string())?;
    crypto.decrypt(&content).map_err(|e| e.to_string())
}

#[tauri::command]
async fn encrypt_batch(
    contents: Vec<String>,
    password: String,
) -> Result<Vec<String>, String> {
    crypto::encrypt_batch(&contents, &password)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn decrypt_batch(
    contents: Vec<String>,
    password: String,
) -> Result<Vec<String>, String> {
    crypto::decrypt_batch(&contents, &password)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn compute_diff(
    old_content: String,
    new_content: String,
) -> Result<diff::DiffResult, String> {
    Ok(diff::compute_diff(&old_content, &new_content))
}

#[tauri::command]
async fn generate_patch(
    old_content: String,
    new_content: String,
) -> Result<String, String> {
    Ok(diff::generate_patch(&old_content, &new_content))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            db: Mutex::new(None),
            sync_config: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            parse_script,
            check_syntax,
            load_project,
            save_file,
            read_file,
            delete_file,
            create_project,
            list_projects,
            delete_project,
            save_version,
            get_versions,
            restore_version,
            init_database,
            save_sync_config,
            load_sync_config,
            start_auto_sync,
            stop_auto_sync,
            get_sync_status,
            scan_directory,
            format_script,
            sync_now,
            test_connection,
            verify_script,
            repair_script,
            encrypt_script,
            decrypt_script,
            encrypt_batch,
            decrypt_batch,
            compute_diff,
            generate_patch,
            clear_sync_cache,
            pull_remote_scripts
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
