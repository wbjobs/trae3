use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduledTask {
    pub id: String,
    pub name: String,
    pub cron: String,
    pub config_path: String,
    pub rules_path: String,
    pub output_dir: String,
    pub format: String,
    #[serde(default)]
    pub groups: Vec<String>,
    #[serde(default)]
    pub exclude_groups: Vec<String>,
    pub enabled: bool,
    pub last_run: Option<chrono::DateTime<chrono::Utc>>,
    pub next_run: Option<chrono::DateTime<chrono::Utc>>,
    pub run_count: u64,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskExecutionResult {
    pub task_id: String,
    pub started_at: chrono::DateTime<chrono::Utc>,
    pub finished_at: chrono::DateTime<chrono::Utc>,
    pub success: bool,
    pub error_message: Option<String>,
    pub report_path: Option<String>,
    pub summary: Option<TaskExecutionSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskExecutionSummary {
    pub total_servers: usize,
    pub online_servers: usize,
    pub passed_checks: usize,
    pub failed_checks: usize,
    pub critical_issues: usize,
    pub warning_issues: usize,
}

impl ScheduledTask {
    pub fn duration_ms(&self) -> Option<i64> {
        match (self.last_run, self.next_run) {
            (Some(last), Some(next)) => Some((next - last).num_milliseconds()),
            _ => None,
        }
    }

    pub fn status_text(&self) -> &str {
        if self.enabled {
            if self.last_run.is_some() {
                "运行中"
            } else {
                "待运行"
            }
        } else {
            "已禁用"
        }
    }
}
