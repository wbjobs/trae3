use anyhow::{anyhow, Result};
use regex::Regex;

use crate::config::InspectionRule;
use crate::collector::MetricsCollection;
use crate::rules::CheckResult;

pub struct RuleValidator {
    rules: Vec<InspectionRule>,
}

impl RuleValidator {
    pub fn new(rules: Vec<InspectionRule>) -> Self {
        RuleValidator { rules }
    }

    pub fn validate_rules(&self) -> Result<()> {
        for rule in &self.rules {
            if rule.id.is_empty() {
                return Err(anyhow!("规则 ID 不能为空"));
            }
            if rule.name.is_empty() {
                return Err(anyhow!("规则名称不能为空"));
            }
            if rule.metric_type.is_empty() {
                return Err(anyhow!("规则 {} 的 metric_type 不能为空", rule.id));
            }
            if rule.condition.is_empty() {
                return Err(anyhow!("规则 {} 的 condition 不能为空", rule.id));
            }

            if let Err(e) = Self::parse_condition(&rule.condition) {
                return Err(anyhow!("规则 {} 的条件表达式错误: {}", rule.id, e));
            }
        }

        Ok(())
    }

    pub fn validate_all(&self, metrics: &[MetricsCollection]) -> Vec<CheckResult> {
        let mut results = Vec::new();

        for metric in metrics {
            for rule in &self.rules {
                if rule.enabled {
                    let result = self.validate_rule(rule, metric);
                    results.push(result);
                }
            }
        }

        results
    }

    fn validate_rule(&self, rule: &InspectionRule, metrics: &MetricsCollection) -> CheckResult {
        let timestamp = chrono::Utc::now();

        if !metrics.errors.is_empty() {
            return CheckResult {
                rule_id: rule.id.clone(),
                rule_name: rule.name.clone(),
                host: metrics.host.clone(),
                metric_type: rule.metric_type.clone(),
                severity: rule.severity.clone(),
                passed: false,
                actual_value: "N/A".to_string(),
                expected_condition: rule.condition.clone(),
                message: format!("指标采集异常: {}", metrics.errors.join("; ")),
                timestamp,
            };
        }

        let actual_value = Self::get_metric_value(&rule.metric_type, metrics);
        let (passed, message) = Self::evaluate_condition(&rule.condition, &actual_value);

        CheckResult {
            rule_id: rule.id.clone(),
            rule_name: rule.name.clone(),
            host: metrics.host.clone(),
            metric_type: rule.metric_type.clone(),
            severity: rule.severity.clone(),
            passed,
            actual_value: actual_value.clone(),
            expected_condition: rule.condition.clone(),
            message,
            timestamp,
        }
    }

    fn get_metric_value(metric_type: &str, metrics: &MetricsCollection) -> String {
        let parts: Vec<&str> = metric_type.split('.').collect();

        match parts.as_slice() {
            ["cpu", field] => {
                if let Some(cpu) = &metrics.cpu {
                    match *field {
                        "usage" => format!("{:.2}", cpu.usage_percent),
                        "load1" => format!("{:.2}", cpu.load_1min),
                        "load5" => format!("{:.2}", cpu.load_5min),
                        "load15" => format!("{:.2}", cpu.load_15min),
                        "user" => format!("{:.2}", cpu.user_percent),
                        "system" => format!("{:.2}", cpu.system_percent),
                        "idle" => format!("{:.2}", cpu.idle_percent),
                        "iowait" => format!("{:.2}", cpu.iowait_percent),
                        "cores" => format!("{}", cpu.cores),
                        _ => "N/A".to_string(),
                    }
                } else {
                    "N/A".to_string()
                }
            }
            ["memory", field] => {
                if let Some(mem) = &metrics.memory {
                    match *field {
                        "usage" => format!("{:.2}", mem.usage_percent),
                        "total" => format!("{:.2}", mem.total_mb),
                        "used" => format!("{:.2}", mem.used_mb),
                        "available" => format!("{:.2}", mem.available_mb),
                        "swap_usage" => format!("{:.2}", mem.swap_usage_percent),
                        _ => "N/A".to_string(),
                    }
                } else {
                    "N/A".to_string()
                }
            }
            ["disk", "max_usage"] => {
                if let Some(disks) = &metrics.disk {
                    let max_usage = disks.iter().map(|d| d.usage_percent).fold(0.0_f64, f64::max);
                    format!("{:.2}", max_usage)
                } else {
                    "N/A".to_string()
                }
            }
            ["disk", "count"] => {
                if let Some(disks) = &metrics.disk {
                    format!("{}", disks.len())
                } else {
                    "N/A".to_string()
                }
            }
            ["process", field] => {
                match *field {
                    "count" => {
                        if let Some(proc) = &metrics.process {
                            format!("{}", proc.len())
                        } else {
                            "N/A".to_string()
                        }
                    }
                    "high_cpu" => {
                        if let Some(proc) = &metrics.process {
                            let max_cpu = proc.iter().map(|p| p.cpu_percent).fold(0.0_f64, f64::max);
                            format!("{:.2}", max_cpu)
                        } else {
                            "N/A".to_string()
                        }
                    }
                    "high_mem" => {
                        if let Some(proc) = &metrics.process {
                            let max_mem = proc.iter().map(|p| p.mem_percent).fold(0.0_f64, f64::max);
                            format!("{:.2}", max_mem)
                        } else {
                            "N/A".to_string()
                        }
                    }
                    _ => "N/A".to_string(),
                }
            }
            ["system", field] => {
                if let Some(sys) = &metrics.system {
                    match *field {
                        "tcp_conn" => format!("{}", sys.tcp_connections),
                        "open_files" => format!("{}", sys.open_files),
                        "uptime" => format!("{:.0}", sys.uptime_seconds),
                        _ => "N/A".to_string(),
                    }
                } else {
                    "N/A".to_string()
                }
            }
            _ => {
                if metric_type.starts_with("disk.") && metric_type.chars().filter(|c| *c == '.').count() >= 2 {
                    let after_disk = &metric_type[5..];
                    let last_dot = after_disk.rfind('.').unwrap_or(0);
                    if last_dot > 0 {
                        let mount_point = &after_disk[..last_dot];
                        let field = &after_disk[last_dot + 1..];
                        if let Some(disks) = &metrics.disk {
                            if let Some(disk) = disks.iter().find(|d| d.mount_point == mount_point) {
                                match field {
                                    "usage" => return format!("{:.2}", disk.usage_percent),
                                    "total" => return format!("{:.2}", disk.total_gb),
                                    "used" => return format!("{:.2}", disk.used_gb),
                                    "available" => return format!("{:.2}", disk.available_gb),
                                    _ => return "N/A".to_string(),
                                }
                            }
                        }
                    }
                }
                "N/A".to_string()
            }
        }
    }

    fn parse_condition(condition: &str) -> Result<()> {
        let re_cmp = Regex::new(r"^\s*([\w\.\/]+)\s*(>=|<=|>|<|==|!=)\s*([\d\.]+)\s*$")?;
        let re_between = Regex::new(r"^\s*([\w\.\/]+)\s+between\s+([\d\.]+)\s+and\s+([\d\.]+)\s*$")?;

        if re_cmp.is_match(condition) || re_between.is_match(condition) {
            Ok(())
        } else {
            Err(anyhow!("不支持的条件格式: {}", condition))
        }
    }

    fn evaluate_condition(condition: &str, actual_value: &str) -> (bool, String) {
        if actual_value == "N/A" {
            return (false, "指标数据不可用".to_string());
        }

        let actual: f64 = match actual_value.parse() {
            Ok(v) => v,
            Err(_) => return (false, format!("无法解析指标值: {}", actual_value)),
        };

        let re_cmp = Regex::new(r"^\s*([\w\.\/]+)\s*(>=|<=|>|<|==|!=)\s*([\d\.]+)\s*$").unwrap();
        let re_between = Regex::new(r"^\s*([\w\.\/]+)\s+between\s+([\d\.]+)\s+and\s+([\d\.]+)\s*$").unwrap();

        if let Some(caps) = re_cmp.captures(condition) {
            let op = caps.get(2).unwrap().as_str();
            let expected: f64 = caps.get(3).unwrap().as_str().parse().unwrap_or(0.0);

            let passed = match op {
                ">=" => actual >= expected,
                "<=" => actual <= expected,
                ">" => actual > expected,
                "<" => actual < expected,
                "==" => (actual - expected).abs() < 0.01,
                "!=" => (actual - expected).abs() >= 0.01,
                _ => false,
            };

            let message = if passed {
                format!("通过: {:.2} {} {}", actual, op, expected)
            } else {
                format!("失败: {:.2} {} {}", actual, op, expected)
            };

            return (passed, message);
        }

        if let Some(caps) = re_between.captures(condition) {
            let min: f64 = caps.get(2).unwrap().as_str().parse().unwrap_or(0.0);
            let max: f64 = caps.get(3).unwrap().as_str().parse().unwrap_or(0.0);

            let passed = actual >= min && actual <= max;
            let message = if passed {
                format!("通过: {:.2} 在 [{}, {}] 范围内", actual, min, max)
            } else {
                format!("失败: {:.2} 不在 [{}, {}] 范围内", actual, min, max)
            };

            return (passed, message);
        }

        (false, format!("无法解析条件: {}", condition))
    }

    pub fn get_rules(&self) -> &[InspectionRule] {
        &self.rules
    }

    pub fn get_enabled_rules(&self) -> Vec<&InspectionRule> {
        self.rules.iter().filter(|r| r.enabled).collect()
    }
}
