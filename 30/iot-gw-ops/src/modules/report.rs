use anyhow::Result;
use chrono::Local;
use std::fs;
use std::path::Path;

use crate::modules::metrics::GatewayMetrics;
use crate::modules::validator::ValidationResult;

#[derive(Debug, Clone, serde::Serialize)]
pub struct OpsReport {
    pub title: String,
    pub generated_at: String,
    pub summary: ReportSummary,
    pub metrics: Vec<GatewayMetrics>,
    pub validation: ValidationResult,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ReportSummary {
    pub total_gateways: usize,
    pub reachable_gateways: usize,
    pub unreachable_gateways: usize,
    pub healthy_gateways: usize,
    pub unhealthy_gateways: usize,
    pub total_violations: usize,
    pub critical_count: usize,
    pub error_count: usize,
    pub warn_count: usize,
}

impl OpsReport {
    pub fn new(metrics: Vec<GatewayMetrics>, validation: ValidationResult) -> Self {
        let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

        OpsReport {
            title: format!("物联网网关运维报告 - {}", now),
            generated_at: now,
            summary: ReportSummary {
                total_gateways: validation.total_gateways,
                reachable_gateways: validation.reachable_gateways,
                unreachable_gateways: validation.unreachable_gateways,
                healthy_gateways: validation.passed_count,
                unhealthy_gateways: validation.failed_count,
                total_violations: validation.violations.len(),
                critical_count: validation.critical_count(),
                error_count: validation.error_count(),
                warn_count: validation.warn_count(),
            },
            metrics,
            validation,
        }
    }

    pub fn to_json(&self) -> Result<String> {
        Ok(serde_json::to_string_pretty(self)?)
    }

    pub fn to_yaml(&self) -> Result<String> {
        Ok(serde_yaml::to_string(self)?)
    }

    pub fn to_text(&self) -> String {
        let sep = "═".repeat(70);
        let sep2 = "─".repeat(70);
        let mut text = String::new();

        text.push_str(&format!("{}\n", self.title));
        text.push_str(&format!("{}\n\n", sep));

        text.push_str("一、概要统计\n");
        text.push_str(&format!("{}\n", sep2));
        text.push_str(&format!("  网关总数:       {}\n", self.summary.total_gateways));
        text.push_str(&format!("  可达网关:       {}\n", self.summary.reachable_gateways));
        text.push_str(&format!("  不可达网关:     {}\n", self.summary.unreachable_gateways));
        text.push_str(&format!("  健康网关:       {}\n", self.summary.healthy_gateways));
        text.push_str(&format!("  异常网关:       {}\n", self.summary.unhealthy_gateways));
        text.push_str(&format!("  违规总数:       {}\n", self.summary.total_violations));
        text.push_str(&format!("  Critical:       {}\n", self.summary.critical_count));
        text.push_str(&format!("  Error:          {}\n", self.summary.error_count));
        text.push_str(&format!("  Warn:           {}\n", self.summary.warn_count));
        text.push_str("\n");

        text.push_str("二、各网关指标\n");
        text.push_str(&format!("{}\n", sep2));
        text.push_str(&format!(
            "{:<10} {:<16} {:>6} {:>6} {:>6} {:>8} {:>10} {:>10} {:>6} {:>6} {}\n",
            "ID", "主机", "CPU%", "MEM%", "DISK%", "负载1m", "运行", "RX(KB)", "进程", "温度", "状态"
        ));
        text.push_str(&format!("{}\n", sep2));
        for m in &self.metrics {
            let status = if m.reachable { "OK" } else { "FAIL" };
            let temp_str = match m.temperature {
                Some(t) => format!("{:.0}C", t),
                None => "-".to_string(),
            };
            let uptime = if m.uptime_human != "-" {
                m.uptime_human.clone()
            } else {
                format!("{}s", m.uptime_secs)
            };
            let rx_kb = m.net_rx_bytes / 1024;
            text.push_str(&format!(
                "{:<10} {:<16} {:>5.1} {:>5.1} {:>5.1} {:>8.2} {:>10} {:>10} {:>6} {:>6} {}\n",
                m.gateway_id,
                m.host,
                m.cpu_usage,
                m.mem_usage,
                m.disk_usage,
                m.load_avg_1m,
                uptime,
                rx_kb,
                m.process_count,
                temp_str,
                status,
            ));
        }
        text.push_str("\n");

        if !self.validation.violations.is_empty() {
            text.push_str("三、异常详情\n");
            text.push_str(&format!("{}\n", sep2));
            for v in &self.validation.violations {
                let sev = match &v.severity {
                    crate::modules::config::Severity::Critical => "CRITICAL",
                    crate::modules::config::Severity::Error => "ERROR",
                    crate::modules::config::Severity::Warn => "WARN",
                    crate::modules::config::Severity::Info => "INFO",
                };
                let value_str = if v.metric == "connectivity" {
                    "-".to_string()
                } else {
                    format!("{:.1}", v.value)
                };
                let threshold_str = if v.metric == "connectivity" {
                    "-".to_string()
                } else {
                    format!("{:.1}", v.threshold)
                };
                text.push_str(&format!(
                    "  [{}] {} ({}) | {} | {} {} {} | {}\n",
                    sev,
                    v.gateway_id,
                    v.host,
                    v.rule_name,
                    value_str,
                    v.operator,
                    threshold_str,
                    v.message,
                ));
            }
        }

        text.push_str(&format!("\n{}\n", sep));
        text.push_str(&format!("报告生成时间: {}\n", self.generated_at));

        text
    }

    pub fn save_to_file(&self, path: &Path) -> Result<()> {
        let ext = path.extension()
            .and_then(|e| e.to_str())
            .unwrap_or("txt");

        let content = match ext {
            "json" => self.to_json()?,
            "yaml" | "yml" => self.to_yaml()?,
            _ => self.to_text(),
        };

        fs::write(path, content)?;
        Ok(())
    }
}
