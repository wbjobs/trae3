use crate::models::*;
use crate::AppState;
use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use tauri::State;
use walkdir::WalkDir;
use chrono::Utc;

pub async fn load_project(
    path: &str,
    state: &State<'_, AppState>,
) -> Result<LocalProject> {
    let db = state.db.lock().unwrap();
    let db = db.as_ref().context("Database not initialized")?;
    
    let project_path = Path::new(path);
    let project_name = project_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Untitled")
        .to_string();
    
    let scripts = scan_scripts(path)?;
    
    let mut project = LocalProject::new(project_name, path.to_string(), None);
    project.scripts = scripts.clone();
    
    if let Some(existing) = db.get_project(&project.id)? {
        project.id = existing.id;
        db.update_project(&project)?;
    } else {
        db.insert_project(&project)?;
    }
    
    for script in &scripts {
        if db.get_script(&script.id)?.is_none() {
            db.insert_script(script, Some(&project.id))?;
        }
    }
    
    Ok(project)
}

pub async fn save_file(
    file: &ScriptFile,
    state: &State<'_, AppState>,
) -> Result<bool> {
    let db = state.db.lock().unwrap();
    let db = db.as_ref().context("Database not initialized")?;
    
    let path = Path::new(&file.path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    
    std::fs::write(&file.path, &file.content)?;
    
    let mut updated_file = file.clone();
    updated_file.updated_at = Utc::now().to_rfc3339();
    updated_file.size = file.content.len() as i64;
    updated_file.is_synced = false;
    updated_file.update_checksum();
    
    if db.get_script(&file.id)?.is_some() {
        db.update_script(&updated_file)?;
    } else {
        db.insert_script(&updated_file, None)?;
    }
    
    Ok(true)
}

pub async fn create_project(
    name: &str,
    path: &str,
    description: Option<&str>,
    state: &State<'_, AppState>,
) -> Result<LocalProject> {
    let db = state.db.lock().unwrap();
    let db = db.as_ref().context("Database not initialized")?;
    
    let project_path = Path::new(path);
    std::fs::create_dir_all(project_path)?;
    
    let project = LocalProject::new(name.to_string(), path.to_string(), description);
    db.insert_project(&project)?;
    
    Ok(project)
}

pub async fn list_projects(state: &State<'_, AppState>) -> Result<Vec<LocalProject>> {
    let db = state.db.lock().unwrap();
    let db = db.as_ref().context("Database not initialized")?;
    db.get_all_projects()
}

pub async fn delete_project(project_id: &str, state: &State<'_, AppState>) -> Result<bool> {
    let db = state.db.lock().unwrap();
    let db = db.as_ref().context("Database not initialized")?;
    
    let project = db.get_project(project_id)?
        .context("Project not found")?;
    
    let path = Path::new(&project.path);
    if path.exists() {
        std::fs::remove_dir_all(path).ok();
    }
    
    db.delete_project(project_id)?;
    Ok(true)
}

pub async fn scan_directory(
    path: &str,
    extensions: Option<&[String]>,
) -> Result<Vec<FileEntry>> {
    let mut entries = Vec::new();
    let dir_path = Path::new(path);
    
    if !dir_path.exists() || !dir_path.is_dir() {
        return Err(anyhow::anyhow!("Directory not found: {}", path));
    }
    
    for entry in WalkDir::new(dir_path).min_depth(1).max_depth(1) {
        let entry = entry?;
        let file_type = entry.file_type();
        let name = entry.file_name().to_string_lossy().to_string();
        
        if name.starts_with('.') {
            continue;
        }
        
        let path_str = entry.path().to_string_lossy().to_string();
        let is_dir = file_type.is_dir();
        
        let mut include = true;
        if !is_dir {
            if let Some(exts) = extensions {
                let file_ext = entry.path()
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                include = exts.iter().any(|e| e.to_lowercase() == file_ext);
            }
        }
        
        if include {
            let size = if file_type.is_file() {
                entry.metadata()?.len() as i64
            } else {
                0
            };
            
            entries.push(FileEntry {
                name,
                path: path_str,
                is_dir,
                size,
            });
        }
    }
    
    entries.sort_by(|a, b| {
        if a.is_dir && !b.is_dir {
            std::cmp::Ordering::Less
        } else if !a.is_dir && b.is_dir {
            std::cmp::Ordering::Greater
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });
    
    Ok(entries)
}

fn scan_scripts(path: &str) -> Result<Vec<ScriptFile>> {
    let mut scripts = Vec::new();
    let script_exts = ["js", "jsx", "ts", "tsx", "py", "rs", "go", "sh", "ps1", "sql", "json", "yaml", "yml"];
    
    let dir_path = Path::new(path);
    if !dir_path.exists() {
        return Ok(scripts);
    }
    
    for entry in WalkDir::new(dir_path).follow_links(false) {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        
        if !entry.file_type().is_file() {
            continue;
        }
        
        let file_ext = entry.path()
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        
        if !script_exts.contains(&file_ext.as_str()) {
            continue;
        }
        
        let name = entry.file_name().to_string_lossy().to_string();
        let path_str = entry.path().to_string_lossy().to_string();
        
        let content = match std::fs::read_to_string(entry.path()) {
            Ok(c) => c,
            Err(_) => continue,
        };
        
        let language = get_language_from_ext(&file_ext);
        let size = entry.metadata().map(|m| m.len() as i64).unwrap_or(0);
        let checksum = Some(ScriptFile::calculate_checksum(&content));
        
        scripts.push(ScriptFile {
            id: generate_id_from_path(&path_str),
            name,
            path: path_str,
            content,
            language,
            size,
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
            is_synced: false,
            remote_id: None,
            version: 1,
            tags: None,
            checksum,
        });
    }
    
    Ok(scripts)
}

fn get_language_from_ext(ext: &str) -> String {
    match ext {
        "js" | "jsx" => "javascript".to_string(),
        "ts" | "tsx" => "typescript".to_string(),
        "py" => "python".to_string(),
        "rs" => "rust".to_string(),
        "go" => "go".to_string(),
        "sh" => "bash".to_string(),
        "ps1" => "powershell".to_string(),
        "sql" => "sql".to_string(),
        "json" => "json".to_string(),
        "yaml" | "yml" => "yaml".to_string(),
        _ => "unknown".to_string(),
    }
}

fn generate_id_from_path(path: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    
    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

pub fn get_script_content(path: &str) -> Result<String> {
    std::fs::read_to_string(path)
        .with_context(|| format!("Failed to read file: {}", path))
}

pub fn get_script_size(path: &str) -> Result<u64> {
    std::fs::metadata(path)
        .map(|m| m.len())
        .with_context(|| format!("Failed to get metadata for: {}", path))
}

pub fn file_exists(path: &str) -> bool {
    Path::new(path).exists()
}

pub fn is_directory(path: &str) -> bool {
    Path::new(path).is_dir()
}

pub fn get_parent_path(path: &str) -> Option<String> {
    Path::new(path)
        .parent()
        .and_then(|p| p.to_str())
        .map(|s| s.to_string())
}

pub fn join_paths(base: &str, relative: &str) -> String {
    Path::new(base)
        .join(relative)
        .to_string_lossy()
        .to_string()
}

pub fn normalize_path(path: &str) -> String {
    PathBuf::from(path)
        .to_string_lossy()
        .to_string()
}
