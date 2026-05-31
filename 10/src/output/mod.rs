pub mod report;

use anyhow::Result;
use serde::{Deserialize, Serialize};

pub use report::ReportGenerator;

use crate::cluster::ConnectionResult;
use crate::collector::MetricsCollection;
use crate::rules::CheckResult;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InspectionReport {
    pub report_id: String,
    pub generated_at: chrono::DateTime<chrono::Utc>,
    pub summary: ReportSummary,
    pub connections: Vec<ConnectionResult>,
    pub metrics: Vec<MetricsCollection>,
    pub check_results: Vec<CheckResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportSummary {
    pub total_servers: usize,
    pub online_servers: usize,
    pub offline_servers: usize,
    pub online_rate: f64,
    pub total_checks: usize,
    pub passed_checks: usize,
    pub failed_checks: usize,
    pub pass_rate: f64,
    pub critical_issues: usize,
    pub warning_issues: usize,
    pub info_issues: usize,
    pub duration_ms: u64,
}

#[derive(Debug, Clone)]
pub enum OutputFormat {
    Json,
    Yaml,
    Csv,
    Html,
}

impl OutputFormat {
    pub fn from_str(s: &str) -> Result<Self> {
        match s.to_lowercase().as_str() {
            "json" => Ok(OutputFormat::Json),
            "yaml" | "yml" => Ok(OutputFormat::Yaml),
            "csv" => Ok(OutputFormat::Csv),
            "html" => Ok(OutputFormat::Html),
            _ => Err(anyhow::anyhow!("不支持的输出格式: {}", s)),
        }
    }

    pub fn to_extension(&self) -> &str {
        match self {
            OutputFormat::Json => "json",
            OutputFormat::Yaml => "yaml",
            OutputFormat::Csv => "csv",
            OutputFormat::Html => "html",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CsvRow {
    pub timestamp: String,
    pub host: String,
    pub rule_id: String,
    pub rule_name: String,
    pub severity: String,
    pub passed: String,
    pub actual_value: String,
    pub expected_condition: String,
    pub message: String,
}
