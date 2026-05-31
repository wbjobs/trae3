use crate::models::*;
use crate::AppState;
use anyhow::{Context, Result};
use rusqlite::{params, Connection};
use std::path::Path;
use tauri::State;
use uuid::Uuid;
use chrono::Utc;

pub struct Database {
    conn: Connection,
    encryption_key: Option<String>,
}

impl Database {
    pub fn new(db_path: &str, encryption_key: Option<&str>) -> Result<Self> {
        let path = Path::new(db_path);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        
        let conn = Connection::open(db_path)
            .with_context(|| format!("Failed to open database at {}", db_path))?;
        
        Ok(Self {
            conn,
            encryption_key: encryption_key.map(|k| k.to_string()),
        })
    }
    
    pub fn init(&self) -> Result<()> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                path TEXT NOT NULL,
                description TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                is_active INTEGER DEFAULT 1
            );
            
            CREATE TABLE IF NOT EXISTS scripts (
                id TEXT PRIMARY KEY,
                project_id TEXT,
                name TEXT NOT NULL,
                path TEXT NOT NULL,
                language TEXT NOT NULL,
                size INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                is_synced INTEGER DEFAULT 0,
                remote_id TEXT,
                version INTEGER DEFAULT 1,
                tags TEXT,
                checksum TEXT,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            );
            
            CREATE TABLE IF NOT EXISTS versions (
                id TEXT PRIMARY KEY,
                script_id TEXT NOT NULL,
                version INTEGER NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                author TEXT NOT NULL,
                message TEXT,
                diff TEXT,
                checksum TEXT,
                FOREIGN KEY (script_id) REFERENCES scripts(id)
            );
            
            CREATE TABLE IF NOT EXISTS sync_config (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                server_url TEXT NOT NULL,
                api_key TEXT,
                username TEXT,
                auto_sync INTEGER DEFAULT 0,
                sync_interval INTEGER DEFAULT 300
            );
            
            CREATE INDEX IF NOT EXISTS idx_scripts_project_id ON scripts(project_id);
            CREATE INDEX IF NOT EXISTS idx_versions_script_id ON versions(script_id);
            CREATE INDEX IF NOT EXISTS idx_scripts_updated_at ON scripts(updated_at DESC);"
        )?;
        
        Ok(())
    }
    
    pub fn insert_project(&self, project: &LocalProject) -> Result<()> {
        self.conn.execute(
            "INSERT INTO projects (id, name, path, description, created_at, updated_at, is_active)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                project.id,
                project.name,
                project.path,
                project.description,
                project.created_at,
                project.updated_at,
                project.is_active
            ],
        )?;
        Ok(())
    }
    
    pub fn update_project(&self, project: &LocalProject) -> Result<()> {
        self.conn.execute(
            "UPDATE projects SET name = ?1, path = ?2, description = ?3, updated_at = ?4, is_active = ?5
             WHERE id = ?6",
            params![
                project.name,
                project.path,
                project.description,
                project.updated_at,
                project.is_active,
                project.id
            ],
        )?;
        Ok(())
    }
    
    pub fn get_project(&self, id: &str) -> Result<Option<LocalProject>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, path, description, created_at, updated_at, is_active
             FROM projects WHERE id = ?1"
        )?;
        
        let mut rows = stmt.query(params![id])?;
        
        if let Some(row) = rows.next()? {
            let scripts = self.get_scripts_by_project(id)?;
            Ok(Some(LocalProject {
                id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
                description: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
                is_active: row.get(6)?,
                scripts,
            }))
        } else {
            Ok(None)
        }
    }
    
    pub fn get_all_projects(&self) -> Result<Vec<LocalProject>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, path, description, created_at, updated_at, is_active
             FROM projects ORDER BY updated_at DESC"
        )?;
        
        let rows = stmt.query_map(params![], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, bool>(6)?,
            ))
        })?;
        
        let mut projects = Vec::new();
        for row_result in rows {
            let (id, name, path, description, created_at, updated_at, is_active) = row_result?;
            let scripts = self.get_scripts_by_project(&id)?;
            projects.push(LocalProject {
                id, name, path, description, created_at, updated_at, is_active, scripts
            });
        }
        
        Ok(projects)
    }
    
    pub fn delete_project(&self, id: &str) -> Result<()> {
        self.conn.execute("DELETE FROM versions WHERE script_id IN (SELECT id FROM scripts WHERE project_id = ?1)", params![id])?;
        self.conn.execute("DELETE FROM scripts WHERE project_id = ?1", params![id])?;
        self.conn.execute("DELETE FROM projects WHERE id = ?1", params![id])?;
        Ok(())
    }
    
    pub fn insert_script(&self, script: &ScriptFile, project_id: Option<&str>) -> Result<()> {
        let tags = script.tags.as_ref().map(|t| t.join(","));
        self.conn.execute(
            "INSERT INTO scripts (id, project_id, name, path, language, size, created_at, updated_at, is_synced, remote_id, version, tags, checksum)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                script.id,
                project_id,
                script.name,
                script.path,
                script.language,
                script.size,
                script.created_at,
                script.updated_at,
                script.is_synced,
                script.remote_id,
                script.version,
                tags,
                script.checksum
            ],
        )?;
        Ok(())
    }
    
    pub fn update_script(&self, script: &ScriptFile) -> Result<()> {
        let tags = script.tags.as_ref().map(|t| t.join(","));
        self.conn.execute(
            "UPDATE scripts SET name = ?1, path = ?2, language = ?3, size = ?4, updated_at = ?5,
             is_synced = ?6, remote_id = ?7, version = ?8, tags = ?9, checksum = ?10
             WHERE id = ?11",
            params![
                script.name,
                script.path,
                script.language,
                script.size,
                script.updated_at,
                script.is_synced,
                script.remote_id,
                script.version,
                tags,
                script.checksum,
                script.id
            ],
        )?;
        Ok(())
    }
    
    pub fn get_scripts_by_project(&self, project_id: &str) -> Result<Vec<ScriptFile>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, path, language, size, created_at, updated_at, is_synced, remote_id, version, tags, checksum
             FROM scripts WHERE project_id = ?1 ORDER BY updated_at DESC"
        )?;
        
        let rows = stmt.query_map(params![project_id], |row| {
            let tags: Option<String> = row.get(10)?;
            let checksum: Option<String> = row.get(11)?;
            Ok(ScriptFile {
                id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
                content: String::new(),
                language: row.get(3)?,
                size: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                is_synced: row.get(7)?,
                remote_id: row.get(8)?,
                version: row.get(9)?,
                tags: tags.map(|t| t.split(',').map(|s| s.to_string()).collect()),
                checksum,
            })
        })?;
        
        let mut scripts = Vec::new();
        for script in rows {
            scripts.push(script?);
        }
        
        Ok(scripts)
    }
    
    pub fn get_script(&self, id: &str) -> Result<Option<ScriptFile>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, path, language, size, created_at, updated_at, is_synced, remote_id, version, tags, checksum
             FROM scripts WHERE id = ?1"
        )?;
        
        let mut rows = stmt.query(params![id])?;
        
        if let Some(row) = rows.next()? {
            let tags: Option<String> = row.get(10)?;
            let checksum: Option<String> = row.get(11)?;
            Ok(Some(ScriptFile {
                id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
                content: String::new(),
                language: row.get(3)?,
                size: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                is_synced: row.get(7)?,
                remote_id: row.get(8)?,
                version: row.get(9)?,
                tags: tags.map(|t| t.split(',').map(|s| s.to_string()).collect()),
                checksum,
            }))
        } else {
            Ok(None)
        }
    }
    
    pub fn insert_version(&self, version: &ScriptVersion) -> Result<()> {
        let checksum = ScriptFile::calculate_checksum(&version.content);
        self.conn.execute(
            "INSERT INTO versions (id, script_id, version, content, created_at, author, message, diff, checksum)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                version.id,
                version.script_id,
                version.version,
                version.content,
                version.created_at,
                version.author,
                version.message,
                version.diff,
                Some(checksum)
            ],
        )?;
        Ok(())
    }
    
    pub fn get_versions_by_script(&self, script_id: &str) -> Result<Vec<ScriptVersion>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, script_id, version, content, created_at, author, message, diff
             FROM versions WHERE script_id = ?1 ORDER BY version DESC"
        )?;
        
        let rows = stmt.query_map(params![script_id], |row| {
            Ok(ScriptVersion {
                id: row.get(0)?,
                script_id: row.get(1)?,
                version: row.get(2)?,
                content: row.get(3)?,
                created_at: row.get(4)?,
                author: row.get(5)?,
                message: row.get(6)?,
                diff: row.get(7)?,
            })
        })?;
        
        let mut versions = Vec::new();
        for version in rows {
            versions.push(version?);
        }
        
        Ok(versions)
    }
    
    pub fn get_version(&self, id: &str) -> Result<Option<ScriptVersion>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, script_id, version, content, created_at, author, message, diff
             FROM versions WHERE id = ?1"
        )?;
        
        let mut rows = stmt.query(params![id])?;
        
        if let Some(row) = rows.next()? {
            Ok(Some(ScriptVersion {
                id: row.get(0)?,
                script_id: row.get(1)?,
                version: row.get(2)?,
                content: row.get(3)?,
                created_at: row.get(4)?,
                author: row.get(5)?,
                message: row.get(6)?,
                diff: row.get(7)?,
            }))
        } else {
            Ok(None)
        }
    }
    
    pub fn get_next_version_number(&self, script_id: &str) -> Result<i32> {
        self.conn.execute("BEGIN IMMEDIATE TRANSACTION", params![])?;
        
        let result = (|| {
            let mut stmt = self.conn.prepare(
                "SELECT COALESCE(MAX(version), 0) + 1 FROM versions WHERE script_id = ?1"
            )?;
            
            let mut rows = stmt.query(params![script_id])?;
            let version: i32 = if let Some(row) = rows.next()? {
                row.get(0)?
            } else {
                1
            };
            
            Ok(version)
        })();
        
        match result {
            Ok(v) => {
                self.conn.execute("COMMIT", params![])?;
                Ok(v)
            }
            Err(e) => {
                self.conn.execute("ROLLBACK", params![]).ok();
                Err(e)
            }
        }
    }
    
    pub fn insert_version_with_check(&self, version: &ScriptVersion) -> Result<bool> {
        self.conn.execute("BEGIN IMMEDIATE TRANSACTION", params![])?;
        let checksum = ScriptFile::calculate_checksum(&version.content);
        
        let result = (|| {
            let mut check_stmt = self.conn.prepare(
                "SELECT COUNT(*) FROM versions WHERE script_id = ?1 AND version = ?2"
            )?;
            
            let count: i64 = check_stmt.query_row(params![version.script_id, version.version], |row| row.get(0))?;
            
            if count > 0 {
                return Ok(false);
            }
            
            self.conn.execute(
                "INSERT INTO versions (id, script_id, version, content, created_at, author, message, diff, checksum)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    version.id,
                    version.script_id,
                    version.version,
                    version.content,
                    version.created_at,
                    version.author,
                    version.message,
                    version.diff,
                    Some(checksum.clone())
                ],
            )?;
            
            Ok(true)
        })();
        
        match result {
            Ok(v) => {
                self.conn.execute("COMMIT", params![])?;
                Ok(v)
            }
            Err(e) => {
                self.conn.execute("ROLLBACK", params![]).ok();
                Err(e)
            }
        }
    }
    
    pub fn save_sync_config(&self, config: &SyncConfig) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO sync_config (id, server_url, api_key, username, auto_sync, sync_interval)
             VALUES (1, ?1, ?2, ?3, ?4, ?5)",
            params![
                config.server_url,
                config.api_key,
                config.username,
                config.auto_sync,
                config.sync_interval
            ],
        )?;
        Ok(())
    }
    
    pub fn load_sync_config(&self) -> Result<Option<SyncConfig>> {
        let mut stmt = self.conn.prepare(
            "SELECT server_url, api_key, username, auto_sync, sync_interval
             FROM sync_config WHERE id = 1"
        )?;
        
        let mut rows = stmt.query(params![])?;
        
        if let Some(row) = rows.next()? {
            Ok(Some(SyncConfig {
                server_url: row.get(0)?,
                api_key: row.get(1)?,
                username: row.get(2)?,
                auto_sync: row.get(3)?,
                sync_interval: row.get(4)?,
            }))
        } else {
            Ok(None)
        }
    }
    
    pub fn get_unsynced_scripts(&self) -> Result<Vec<ScriptFile>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, path, language, size, created_at, updated_at, is_synced, remote_id, version, tags, checksum
             FROM scripts WHERE is_synced = 0 ORDER BY updated_at DESC"
        )?;
        
        let rows = stmt.query_map(params![], |row| {
            let tags: Option<String> = row.get(10)?;
            let checksum: Option<String> = row.get(11)?;
            Ok(ScriptFile {
                id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
                content: String::new(),
                language: row.get(3)?,
                size: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                is_synced: row.get(7)?,
                remote_id: row.get(8)?,
                version: row.get(9)?,
                tags: tags.map(|t| t.split(',').map(|s| s.to_string()).collect()),
                checksum,
            })
        })?;
        
        let mut scripts = Vec::new();
        for script in rows {
            scripts.push(script?);
        }
        
        Ok(scripts)
    }
    
    pub fn verify_script_checksum(&self, script_id: &str) -> Result<bool> {
        let script = self.get_script(script_id)?;
        
        match script {
            Some(mut s) => {
                match std::fs::read_to_string(&s.path) {
                    Ok(content) => {
                        s.content = content;
                        Ok(s.verify_checksum())
                    }
                    Err(_) => Ok(false),
                }
            }
            None => Ok(false),
        }
    }
    
    pub fn repair_script_checksum(&self, script_id: &str) -> Result<bool> {
        let mut script = self.get_script(script_id)?
            .context("Script not found")?;
        
        let content = std::fs::read_to_string(&script.path)
            .unwrap_or_default();
        
        script.content = content;
        script.size = content.len() as i64;
        script.update_checksum();
        
        self.update_script(&script)?;
        Ok(true)
    }
}

pub async fn save_version(
    script_id: &str,
    content: &str,
    message: Option<&str>,
    state: &State<'_, AppState>,
) -> Result<ScriptVersion> {
    let db = state.db.lock().unwrap();
    let db = db.as_ref().context("Database not initialized")?;
    let sync_config = state.sync_config.lock().unwrap();
    
    let mut attempts = 0;
    let max_attempts = 5;
    
    while attempts < max_attempts {
        let version_num = db.get_next_version_number(script_id)?;
        
        let version = ScriptVersion {
            id: Uuid::new_v4().to_string(),
            script_id: script_id.to_string(),
            version: version_num,
            content: content.to_string(),
            created_at: Utc::now().to_rfc3339(),
            author: sync_config.as_ref().map(|c| c.username.clone()).unwrap_or_default(),
            message: message.map(|m| m.to_string()),
            diff: None,
        };
        
        match db.insert_version_with_check(&version) {
            Ok(true) => return Ok(version),
            Ok(false) => {
                attempts += 1;
                continue;
            }
            Err(e) => return Err(e),
        }
    }
    
    Err(anyhow::anyhow!("Failed to save version after {} attempts due to conflict", max_attempts))
}

pub async fn get_versions(
    script_id: &str,
    state: &State<'_, AppState>,
) -> Result<Vec<ScriptVersion>> {
    let db = state.db.lock().unwrap();
    let db = db.as_ref().context("Database not initialized")?;
    db.get_versions_by_script(script_id)
}

pub async fn restore_version(
    script_id: &str,
    version_id: &str,
    state: &State<'_, AppState>,
) -> Result<ScriptFile> {
    let db = state.db.lock().unwrap();
    let db = db.as_ref().context("Database not initialized")?;
    
    let version = db.get_version(version_id)?
        .context("Version not found")?;
    
    let mut script = db.get_script(script_id)?
        .context("Script not found")?;
    
    script.content = version.content;
    script.updated_at = Utc::now().to_rfc3339();
    script.is_synced = false;
    
    db.update_script(&script)?;
    
    Ok(script)
}

pub async fn save_sync_config(
    config: &SyncConfig,
    state: &State<'_, AppState>,
) -> Result<bool> {
    let db = state.db.lock().unwrap();
    let db = db.as_ref().context("Database not initialized")?;
    db.save_sync_config(config)?;
    
    let mut sync_config = state.sync_config.lock().unwrap();
    *sync_config = Some(config.clone());
    
    Ok(true)
}

pub async fn load_sync_config(
    state: &State<'_, AppState>,
) -> Result<Option<SyncConfig>> {
    let db = state.db.lock().unwrap();
    let db = db.as_ref().context("Database not initialized")?;
    db.load_sync_config()
}
