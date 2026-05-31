pub mod validator;

use serde::{Deserialize, Serialize};

pub use validator::RuleValidator;

use crate::config::Severity;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckResult {
    pub rule_id: String,
    pub rule_name: String,
    pub host: String,
    pub metric_type: String,
    pub severity: Severity,
    pub passed: bool,
    pub actual_value: String,
    pub expected_condition: String,
    pub message: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleValidationError {
    pub rule_id: String,
    pub field: String,
    pub message: String,
}
