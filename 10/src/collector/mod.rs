pub mod metrics;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use indicatif::{ProgressBar, ProgressStyle};

pub use metrics::{CpuMetrics, DiskMetrics, MemoryMetrics, ProcessMetrics, SystemMetrics};

use crate::cluster::ClusterManager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricsCollection {
    pub host: String,
    pub group: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub cpu: Option<CpuMetrics>,
    pub memory: Option<MemoryMetrics>,
    pub disk: Option<Vec<DiskMetrics>>,
    pub process: Option<Vec<ProcessMetrics>>,
    pub system: Option<SystemMetrics>,
    pub errors: Vec<String>,
}

pub struct MetricsCollector {
    cluster: ClusterManager,
}

impl MetricsCollector {
    pub fn new(cluster: ClusterManager) -> Self {
        MetricsCollector { cluster }
    }

    pub async fn collect_single(&self, host: &str, metric_type: &str) -> Result<MetricsCollection> {
        let server = self.cluster.get_server(host)
            .ok_or_else(|| anyhow::anyhow!("未找到服务器: {}", host))?;

        let mut collection = MetricsCollection {
            host: server.name.clone(),
            group: server.group.clone(),
            timestamp: chrono::Utc::now(),
            cpu: None,
            memory: None,
            disk: None,
            process: None,
            system: None,
            errors: Vec::new(),
        };

        let metric_types: Vec<&str> = if metric_type == "all" {
            vec!["cpu", "memory", "disk", "process", "system"]
        } else {
            metric_type.split(',').collect()
        };

        for mt in metric_types {
            let trimmed = mt.trim();
            match trimmed {
                "cpu" => {
                    match self.collect_cpu(host).await {
                        Ok(m) => collection.cpu = Some(m),
                        Err(e) => collection.errors.push(format!("CPU 采集失败: {}", e)),
                    }
                }
                "memory" => {
                    match self.collect_memory(host).await {
                        Ok(m) => collection.memory = Some(m),
                        Err(e) => collection.errors.push(format!("内存采集失败: {}", e)),
                    }
                }
                "disk" => {
                    match self.collect_disk(host).await {
                        Ok(m) => collection.disk = Some(m),
                        Err(e) => collection.errors.push(format!("磁盘采集失败: {}", e)),
                    }
                }
                "process" => {
                    match self.collect_process(host).await {
                        Ok(m) => collection.process = Some(m),
                        Err(e) => collection.errors.push(format!("进程采集失败: {}", e)),
                    }
                }
                "system" => {
                    match self.collect_system(host).await {
                        Ok(m) => collection.system = Some(m),
                        Err(e) => collection.errors.push(format!("系统信息采集失败: {}", e)),
                    }
                }
                other => {
                    return Err(anyhow::anyhow!("不支持的指标类型: {}", other));
                }
            }
        }

        Ok(collection)
    }

    pub async fn collect_all(&self, metric_type: &str) -> Result<Vec<MetricsCollection>> {
        self.collect_all_with_progress(metric_type, false).await
    }

    pub async fn collect_all_with_progress(
        &self,
        metric_type: &str,
        show_progress: bool,
    ) -> Result<Vec<MetricsCollection>> {
        let servers: Vec<String> = self.cluster.get_servers().iter().map(|s| s.name.clone()).collect();
        let total = servers.len();

        let pb = if show_progress {
            let pb = ProgressBar::new(total as u64);
            pb.set_style(ProgressStyle::default_bar()
                .template("{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}/{len} 指标采集中...").unwrap()
                .progress_chars("#>-"));
            Some(pb)
        } else {
            None
        };

        let semaphore = self.cluster.get_semaphore();
        let mut handles = Vec::new();

        for server_name in &servers {
            let name = server_name.clone();
            let mt = metric_type.to_string();
            let permit = semaphore.clone().acquire_owned().await.unwrap();
            let cluster = ClusterManager::with_config(
                self.cluster.get_servers().to_vec(),
                self.cluster.get_global_config().clone()
            );
            let pb_clone = pb.clone();

            handles.push(tokio::spawn(async move {
                let _permit = permit;
                let collector = MetricsCollector::new(cluster);
                let result = collector.collect_single(&name, &mt).await;

                if let Some(pb) = pb_clone {
                    pb.inc(1);
                }

                result
            }));
        }

        let mut results = Vec::new();
        for handle in handles {
            match handle.await? {
                Ok(collection) => results.push(collection),
                Err(e) => {
                    results.push(MetricsCollection {
                        host: "unknown".to_string(),
                        group: "unknown".to_string(),
                        timestamp: chrono::Utc::now(),
                        cpu: None,
                        memory: None,
                        disk: None,
                        process: None,
                        system: None,
                        errors: vec![e.to_string()],
                    });
                }
            }
        }

        if let Some(pb) = pb {
            pb.finish_with_message("指标采集完成");
        }

        Ok(results)
    }

    async fn run_cmd(&self, host: &str, cmd: &str) -> Result<String> {
        let (stdout, stderr, code) = self.cluster.execute_command(host, cmd).await?;
        if code != 0 && !stderr.trim().is_empty() {
            return Err(anyhow::anyhow!("命令执行失败 (exit={}): {}", code, stderr.trim()));
        }
        Ok(stdout)
    }

    async fn collect_cpu(&self, host: &str) -> Result<CpuMetrics> {
        let stdout = self.run_cmd(host, "cat /proc/stat | head -1").await?;
        let parts: Vec<&str> = stdout.trim().split_whitespace().collect();
        if parts.len() < 8 || parts[0] != "cpu" {
            return Err(anyhow::anyhow!("无法解析 /proc/stat: 格式不正确"));
        }

        let user: f64 = parts[1].parse().unwrap_or(0.0);
        let nice: f64 = parts[2].parse().unwrap_or(0.0);
        let system: f64 = parts[3].parse().unwrap_or(0.0);
        let idle: f64 = parts[4].parse().unwrap_or(0.0);
        let iowait: f64 = parts[5].parse().unwrap_or(0.0);
        let irq: f64 = parts[6].parse().unwrap_or(0.0);
        let softirq: f64 = parts[7].parse().unwrap_or(0.0);

        let total = user + nice + system + idle + iowait + irq + softirq;
        let usage_percent = if total > 0.0 { ((total - idle) / total) * 100.0 } else { 0.0 };

        let cpuinfo = self.run_cmd(host, "grep 'model name' /proc/cpuinfo | head -1").await
            .unwrap_or_default();
        let model_name = cpuinfo.split(':').nth(1).unwrap_or("Unknown").trim().to_string();

        let core_out = self.run_cmd(host, "nproc").await.unwrap_or_default();
        let cores: u32 = core_out.trim().parse().unwrap_or(0);

        let loadavg = self.run_cmd(host, "cat /proc/loadavg").await.unwrap_or_default();
        let load_parts: Vec<&str> = loadavg.trim().split_whitespace().collect();
        let load_1min: f64 = load_parts.get(0).and_then(|s| s.parse().ok()).unwrap_or(0.0);
        let load_5min: f64 = load_parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0.0);
        let load_15min: f64 = load_parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(0.0);

        Ok(CpuMetrics {
            model_name,
            cores,
            usage_percent,
            user_percent: if total > 0.0 { (user / total) * 100.0 } else { 0.0 },
            system_percent: if total > 0.0 { (system / total) * 100.0 } else { 0.0 },
            iowait_percent: if total > 0.0 { (iowait / total) * 100.0 } else { 0.0 },
            idle_percent: if total > 0.0 { (idle / total) * 100.0 } else { 0.0 },
            load_1min,
            load_5min,
            load_15min,
        })
    }

    async fn collect_memory(&self, host: &str) -> Result<MemoryMetrics> {
        let stdout = self.run_cmd(host, "cat /proc/meminfo").await?;
        let mut mem_info = HashMap::new();

        for line in stdout.lines() {
            let parts: Vec<&str> = line.split(':').collect();
            if parts.len() == 2 {
                let key = parts[0].trim().to_string();
                let value: f64 = parts[1].trim().split_whitespace().next()
                    .and_then(|s| s.parse().ok()).unwrap_or(0.0);
                mem_info.insert(key, value);
            }
        }

        let total_kb = *mem_info.get("MemTotal").unwrap_or(&0.0);
        let free_kb = *mem_info.get("MemFree").unwrap_or(&0.0);
        let available_kb = *mem_info.get("MemAvailable").unwrap_or(&free_kb);
        let buffers_kb = *mem_info.get("Buffers").unwrap_or(&0.0);
        let cached_kb = *mem_info.get("Cached").unwrap_or(&0.0);
        let swap_total_kb = *mem_info.get("SwapTotal").unwrap_or(&0.0);
        let swap_free_kb = *mem_info.get("SwapFree").unwrap_or(&0.0);

        if total_kb == 0.0 {
            return Err(anyhow::anyhow!("无法获取内存信息"));
        }

        let used_kb = total_kb - available_kb;
        let usage_percent = (used_kb / total_kb) * 100.0;
        let swap_usage_percent = if swap_total_kb > 0.0 {
            ((swap_total_kb - swap_free_kb) / swap_total_kb) * 100.0
        } else {
            0.0
        };

        Ok(MemoryMetrics {
            total_mb: total_kb / 1024.0,
            used_mb: used_kb / 1024.0,
            free_mb: free_kb / 1024.0,
            available_mb: available_kb / 1024.0,
            buffers_mb: buffers_kb / 1024.0,
            cached_mb: cached_kb / 1024.0,
            usage_percent,
            swap_total_mb: swap_total_kb / 1024.0,
            swap_used_mb: (swap_total_kb - swap_free_kb) / 1024.0,
            swap_free_mb: swap_free_kb / 1024.0,
            swap_usage_percent,
        })
    }

    async fn collect_disk(&self, host: &str) -> Result<Vec<DiskMetrics>> {
        let stdout = self.run_cmd(host, "df -kPT 2>/dev/null | tail -n +2").await?;
        let mut disks = Vec::new();

        for line in stdout.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 7 {
                let filesystem = parts[0].to_string();
                let fstype = parts[1].to_string();
                let total_kb: f64 = parts[2].parse().unwrap_or(0.0);
                let used_kb: f64 = parts[3].parse().unwrap_or(0.0);
                let available_kb: f64 = parts[4].parse().unwrap_or(0.0);
                let use_pct_str = parts[5].trim_end_matches('%');
                let use_pct: f64 = use_pct_str.parse().unwrap_or(
                    if total_kb > 0.0 { (used_kb / total_kb) * 100.0 } else { 0.0 }
                );
                let mount_point = parts[6].to_string();

                if fstype == "tmpfs" || fstype == "devtmpfs" || fstype.starts_with("loop") {
                    continue;
                }

                disks.push(DiskMetrics {
                    filesystem,
                    fstype,
                    mount_point,
                    total_gb: total_kb / 1024.0 / 1024.0,
                    used_gb: used_kb / 1024.0 / 1024.0,
                    available_gb: available_kb / 1024.0 / 1024.0,
                    usage_percent: use_pct,
                });
            }
        }

        if disks.is_empty() {
            return Err(anyhow::anyhow!("未获取到磁盘信息"));
        }

        Ok(disks)
    }

    async fn collect_process(&self, host: &str) -> Result<Vec<ProcessMetrics>> {
        let stdout = self.run_cmd(host, "ps aux --no-headers 2>/dev/null | head -50").await?;
        let mut processes = Vec::new();

        for line in stdout.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 11 {
                let user = parts[0].to_string();
                let pid: u32 = parts[1].parse().unwrap_or(0);
                let cpu_percent: f64 = parts[2].parse().unwrap_or(0.0);
                let mem_percent: f64 = parts[3].parse().unwrap_or(0.0);
                let vsz_kb: f64 = parts[4].parse().unwrap_or(0.0);
                let rss_kb: f64 = parts[5].parse().unwrap_or(0.0);
                let state = parts[7].to_string();
                let start = parts[8].to_string();
                let time = parts[9].to_string();
                let command = parts[10..].join(" ");

                processes.push(ProcessMetrics {
                    pid,
                    user,
                    cpu_percent,
                    mem_percent,
                    vsz_mb: vsz_kb / 1024.0,
                    rss_mb: rss_kb / 1024.0,
                    state,
                    start,
                    time,
                    command,
                });
            }
        }

        Ok(processes)
    }

    async fn collect_system(&self, host: &str) -> Result<SystemMetrics> {
        let hostname = self.run_cmd(host, "hostname").await.unwrap_or_default();
        let uname = self.run_cmd(host, "uname -r").await.unwrap_or_default();
        let distro = self.run_cmd(host,
            "grep 'PRETTY_NAME' /etc/os-release 2>/dev/null | cut -d'=' -f2 | tr -d '\"'"
        ).await.unwrap_or_default();
        let uptime_out = self.run_cmd(host, "cat /proc/uptime").await.unwrap_or_default();
        let tcp_out = self.run_cmd(host, "ss -t 2>/dev/null | tail -n +2 | wc -l").await.unwrap_or_default();
        let files_out = self.run_cmd(host, "cat /proc/sys/fs/file-nr 2>/dev/null | awk '{print $1}'").await.unwrap_or_default();

        let uptime_seconds: f64 = uptime_out.trim().split_whitespace().next()
            .and_then(|s| s.parse().ok()).unwrap_or(0.0);
        let uptime_days = (uptime_seconds / 86400.0) as u64;
        let uptime_hours = ((uptime_seconds % 86400.0) / 3600.0) as u32;
        let uptime_minutes = ((uptime_seconds % 3600.0) / 60.0) as u32;

        Ok(SystemMetrics {
            hostname: hostname.trim().to_string(),
            kernel_version: uname.trim().to_string(),
            os_version: distro.trim().to_string(),
            uptime_seconds,
            uptime_formatted: format!("{}天 {}小时 {}分钟", uptime_days, uptime_hours, uptime_minutes),
            tcp_connections: tcp_out.trim().parse().unwrap_or(0),
            open_files: files_out.trim().parse().unwrap_or(0),
        })
    }
}
