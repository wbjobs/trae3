use anyhow::{Result, Context};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub servers: Vec<ServerConfig>,
    #[serde(default)]
    pub global: GlobalConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub name: String,
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u16,
    pub username: String,
    #[serde(flatten)]
    pub auth: AuthConfig,
    #[serde(default = "default_group")]
    pub group: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub description: String,
}

fn default_port() -> u16 { 22 }
fn default_group() -> String { "default".to_string() }

impl ServerConfig {
    pub fn timeout_secs(&self, global: Option<&GlobalConfig>) -> u64 {
        global.map(|g| g.timeout).unwrap_or(30)
    }

    pub fn in_groups(&self, groups: &[String]) -> bool {
        groups.is_empty() || groups.iter().any(|g| g == &self.group)
    }

    pub fn not_in_groups(&self, groups: &[String]) -> bool {
        groups.is_empty() || !groups.iter().any(|g| g == &self.group)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "auth_type", rename_all = "lowercase")]
pub enum AuthConfig {
    Password { password: String },
    Key { key_path: String, #[serde(default)] passphrase: Option<String> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlobalConfig {
    #[serde(default = "default_timeout")]
    pub timeout: u64,
    #[serde(default = "default_retries")]
    pub retries: u32,
    #[serde(default = "default_parallel")]
    pub parallel: usize,
}

fn default_timeout() -> u64 { 30 }
fn default_retries() -> u32 { 2 }
fn default_parallel() -> usize { 5 }

impl Default for GlobalConfig {
    fn default() -> Self {
        GlobalConfig {
            timeout: 30,
            retries: 2,
            parallel: 5,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleConfig {
    pub rules: Vec<InspectionRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InspectionRule {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub metric_type: String,
    pub condition: String,
    pub severity: Severity,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

fn default_enabled() -> bool { true }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Critical,
    Warning,
    Info,
}

impl Config {
    pub fn load<P: AsRef<Path>>(path: P) -> Result<Self> {
        let path = path.as_ref();
        let content = fs::read_to_string(path)
            .with_context(|| format!("读取配置文件失败: {}", path.display()))?;

        let config: Config = if path.extension().and_then(|s| s.to_str()) == Some("json") {
            serde_json::from_str(&content)
                .with_context(|| format!("解析 JSON 配置文件失败: {}", path.display()))?
        } else {
            serde_yaml::from_str(&content)
                .with_context(|| format!("解析 YAML 配置文件失败: {}", path.display()))?
        };

        Ok(config)
    }

    pub fn get_server(&self, name: &str) -> Option<&ServerConfig> {
        self.servers.iter().find(|s| s.name == name || s.host == name)
    }

    pub fn filter_servers(&self, groups: &[String], exclude_groups: &[String]) -> Vec<ServerConfig> {
        self.servers
            .iter()
            .filter(|s| s.in_groups(groups) && s.not_in_groups(exclude_groups))
            .cloned()
            .collect()
    }

    pub fn get_all_groups(&self) -> Vec<String> {
        let mut groups: Vec<String> = self.servers
            .iter()
            .map(|s| s.group.clone())
            .collect();
        groups.sort();
        groups.dedup();
        groups
    }
}

impl RuleConfig {
    pub fn load<P: AsRef<Path>>(path: P) -> Result<Self> {
        let path = path.as_ref();
        let content = fs::read_to_string(path)
            .with_context(|| format!("读取规则文件失败: {}", path.display()))?;

        let config: RuleConfig = if path.extension().and_then(|s| s.to_str()) == Some("json") {
            serde_json::from_str(&content)
                .with_context(|| format!("解析 JSON 规则文件失败: {}", path.display()))?
        } else {
            serde_yaml::from_str(&content)
                .with_context(|| format!("解析 YAML 规则文件失败: {}", path.display()))?
        };

        Ok(config)
    }
}

impl Default for Config {
    fn default() -> Self {
        Config {
            servers: Vec::new(),
            global: GlobalConfig::default(),
        }
    }
}
