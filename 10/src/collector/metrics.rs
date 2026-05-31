use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CpuMetrics {
    pub model_name: String,
    pub cores: u32,
    pub usage_percent: f64,
    pub user_percent: f64,
    pub system_percent: f64,
    pub iowait_percent: f64,
    pub idle_percent: f64,
    pub load_1min: f64,
    pub load_5min: f64,
    pub load_15min: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryMetrics {
    pub total_mb: f64,
    pub used_mb: f64,
    pub free_mb: f64,
    pub available_mb: f64,
    pub buffers_mb: f64,
    pub cached_mb: f64,
    pub usage_percent: f64,
    pub swap_total_mb: f64,
    pub swap_used_mb: f64,
    pub swap_free_mb: f64,
    pub swap_usage_percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskMetrics {
    pub filesystem: String,
    pub fstype: String,
    pub mount_point: String,
    pub total_gb: f64,
    pub used_gb: f64,
    pub available_gb: f64,
    pub usage_percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessMetrics {
    pub pid: u32,
    pub user: String,
    pub cpu_percent: f64,
    pub mem_percent: f64,
    pub vsz_mb: f64,
    pub rss_mb: f64,
    pub state: String,
    pub start: String,
    pub time: String,
    pub command: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemMetrics {
    pub hostname: String,
    pub kernel_version: String,
    pub os_version: String,
    pub uptime_seconds: f64,
    pub uptime_formatted: String,
    pub tcp_connections: u32,
    pub open_files: u32,
}
