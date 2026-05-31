use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use anyhow::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GatewayConfig {
    pub gateways: Vec<Gateway>,
    #[serde(default)]
    pub defaults: DefaultConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Gateway {
    pub id: String,
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default = "default_username")]
    pub username: String,
    pub password: Option<String>,
    pub key_path: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
}

fn default_port() -> u16 { 22 }
fn default_username() -> String { "root".into() }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DefaultConfig {
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default = "default_username")]
    pub username: String,
    pub password: Option<String>,
    pub key_path: Option<String>,
    #[serde(default = "default_timeout")]
    pub timeout_secs: u64,
}

fn default_timeout() -> u64 { 30 }

impl Default for DefaultConfig {
    fn default() -> Self {
        DefaultConfig {
            port: 22,
            username: "root".into(),
            password: None,
            key_path: None,
            timeout_secs: 30,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleConfig {
    pub rules: Vec<Rule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rule {
    pub name: String,
    pub metric: String,
    pub operator: RuleOperator,
    pub threshold: f64,
    pub severity: Severity,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RuleOperator {
    Gt,
    Lt,
    Gte,
    Lte,
    Eq,
    Neq,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Severity {
    Info,
    Warn,
    Error,
    Critical,
}

impl RuleOperator {
    pub fn evaluate(&self, value: f64, threshold: f64) -> bool {
        match self {
            RuleOperator::Gt => value > threshold,
            RuleOperator::Lt => value < threshold,
            RuleOperator::Gte => value >= threshold,
            RuleOperator::Lte => value <= threshold,
            RuleOperator::Eq => (value - threshold).abs() < f64::EPSILON,
            RuleOperator::Neq => (value - threshold).abs() >= f64::EPSILON,
        }
    }
}

impl GatewayConfig {
    pub fn load(path: &Path) -> Result<Self> {
        let content = fs::read_to_string(path)?;
        let ext = path.extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");
        let mut config: GatewayConfig = match ext {
            "json" => serde_json::from_str(&content)?,
            "yaml" | "yml" => serde_yaml::from_str(&content)?,
            _ => anyhow::bail!("unsupported config format: .{}", ext),
        };
        for gw in &mut config.gateways {
            if gw.port == 0 {
                gw.port = config.defaults.port;
            }
            if gw.username.is_empty() {
                gw.username = config.defaults.username.clone();
            }
            if gw.password.is_none() && gw.key_path.is_none() {
                gw.password = config.defaults.password.clone();
                gw.key_path = config.defaults.key_path.clone();
            }
        }
        Ok(config)
    }

    pub fn filter_by_tags(&self, tags: &[String]) -> Vec<&Gateway> {
        if tags.is_empty() {
            return self.gateways.iter().collect();
        }
        self.gateways
            .iter()
            .filter(|gw| tags.iter().any(|t| gw.tags.contains(t)))
            .collect()
    }
}

impl RuleConfig {
    pub fn load(path: &Path) -> Result<Self> {
        let content = fs::read_to_string(path)?;
        let ext = path.extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");
        match ext {
            "json" => Ok(serde_json::from_str(&content)?),
            "yaml" | "yml" => Ok(serde_yaml::from_str(&content)?),
            _ => anyhow::bail!("unsupported rule config format: .{}", ext),
        }
    }
}

impl Default for GatewayConfig {
    fn default() -> Self {
        GatewayConfig {
            gateways: vec![
                Gateway {
                    id: "gw-001".into(),
                    host: "192.168.1.101".into(),
                    port: 22,
                    username: "root".into(),
                    password: Some("changeme".into()),
                    key_path: None,
                    tags: vec!["factory-a".into(), "sensor".into()],
                },
                Gateway {
                    id: "gw-002".into(),
                    host: "192.168.1.102".into(),
                    port: 22,
                    username: "root".into(),
                    password: None,
                    key_path: Some("~/.ssh/id_rsa".into()),
                    tags: vec!["factory-a".into(), "edge".into()],
                },
                Gateway {
                    id: "gw-003".into(),
                    host: "192.168.1.201".into(),
                    port: 2222,
                    username: "admin".into(),
                    password: Some("changeme".into()),
                    key_path: None,
                    tags: vec!["factory-b".into()],
                },
            ],
            defaults: DefaultConfig::default(),
        }
    }
}

impl Default for RuleConfig {
    fn default() -> Self {
        RuleConfig {
            rules: vec![
                Rule {
                    name: "CPU 过高".into(),
                    metric: "cpu_usage".into(),
                    operator: RuleOperator::Gt,
                    threshold: 90.0,
                    severity: Severity::Error,
                    message: "CPU 使用率超过 90%".into(),
                },
                Rule {
                    name: "内存不足".into(),
                    metric: "mem_usage".into(),
                    operator: RuleOperator::Gt,
                    threshold: 85.0,
                    severity: Severity::Warn,
                    message: "内存使用率超过 85%".into(),
                },
                Rule {
                    name: "磁盘空间不足".into(),
                    metric: "disk_usage".into(),
                    operator: RuleOperator::Gt,
                    threshold: 90.0,
                    severity: Severity::Critical,
                    message: "磁盘使用率超过 90%".into(),
                },
                Rule {
                    name: "负载过高".into(),
                    metric: "load_avg_1m".into(),
                    operator: RuleOperator::Gt,
                    threshold: 4.0,
                    severity: Severity::Warn,
                    message: "1分钟平均负载超过 4.0".into(),
                },
                Rule {
                    name: "温度过高".into(),
                    metric: "temperature".into(),
                    operator: RuleOperator::Gt,
                    threshold: 75.0,
                    severity: Severity::Error,
                    message: "设备温度超过 75°C".into(),
                },
            ],
        }
    }
}

pub fn generate_sample_gateway_config(path: &Path) -> Result<()> {
    let config = GatewayConfig::default();
    let content = serde_yaml::to_string(&config)?;
    fs::write(path, content)?;
    Ok(())
}

pub fn generate_sample_rule_config(path: &Path) -> Result<()> {
    let config = RuleConfig::default();
    let content = serde_yaml::to_string(&config)?;
    fs::write(path, content)?;
    Ok(())
}
