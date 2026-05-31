use colored::*;

use crate::modules::config::{Rule, RuleOperator, Severity};
use crate::modules::metrics::GatewayMetrics;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Violation {
    pub gateway_id: String,
    pub host: String,
    pub rule_name: String,
    pub metric: String,
    pub value: f64,
    pub threshold: f64,
    pub operator: String,
    pub severity: Severity,
    pub message: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ValidationResult {
    pub total_gateways: usize,
    pub reachable_gateways: usize,
    pub unreachable_gateways: usize,
    pub total_rules: usize,
    pub violations: Vec<Violation>,
    pub passed_count: usize,
    pub failed_count: usize,
}

impl ValidationResult {
    pub fn is_healthy(&self) -> bool {
        self.violations.is_empty() && self.unreachable_gateways == 0
    }

    pub fn critical_count(&self) -> usize {
        self.violations
            .iter()
            .filter(|v| v.severity == Severity::Critical)
            .count()
    }

    pub fn error_count(&self) -> usize {
        self.violations
            .iter()
            .filter(|v| v.severity == Severity::Error)
            .count()
    }

    pub fn warn_count(&self) -> usize {
        self.violations
            .iter()
            .filter(|v| v.severity == Severity::Warn)
            .count()
    }

    pub fn info_count(&self) -> usize {
        self.violations
            .iter()
            .filter(|v| v.severity == Severity::Info)
            .count()
    }
}

fn get_metric_value(metrics: &GatewayMetrics, metric_name: &str) -> Option<f64> {
    if !metrics.reachable {
        return None;
    }
    match metric_name {
        "cpu_usage" => Some(metrics.cpu_usage),
        "mem_usage" => Some(metrics.mem_usage),
        "mem_total_mb" => Some(metrics.mem_total_mb),
        "mem_used_mb" => Some(metrics.mem_used_mb),
        "disk_usage" => Some(metrics.disk_usage),
        "disk_total_gb" => Some(metrics.disk_total_gb),
        "disk_used_gb" => Some(metrics.disk_used_gb),
        "uptime_secs" => Some(metrics.uptime_secs as f64),
        "load_avg_1m" => Some(metrics.load_avg_1m),
        "load_avg_5m" => Some(metrics.load_avg_5m),
        "load_avg_15m" => Some(metrics.load_avg_15m),
        "net_rx_bytes" => Some(metrics.net_rx_bytes as f64),
        "net_tx_bytes" => Some(metrics.net_tx_bytes as f64),
        "process_count" => Some(metrics.process_count as f64),
        "temperature" => metrics.temperature,
        _ => metrics
            .custom_metrics
            .get(metric_name)
            .and_then(|v| v.parse().ok()),
    }
}

fn operator_to_string(op: &RuleOperator) -> String {
    match op {
        RuleOperator::Gt => ">".into(),
        RuleOperator::Lt => "<".into(),
        RuleOperator::Gte => ">=".into(),
        RuleOperator::Lte => "<=".into(),
        RuleOperator::Eq => "==".into(),
        RuleOperator::Neq => "!=".into(),
    }
}

pub fn validate(
    metrics_list: &[GatewayMetrics],
    rules: &[Rule],
) -> ValidationResult {
    let mut violations = Vec::new();

    let total_gateways = metrics_list.len();
    let reachable_count = metrics_list.iter().filter(|m| m.reachable).count();
    let unreachable_count = total_gateways - reachable_count;

    let mut failed_ids = std::collections::HashSet::new();

    for metrics in metrics_list {
        if !metrics.reachable {
            failed_ids.insert(metrics.gateway_id.clone());
            violations.push(Violation {
                gateway_id: metrics.gateway_id.clone(),
                host: metrics.host.clone(),
                rule_name: "网关不可达".into(),
                metric: "connectivity".into(),
                value: 0.0,
                threshold: 1.0,
                operator: "!=".into(),
                severity: Severity::Critical,
                message: metrics.error.clone().unwrap_or_else(|| "连接失败".into()),
            });
            continue;
        }

        for rule in rules {
            if let Some(value) = get_metric_value(metrics, &rule.metric) {
                if rule.operator.evaluate(value, rule.threshold) {
                    failed_ids.insert(metrics.gateway_id.clone());
                    violations.push(Violation {
                        gateway_id: metrics.gateway_id.clone(),
                        host: metrics.host.clone(),
                        rule_name: rule.name.clone(),
                        metric: rule.metric.clone(),
                        value,
                        threshold: rule.threshold,
                        operator: operator_to_string(&rule.operator),
                        severity: rule.severity.clone(),
                        message: rule.message.clone(),
                    });
                }
            }
        }
    }

    let passed_count = reachable_count - failed_ids.len() + unreachable_count;
    let failed_count = failed_ids.len();

    ValidationResult {
        total_gateways,
        reachable_gateways: reachable_count,
        unreachable_gateways: unreachable_count,
        total_rules: rules.len(),
        violations,
        passed_count,
        failed_count,
    }
}

pub fn print_validation_result(result: &ValidationResult) {
    println!("\n{}", "═══ 运维规则校验结果 ═══".bold().cyan());
    println!(
        "网关总数: {} | 可达: {} | 不可达: {} | 规则: {} | 通过: {} | 异常: {}",
        result.total_gateways,
        result.reachable_gateways.to_string().green(),
        if result.unreachable_gateways > 0 {
            result.unreachable_gateways.to_string().red()
        } else {
            result.unreachable_gateways.to_string().green()
        },
        result.total_rules,
        result.passed_count.to_string().green(),
        result.failed_count.to_string().red(),
    );

    if result.is_healthy() {
        println!("\n{}", "✓ 所有网关均通过校验，无异常！".green().bold());
        return;
    }

    println!(
        "\n异常统计: Critical={} Error={} Warn={} Info={}",
        result.critical_count().to_string().red().bold(),
        result.error_count().to_string().red(),
        result.warn_count().to_string().yellow(),
        result.info_count().to_string().blue(),
    );

    println!(
        "\n{:<10} {:<16} {:<14} {:<10} {:>10} {:>10} {:>6} {}",
        "ID", "主机", "规则", "严重级别", "指标值", "阈值", "比较", "说明"
    );
    println!("{}", "─".repeat(100));

    for v in &result.violations {
        let severity_str = match &v.severity {
            Severity::Critical => "CRITICAL".red().bold().to_string(),
            Severity::Error => "ERROR".red().to_string(),
            Severity::Warn => "WARN".yellow().to_string(),
            Severity::Info => "INFO".blue().to_string(),
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
        println!(
            "{:<10} {:<16} {:<14} {:<10} {:>10} {:>10} {:>6} {}",
            v.gateway_id,
            v.host,
            v.rule_name,
            severity_str,
            value_str,
            threshold_str,
            v.operator,
            v.message,
        );
    }
}
