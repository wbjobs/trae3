use anyhow::Result;
use colored::*;
use rayon::prelude::*;
use std::collections::HashMap;

use crate::modules::config::{Gateway, GatewayConfig, Rule};
use crate::modules::remote::{batch_exec, BatchOptions, CommandResult};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GatewayMetrics {
    pub gateway_id: String,
    pub host: String,
    pub reachable: bool,
    pub error: Option<String>,
    pub cpu_usage: f64,
    pub mem_usage: f64,
    pub mem_total_mb: f64,
    pub mem_used_mb: f64,
    pub disk_usage: f64,
    pub disk_total_gb: f64,
    pub disk_used_gb: f64,
    pub uptime_secs: u64,
    pub uptime_human: String,
    pub load_avg_1m: f64,
    pub load_avg_5m: f64,
    pub load_avg_15m: f64,
    pub net_rx_bytes: u64,
    pub net_tx_bytes: u64,
    pub net_interface: String,
    pub process_count: u32,
    pub temperature: Option<f64>,
    pub kernel_version: String,
    pub custom_metrics: HashMap<String, String>,
    pub elapsed_ms: u64,
    pub retries: u32,
}

#[derive(Debug, Clone)]
pub struct HighlightThresholds {
    pub cpu_warn: f64,
    pub cpu_critical: f64,
    pub mem_warn: f64,
    pub mem_critical: f64,
    pub disk_warn: f64,
    pub disk_critical: f64,
    pub load_warn: f64,
    pub load_critical: f64,
}

impl Default for HighlightThresholds {
    fn default() -> Self {
        HighlightThresholds {
            cpu_warn: 70.0,
            cpu_critical: 90.0,
            mem_warn: 70.0,
            mem_critical: 85.0,
            disk_warn: 80.0,
            disk_critical: 90.0,
            load_warn: 2.0,
            load_critical: 4.0,
        }
    }
}

impl HighlightThresholds {
    pub fn from_rules(rules: &[Rule]) -> Self {
        let mut t = Self::default();
        for rule in rules {
            match rule.metric.as_str() {
                "cpu_usage" => {
                    if t.cpu_critical == 90.0 {
                        t.cpu_critical = rule.threshold;
                        t.cpu_warn = rule.threshold * 0.8;
                    }
                }
                "mem_usage" => {
                    if t.mem_critical == 85.0 {
                        t.mem_critical = rule.threshold;
                        t.mem_warn = rule.threshold * 0.85;
                    }
                }
                "disk_usage" => {
                    if t.disk_critical == 90.0 {
                        t.disk_critical = rule.threshold;
                        t.disk_warn = rule.threshold * 0.9;
                    }
                }
                "load_avg_1m" => {
                    if t.load_critical == 4.0 {
                        t.load_critical = rule.threshold;
                        t.load_warn = rule.threshold * 0.6;
                    }
                }
                _ => {}
            }
        }
        t
    }
}

const METRICS_SCRIPT: &str = r#"
PATH=/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin
CPU_USAGE=$(grep 'cpu ' /proc/stat | awk '{usage=($2+$4)*100/($2+$4+$5)} END {printf "%.1f", usage}')
if [ -z "$CPU_USAGE" ] || [ "$CPU_USAGE" = "0.0" ]; then
  CPU_USAGE=$(top -bn1 2>/dev/null | grep -i "cpu" | head -1 | awk '{print $2}' | awk -F'.' '{print $1}')
fi
[ -z "$CPU_USAGE" ] && CPU_USAGE=0

MEM_INFO=$(cat /proc/meminfo 2>/dev/null)
MEM_TOTAL_KB=$(echo "$MEM_INFO" | grep MemTotal | awk '{print $2}')
MEM_AVAILABLE_KB=$(echo "$MEM_INFO" | grep MemAvailable | awk '{print $2}')
if [ -z "$MEM_AVAILABLE_KB" ]; then
  MEM_FREE_KB=$(echo "$MEM_INFO" | grep MemFree | awk '{print $2}')
  MEM_BUFFERS_KB=$(echo "$MEM_INFO" | grep Buffers | awk '{print $2}')
  MEM_CACHED_KB=$(echo "$MEM_INFO" | grep "^Cached" | awk '{print $2}')
  MEM_USED_KB=$((MEM_TOTAL_KB - MEM_FREE_KB - MEM_BUFFERS_KB - MEM_CACHED_KB))
else
  MEM_USED_KB=$((MEM_TOTAL_KB - MEM_AVAILABLE_KB))
fi
MEM_TOTAL_MB=$((MEM_TOTAL_KB / 1024))
MEM_USED_MB=$((MEM_USED_KB / 1024))
if [ "$MEM_TOTAL_KB" -gt 0 ]; then
  MEM_USAGE=$((MEM_USED_KB * 100 / MEM_TOTAL_KB))
else
  MEM_USAGE=0
fi

DISK_INFO=$(df -k / 2>/dev/null | awk 'NR==2{print $2,$3,$5}')
DISK_TOTAL_KB=$(echo $DISK_INFO | awk '{print $1}')
DISK_USED_KB=$(echo $DISK_INFO | awk '{print $2}')
DISK_USAGE_PCT=$(echo $DISK_INFO | awk '{print $3}' | tr -d '%')
if [ -z "$DISK_TOTAL_KB" ]; then
  DISK_INFO=$(df -k / 2>/dev/null | tail -1 | awk '{print $2,$3,$5}')
  DISK_TOTAL_KB=$(echo $DISK_INFO | awk '{print $1}')
  DISK_USED_KB=$(echo $DISK_INFO | awk '{print $2}')
  DISK_USAGE_PCT=$(echo $DISK_INFO | awk '{print $3}' | tr -d '%')
fi
DISK_TOTAL_GB=$(awk "BEGIN{printf \"%.1f\", $DISK_TOTAL_KB/1024/1024}")
DISK_USED_GB=$(awk "BEGIN{printf \"%.1f\", $DISK_USED_KB/1024/1024}")
[ -z "$DISK_USAGE_PCT" ] && DISK_USAGE_PCT=0

UPTIME_SECS=$(awk '{printf "%d", $1}' /proc/uptime 2>/dev/null)
UPTIME_DAYS=$((UPTIME_SECS / 86400))
UPTIME_HOURS=$(( (UPTIME_SECS % 86400) / 3600 ))
UPTIME_MINS=$(( (UPTIME_SECS % 3600) / 60 ))
UPTIME_HUMAN="${UPTIME_DAYS}d${UPTIME_HOURS}h${UPTIME_MINS}m"

LOAD_RAW=$(cat /proc/loadavg 2>/dev/null)
LOAD_1M=$(echo $LOAD_RAW | awk '{print $1}')
LOAD_5M=$(echo $LOAD_RAW | awk '{print $2}')
LOAD_15M=$(echo $LOAD_RAW | awk '{print $3}')

NET_IFACE=$(ip route show default 2>/dev/null | awk '{print $5}' | head -1)
[ -z "$NET_IFACE" ] && NET_IFACE=$(ls /sys/class/net/ 2>/dev/null | grep -v lo | head -1)
if [ -n "$NET_IFACE" ]; then
  NET_RX=$(cat /sys/class/net/$NET_IFACE/statistics/rx_bytes 2>/dev/null)
  NET_TX=$(cat /sys/class/net/$NET_IFACE/statistics/tx_bytes 2>/dev/null)
else
  NET_RX=0
  NET_TX=0
fi
[ -z "$NET_RX" ] && NET_RX=0
[ -z "$NET_TX" ] && NET_TX=0

PROC_COUNT=$(ls /proc 2>/dev/null | grep -c '^[0-9]*$' || echo 0)
TEMP=$(cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null)
if [ -n "$TEMP" ]; then
  TEMP_C=$(awk "BEGIN{printf \"%.1f\", $TEMP/1000}")
else
  TEMP_C=""
fi
KERNEL=$(uname -r 2>/dev/null || echo "unknown")

echo "CPU_USAGE=$CPU_USAGE"
echo "MEM_TOTAL_MB=$MEM_TOTAL_MB"
echo "MEM_USED_MB=$MEM_USED_MB"
echo "MEM_USAGE=$MEM_USAGE"
echo "DISK_TOTAL_GB=$DISK_TOTAL_GB"
echo "DISK_USED_GB=$DISK_USED_GB"
echo "DISK_USAGE=$DISK_USAGE_PCT"
echo "UPTIME=$UPTIME_SECS"
echo "UPTIME_HUMAN=$UPTIME_HUMAN"
echo "LOAD_1M=$LOAD_1M"
echo "LOAD_5M=$LOAD_5M"
echo "LOAD_15M=$LOAD_15M"
echo "NET_IFACE=$NET_IFACE"
echo "NET_RX=$NET_RX"
echo "NET_TX=$NET_TX"
echo "PROC_COUNT=$PROC_COUNT"
echo "TEMP=$TEMP_C"
echo "KERNEL=$KERNEL"
"#;

impl GatewayMetrics {
    pub fn from_command_result(result: &CommandResult) -> Result<Self> {
        if !result.success {
            return Ok(GatewayMetrics {
                gateway_id: result.gateway_id.clone(),
                host: result.host.clone(),
                reachable: false,
                error: Some(if result.timed_out {
                    "连接超时".into()
                } else {
                    format!("SSH 执行失败(exit={}): {}", result.exit_code, result.stderr.trim())
                }),
                cpu_usage: 0.0,
                mem_usage: 0.0,
                mem_total_mb: 0.0,
                mem_used_mb: 0.0,
                disk_usage: 0.0,
                disk_total_gb: 0.0,
                disk_used_gb: 0.0,
                uptime_secs: 0,
                uptime_human: "-".into(),
                load_avg_1m: 0.0,
                load_avg_5m: 0.0,
                load_avg_15m: 0.0,
                net_rx_bytes: 0,
                net_tx_bytes: 0,
                net_interface: "-".into(),
                process_count: 0,
                temperature: None,
                kernel_version: "-".into(),
                custom_metrics: HashMap::new(),
                elapsed_ms: result.elapsed_ms,
                retries: result.retries,
            });
        }

        let mut metrics = GatewayMetrics {
            gateway_id: result.gateway_id.clone(),
            host: result.host.clone(),
            reachable: true,
            error: None,
            cpu_usage: 0.0,
            mem_usage: 0.0,
            mem_total_mb: 0.0,
            mem_used_mb: 0.0,
            disk_usage: 0.0,
            disk_total_gb: 0.0,
            disk_used_gb: 0.0,
            uptime_secs: 0,
            uptime_human: "-".into(),
            load_avg_1m: 0.0,
            load_avg_5m: 0.0,
            load_avg_15m: 0.0,
            net_rx_bytes: 0,
            net_tx_bytes: 0,
            net_interface: "-".into(),
            process_count: 0,
            temperature: None,
            kernel_version: "-".into(),
            custom_metrics: HashMap::new(),
            elapsed_ms: result.elapsed_ms,
            retries: result.retries,
        };

        for line in result.stdout.lines() {
            let line = line.trim();
            if let Some((key, value)) = line.split_once('=') {
                let key = key.trim();
                let value = value.trim();
                if value.is_empty() {
                    continue;
                }
                match key {
                    "CPU_USAGE" => metrics.cpu_usage = value.parse().unwrap_or(0.0),
                    "MEM_TOTAL_MB" => metrics.mem_total_mb = value.parse().unwrap_or(0.0),
                    "MEM_USED_MB" => metrics.mem_used_mb = value.parse().unwrap_or(0.0),
                    "MEM_USAGE" => metrics.mem_usage = value.parse().unwrap_or(0.0),
                    "DISK_TOTAL_GB" => metrics.disk_total_gb = value.parse().unwrap_or(0.0),
                    "DISK_USED_GB" => metrics.disk_used_gb = value.parse().unwrap_or(0.0),
                    "DISK_USAGE" => metrics.disk_usage = value.parse().unwrap_or(0.0),
                    "UPTIME" => metrics.uptime_secs = value.parse().unwrap_or(0),
                    "UPTIME_HUMAN" => metrics.uptime_human = value.to_string(),
                    "LOAD_1M" => metrics.load_avg_1m = value.parse().unwrap_or(0.0),
                    "LOAD_5M" => metrics.load_avg_5m = value.parse().unwrap_or(0.0),
                    "LOAD_15M" => metrics.load_avg_15m = value.parse().unwrap_or(0.0),
                    "NET_IFACE" => metrics.net_interface = value.to_string(),
                    "NET_RX" => metrics.net_rx_bytes = value.parse().unwrap_or(0),
                    "NET_TX" => metrics.net_tx_bytes = value.parse().unwrap_or(0),
                    "PROC_COUNT" => metrics.process_count = value.parse().unwrap_or(0),
                    "TEMP" => {
                        if value != "0.0" {
                            metrics.temperature = value.parse().ok();
                        }
                    }
                    "KERNEL" => metrics.kernel_version = value.to_string(),
                    _ => {
                        metrics.custom_metrics.insert(key.to_string(), value.to_string());
                    }
                }
            }
        }

        Ok(metrics)
    }

    pub fn get_status_flags(&self, thresholds: &HighlightThresholds) -> MetricStatus {
        if !self.reachable {
            return MetricStatus::Critical;
        }

        if self.cpu_usage >= thresholds.cpu_critical
            || self.mem_usage >= thresholds.mem_critical
            || self.disk_usage >= thresholds.disk_critical
            || self.load_avg_1m >= thresholds.load_critical
        {
            return MetricStatus::Critical;
        }

        if self.cpu_usage >= thresholds.cpu_warn
            || self.mem_usage >= thresholds.mem_warn
            || self.disk_usage >= thresholds.disk_warn
            || self.load_avg_1m >= thresholds.load_warn
        {
            return MetricStatus::Warn;
        }

        MetricStatus::Ok
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MetricStatus {
    Ok,
    Warn,
    Critical,
}

pub fn collect_metrics(
    config: &GatewayConfig,
    gateways: &[&Gateway],
    options: &BatchOptions,
) -> Vec<GatewayMetrics> {
    let results = batch_exec(config, gateways, METRICS_SCRIPT, options);
    results
        .par_iter()
        .filter_map(|r| GatewayMetrics::from_command_result(r).ok())
        .collect()
}

pub fn collect_custom_metrics(
    config: &GatewayConfig,
    gateways: &[&Gateway],
    command: &str,
    options: &BatchOptions,
) -> Vec<CommandResult> {
    batch_exec(config, gateways, command, options)
}

pub fn print_metrics_table(metrics_list: &[GatewayMetrics], thresholds: Option<&HighlightThresholds>) {
    let default_th = HighlightThresholds::default();
    let th = match thresholds {
        Some(t) => t,
        None => &default_th,
    };

    println!(
        "{:<10} {:<16} {:>8} {:>8} {:>8} {:>10} {:>10} {:>10} {:>8} {:>8} {}",
        "ID", "主机", "CPU%", "MEM%", "DISK%", "负载1m", "运行", "RX(KB)", "进程", "温度", "状态"
    );
    println!("{}", "─".repeat(112));

    for m in metrics_list {
        let status = m.get_status_flags(th);
        let (status_str, status_color) = match status {
            MetricStatus::Ok => ("OK".to_string(), Color::Green),
            MetricStatus::Warn => ("WARN".to_string(), Color::Yellow),
            MetricStatus::Critical => {
                if !m.reachable {
                    ("UNREACHABLE".to_string(), Color::Red)
                } else {
                    ("ALERT".to_string(), Color::Red)
                }
            }
        };

        let cpu_str = format_value_with_color(m.cpu_usage, th.cpu_warn, th.cpu_critical);
        let mem_str = format_value_with_color(m.mem_usage, th.mem_warn, th.mem_critical);
        let disk_str = format_value_with_color(m.disk_usage, th.disk_warn, th.disk_critical);
        let load_str = format_load_with_color(m.load_avg_1m, th.load_warn, th.load_critical);

        let temp_str = match m.temperature {
            Some(t) => {
                if t > 70.0 {
                    format!("{:.0}C", t).red().to_string()
                } else if t > 60.0 {
                    format!("{:.0}C", t).yellow().to_string()
                } else {
                    format!("{:.0}C", t).green().to_string()
                }
            }
            None => "-".to_string(),
        };

        let uptime = if m.uptime_human != "-" {
            m.uptime_human.clone()
        } else {
            format!("{}s", m.uptime_secs)
        };
        let rx_kb = m.net_rx_bytes / 1024;

        println!(
            "{:<10} {:<16} {} {} {} {} {:>10} {:>10} {:>8} {:>8} {}",
            m.gateway_id,
            m.host,
            cpu_str,
            mem_str,
            disk_str,
            load_str,
            uptime,
            rx_kb,
            m.process_count,
            temp_str,
            status_str.color(status_color).bold(),
        );
    }

    let stats = calculate_metrics_stats(metrics_list);
    println!(
        "\n统计: 总计 {} | 正常 {} | 警告 {} | 严重 {} | 不可达 {} | 平均耗时 {}ms",
        stats.total,
        stats.ok_count.to_string().green(),
        stats.warn_count.to_string().yellow(),
        stats.critical_count.to_string().red(),
        stats.unreachable_count.to_string().red(),
        stats.avg_elapsed_ms,
    );
}

fn format_value_with_color(value: f64, warn: f64, critical: f64) -> String {
    let s = format!("{:>6.1}", value);
    if value >= critical {
        s.red().bold().to_string()
    } else if value >= warn {
        s.yellow().to_string()
    } else {
        s.green().to_string()
    }
}

fn format_load_with_color(value: f64, warn: f64, critical: f64) -> String {
    let s = format!("{:>8.2}", value);
    if value >= critical {
        s.red().bold().to_string()
    } else if value >= warn {
        s.yellow().to_string()
    } else {
        s.green().to_string()
    }
}

pub struct MetricsStats {
    pub total: usize,
    pub ok_count: usize,
    pub warn_count: usize,
    pub critical_count: usize,
    pub unreachable_count: usize,
    pub avg_elapsed_ms: u64,
}

pub fn calculate_metrics_stats(metrics_list: &[GatewayMetrics]) -> MetricsStats {
    let mut ok_count = 0;
    let mut warn_count = 0;
    let mut critical_count = 0;
    let mut unreachable_count = 0;
    let th = HighlightThresholds::default();
    let mut total_elapsed: u64 = 0;

    for m in metrics_list {
        total_elapsed += m.elapsed_ms;
        match m.get_status_flags(&th) {
            MetricStatus::Ok => ok_count += 1,
            MetricStatus::Warn => warn_count += 1,
            MetricStatus::Critical => {
                if !m.reachable {
                    unreachable_count += 1;
                } else {
                    critical_count += 1;
                }
            }
        }
    }

    let avg_elapsed_ms = if !metrics_list.is_empty() {
        total_elapsed / metrics_list.len() as u64
    } else {
        0
    };

    MetricsStats {
        total: metrics_list.len(),
        ok_count,
        warn_count,
        critical_count,
        unreachable_count,
        avg_elapsed_ms,
    }
}

#[allow(dead_code)]
pub fn group_metrics_by_tag(
    metrics_list: &[GatewayMetrics],
    gateways: &[Gateway],
) -> HashMap<String, Vec<GatewayMetrics>> {
    let mut groups: HashMap<String, Vec<GatewayMetrics>> = HashMap::new();

    for m in metrics_list {
        if let Some(gw) = gateways.iter().find(|g| g.id == m.gateway_id) {
            for tag in &gw.tags {
                groups
                    .entry(tag.clone())
                    .or_insert_with(Vec::new)
                    .push(m.clone());
            }
        }
    }

    groups
}
