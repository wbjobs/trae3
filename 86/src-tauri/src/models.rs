use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptFile {
    pub id: String,
    pub name: String,
    pub path: String,
    pub content: String,
    pub language: String,
    pub size: i64,
    pub created_at: String,
    pub updated_at: String,
    pub is_synced: bool,
    pub remote_id: Option<String>,
    pub version: i32,
    pub tags: Option<Vec<String>>,
    pub checksum: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub line: i32,
    pub column: i32,
    pub offset: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Token {
    pub r#type: String,
    pub value: String,
    pub position: Position,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ASTNode {
    pub r#type: String,
    pub name: Option<String>,
    pub start: i32,
    pub end: i32,
    pub children: Option<Vec<ASTNode>>,
    pub value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseError {
    pub message: String,
    pub severity: String,
    pub position: Position,
    pub code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseResult {
    pub success: bool,
    pub ast: Option<ASTNode>,
    pub errors: Vec<ParseError>,
    pub tokens: Vec<Token>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Suggestion {
    pub message: String,
    pub r#type: String,
    pub position: Position,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyntaxCheckResult {
    pub is_valid: bool,
    pub errors: Vec<ParseError>,
    pub suggestions: Vec<Suggestion>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncConfig {
    pub server_url: String,
    pub api_key: String,
    pub username: String,
    pub auto_sync: bool,
    pub sync_interval: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStatus {
    pub is_syncing: bool,
    pub last_sync_time: Option<String>,
    pub pending_files: i32,
    pub total_files: i32,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteScript {
    pub id: String,
    pub name: String,
    pub language: String,
    pub author: String,
    pub description: String,
    pub downloads: i32,
    pub stars: i32,
    pub updated_at: String,
    pub version: i32,
    pub categories: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptVersion {
    pub id: String,
    pub script_id: String,
    pub version: i32,
    pub content: String,
    pub created_at: String,
    pub author: String,
    pub message: Option<String>,
    pub diff: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalProject {
    pub id: String,
    pub name: String,
    pub path: String,
    pub description: String,
    pub scripts: Vec<ScriptFile>,
    pub created_at: String,
    pub updated_at: String,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConfig {
    pub db_path: String,
    pub encryption_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: i64,
}

impl ScriptFile {
    pub fn new(name: String, path: String, content: String, language: String) -> Self {
        let now = Utc::now().to_rfc3339();
        let checksum = Some(Self::calculate_checksum(&content));
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            path,
            content,
            language,
            size: content.len() as i64,
            created_at: now.clone(),
            updated_at: now,
            is_synced: false,
            remote_id: None,
            version: 1,
            tags: None,
            checksum,
        }
    }
    
    pub fn calculate_checksum(content: &str) -> String {
        use sha2::{Sha256, Digest};
        let mut hasher = Sha256::new();
        hasher.update(content.as_bytes());
        format!("{:x}", hasher.finalize())
    }
    
    pub fn verify_checksum(&self) -> bool {
        match &self.checksum {
            Some(saved) => {
                let calculated = Self::calculate_checksum(&self.content);
                saved == &calculated
            }
            None => true,
        }
    }
    
    pub fn update_checksum(&mut self) {
        self.checksum = Some(Self::calculate_checksum(&self.content));
    }
}

impl LocalProject {
    pub fn new(name: String, path: String, description: Option<&str>) -> Self {
        let now = Utc::now().to_rfc3339();
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            path,
            description: description.unwrap_or_default().to_string(),
            scripts: vec![],
            created_at: now.clone(),
            updated_at: now,
            is_active: true,
        }
    }
}

impl Default for SyncConfig {
    fn default() -> Self {
        Self {
            server_url: "https://api.scriptworkstation.com".to_string(),
            api_key: String::new(),
            username: String::new(),
            auto_sync: false,
            sync_interval: 300,
        }
    }
}

impl Default for SyncStatus {
    fn default() -> Self {
        Self {
            is_syncing: false,
            last_sync_time: None,
            pending_files: 0,
            total_files: 0,
            error: None,
        }
    }
}
