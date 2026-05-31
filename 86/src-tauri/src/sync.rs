use crate::models::*;
use crate::AppState;
use anyhow::{Context, Result};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{Duration, SystemTime};
use tauri::State;
use tokio::sync::Mutex;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use once_cell::sync::Lazy;

static IS_SYNCING: AtomicBool = AtomicBool::new(false);
static STOP_SYNC: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Serialize, Deserialize)]
struct CacheEntry<T> {
    data: T,
    timestamp: u64,
    etag: Option<String>,
}

static CACHE: Lazy<StdMutex<HashMap<String, CacheEntry<serde_json::Value>>>> = 
    Lazy::new(|| StdMutex::new(HashMap::new()));

const CACHE_TTL_SECONDS: u64 = 300;
const MAX_BATCH_SIZE: usize = 20;
const CONCURRENT_REQUESTS: usize = 5;

struct SyncState {
    status: Mutex<SyncStatus>,
}

fn get_cache_key(prefix: &str, id: &str) -> String {
    format!("{}:{}", prefix, id)
}

fn get_from_cache(key: &str) -> Option<serde_json::Value> {
    let cache = CACHE.lock().unwrap();
    if let Some(entry) = cache.get(key) {
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        if now - entry.timestamp < CACHE_TTL_SECONDS {
            return Some(entry.data.clone());
        }
    }
    None
}

fn set_to_cache(key: &str, data: serde_json::Value, etag: Option<String>) {
    let mut cache = CACHE.lock().unwrap();
    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    cache.insert(key.to_string(), CacheEntry { data, timestamp: now, etag });
}

pub fn invalidate_cache(prefix: &str) {
    let mut cache = CACHE.lock().unwrap();
    let keys_to_remove: Vec<String> = cache
        .keys()
        .filter(|k| k.starts_with(&format!("{}:", prefix)))
        .cloned()
        .collect();
    for key in keys_to_remove {
        cache.remove(&key);
    }
}

pub fn clear_cache() {
    let mut cache = CACHE.lock().unwrap();
    cache.clear();
}

pub async fn start_auto_sync(state: &State<'_, AppState>) -> Result<()> {
    let db = state.db.lock().unwrap();
    let db = db.as_ref().context("Database not initialized")?;
    
    let config = db.load_sync_config()?.unwrap_or_default();
    
    if !config.auto_sync {
        return Err(anyhow::anyhow!("Auto sync is not enabled"));
    }
    
    if config.server_url.is_empty() || config.api_key.is_empty() {
        return Err(anyhow::anyhow!("Sync configuration incomplete"));
    }
    
    if IS_SYNCING.load(Ordering::SeqCst) {
        return Ok(());
    }
    
    IS_SYNCING.store(true, Ordering::SeqCst);
    STOP_SYNC.store(false, Ordering::SeqCst);
    
    let interval = config.sync_interval.max(60) as u64;
    
    tokio::spawn(async move {
        loop {
            if STOP_SYNC.load(Ordering::SeqCst) {
                break;
            }
            
            tokio::select! {
                _ = tokio::time::sleep(tokio::time::Duration::from_secs(interval)) => {
                }
                _ = async {
                    while !STOP_SYNC.load(Ordering::SeqCst) {
                        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                    }
                } => {
                    break;
                }
            }
            
            if STOP_SYNC.load(Ordering::SeqCst) {
                break;
            }
        }
        IS_SYNCING.store(false, Ordering::SeqCst);
    });
    
    Ok(())
}

pub async fn stop_auto_sync(_state: &State<'_, AppState>) -> Result<()> {
    STOP_SYNC.store(true, Ordering::SeqCst);
    IS_SYNCING.store(false, Ordering::SeqCst);
    Ok(())
}

pub async fn get_status(_state: &State<'_, AppState>) -> Result<SyncStatus> {
    Ok(SyncStatus {
        is_syncing: IS_SYNCING.load(Ordering::SeqCst),
        last_sync_time: None,
        pending_files: 0,
        total_files: 0,
        error: None,
    })
}

async fn sync_single_script(
    client: &reqwest::Client,
    config: &SyncConfig,
    script: &mut ScriptFile,
    db: &crate::database::Database,
    retry_count: usize,
) -> Result<bool> {
    for attempt in 0..=retry_count {
        if STOP_SYNC.load(Ordering::SeqCst) {
            return Ok(false);
        }
        
        let content = match std::fs::read_to_string(&script.path) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("Failed to read file {}: {}", script.path, e);
                return Ok(false);
            }
        };
        script.content = content;
        
        let cache_key = get_cache_key("script", &script.id);
        
        let mut request = client
            .post(&format!("{}/api/scripts/sync", config.server_url))
            .header("Authorization", format!("Bearer {}", config.api_key));
        
        if let Some(cached) = get_from_cache(&cache_key) {
            if let Some(etag) = cached.get("etag").and_then(|v| v.as_str()) {
                request = request.header("If-None-Match", etag);
            }
        }
        
        let result = request
            .json(&script)
            .timeout(std::time::Duration::from_secs(15))
            .send()
            .await;
        
        match result {
            Ok(resp) if resp.status().is_success() => {
                let etag = resp.headers()
                    .get("ETag")
                    .and_then(|v| v.to_str().ok())
                    .map(|s| s.to_string());
                
                if let Ok(body) = resp.json::<serde_json::Value>().await {
                    set_to_cache(&cache_key, body, etag);
                }
                
                script.is_synced = true;
                script.updated_at = Utc::now().to_rfc3339();
                if let Err(e) = db.update_script(script) {
                    eprintln!("Failed to update script status: {}", e);
                }
                return Ok(true);
            }
            Ok(resp) if resp.status() == reqwest::StatusCode::NOT_MODIFIED => {
                script.is_synced = true;
                if let Err(e) = db.update_script(script) {
                    eprintln!("Failed to update script status: {}", e);
                }
                return Ok(true);
            }
            Ok(resp) => {
                let status = resp.status();
                if attempt < retry_count {
                    tokio::time::sleep(std::time::Duration::from_secs(2u64.pow(attempt as u32))).await;
                    continue;
                }
                eprintln!("Sync failed for {} with status: {}", script.name, status);
                return Ok(false);
            }
            Err(e) => {
                if attempt < retry_count {
                    tokio::time::sleep(std::time::Duration::from_secs(2u64.pow(attempt as u32))).await;
                    continue;
                }
                eprintln!("Sync error for {} (attempt {}/{}): {}", script.name, attempt + 1, retry_count + 1, e);
                return Ok(false);
            }
        }
    }
    Ok(false)
}

#[derive(Serialize)]
struct BatchSyncRequest {
    scripts: Vec<ScriptFile>,
}

#[derive(Deserialize)]
struct BatchSyncResponse {
    success: Vec<String>,
    failed: Vec<String>,
    errors: HashMap<String, String>,
}

async fn sync_batch(
    client: &reqwest::Client,
    config: &SyncConfig,
    batch: &mut [ScriptFile],
    db: &crate::database::Database,
) -> Result<(usize, usize)> {
    let request = BatchSyncRequest {
        scripts: batch.to_vec(),
    };
    
    let result = client
        .post(&format!("{}/api/scripts/batch-sync", config.server_url))
        .header("Authorization", format!("Bearer {}", config.api_key))
        .json(&request)
        .timeout(Duration::from_secs(60))
        .send()
        .await;
    
    match result {
        Ok(resp) if resp.status().is_success() => {
            let response: BatchSyncResponse = resp.json().await?;
            
            let mut success_count = 0;
            let mut failed_count = 0;
            
            for script in batch.iter_mut() {
                if response.success.contains(&script.id) {
                    script.is_synced = true;
                    script.updated_at = Utc::now().to_rfc3339();
                    if let Err(e) = db.update_script(script) {
                        eprintln!("Failed to update script status: {}", e);
                    }
                    success_count += 1;
                } else {
                    failed_count += 1;
                }
            }
            
            invalidate_cache("script");
            Ok((success_count, failed_count))
        }
        Ok(resp) => {
            eprintln!("Batch sync failed with status: {}", resp.status());
            Ok((0, batch.len()))
        }
        Err(e) => {
            eprintln!("Batch sync error: {}", e);
            Ok((0, batch.len()))
        }
    }
}

pub async fn sync_now(state: &State<'_, AppState>) -> Result<()> {
    let db = state.db.lock().unwrap();
    let db = db.as_ref().context("Database not initialized")?;
    
    let config = db.load_sync_config()?.unwrap_or_default();
    
    if config.server_url.is_empty() || config.api_key.is_empty() {
        return Err(anyhow::anyhow!("Sync configuration incomplete"));
    }
    
    if IS_SYNCING.load(Ordering::SeqCst) {
        return Ok(());
    }
    
    IS_SYNCING.store(true, Ordering::SeqCst);
    STOP_SYNC.store(false, Ordering::SeqCst);
    
    let unsynced = match db.get_unsynced_scripts() {
        Ok(s) => s,
        Err(e) => {
            IS_SYNCING.store(false, Ordering::SeqCst);
            return Err(e);
        }
    };
    
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .pool_idle_timeout(Duration::from_secs(90))
        .pool_max_idle_per_host(CONCURRENT_REQUESTS)
        .build() 
    {
        Ok(c) => c,
        Err(e) => {
            IS_SYNCING.store(false, Ordering::SeqCst);
            return Err(e.into());
        }
    };
    
    let mut success_count = 0;
    let mut failed_count = 0;
    
    let batches: Vec<&[ScriptFile]> = unsynced.chunks(MAX_BATCH_SIZE).collect();
    let batches_arc = Arc::new(batches);
    let unsynced_arc = Arc::new(unsynced);
    
    let semaphore = Arc::new(tokio::sync::Semaphore::new(CONCURRENT_REQUESTS));
    let mut handles = Vec::new();
    
    for (i, batch) in batches_arc.iter().enumerate() {
        if STOP_SYNC.load(Ordering::SeqCst) {
            break;
        }
        
        let permit = semaphore.clone().acquire_owned().await.unwrap();
        let client = client.clone();
        let config = config.clone();
        let batch: Vec<ScriptFile> = batch.to_vec();
        let db = db.clone();
        
        let handle = tokio::spawn(async move {
            let _permit = permit;
            let mut batch = batch;
            sync_batch(&client, &config, &mut batch, &db).await
        });
        handles.push(handle);
    }
    
    for handle in handles {
        match handle.await {
            Ok(Ok((success, failed))) => {
                success_count += success;
                failed_count += failed;
            }
            Ok(Err(e)) => {
                eprintln!("Batch sync error: {}", e);
            }
            Err(e) => {
                eprintln!("Task error: {}", e);
            }
        }
    }
    
    eprintln!("Sync complete: {} succeeded, {} failed", success_count, failed_count);
    
    IS_SYNCING.store(false, Ordering::SeqCst);
    Ok(())
}

pub async fn pull_scripts(state: &State<'_, AppState>) -> Result<Vec<ScriptFile>> {
    let db = state.db.lock().unwrap();
    let db = db.as_ref().context("Database not initialized")?;
    
    let config = db.load_sync_config()?.unwrap_or_default();
    
    if config.server_url.is_empty() || config.api_key.is_empty() {
        return Err(anyhow::anyhow!("Sync configuration incomplete"));
    }
    
    let cache_key = "scripts:list".to_string();
    if let Some(cached) = get_from_cache(&cache_key) {
        if let Ok(scripts) = serde_json::from_value::<Vec<ScriptFile>>(cached) {
            return Ok(scripts);
        }
    }
    
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()?;
    
    let response = client
        .get(&format!("{}/api/scripts", config.server_url))
        .header("Authorization", format!("Bearer {}", config.api_key))
        .send()
        .await?;
    
    if response.status().is_success() {
        let scripts: Vec<ScriptFile> = response.json().await?;
        set_to_cache(&cache_key, serde_json::to_value(&scripts)?, None);
        Ok(scripts)
    } else {
        Err(anyhow::anyhow!("Failed to pull scripts: {}", response.status()))
    }
}

pub async fn test_connection(server_url: &str, api_key: &str) -> Result<bool> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()?;
    
    let response = client
        .get(&format!("{}/api/health", server_url))
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await;
    
    match response {
        Ok(resp) => Ok(resp.status().is_success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
pub async fn clear_sync_cache() -> Result<bool, String> {
    clear_cache();
    Ok(true)
}

#[tauri::command]
pub async fn pull_remote_scripts(state: State<'_, AppState>) -> Result<Vec<ScriptFile>, String> {
    pull_scripts(&state).await.map_err(|e| e.to_string())
}
