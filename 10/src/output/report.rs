use anyhow::{anyhow, Result, Context};
use chrono::Utc;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

use crate::cluster::ConnectionResult;
use crate::collector::MetricsCollection;
use crate::config::Severity;
use crate::output::{CsvRow, InspectionReport, OutputFormat, ReportSummary};
use crate::rules::CheckResult;

pub struct ReportGenerator;

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
     .replace('<', "&lt;")
     .replace('>', "&gt;")
     .replace('"', "&quot;")
}

impl ReportGenerator {
    pub fn new() -> Self {
        ReportGenerator
    }

    pub fn generate(
        &self,
        connections: Vec<ConnectionResult>,
        metrics: Vec<MetricsCollection>,
        check_results: Vec<CheckResult>,
    ) -> InspectionReport {
        let total_servers = connections.len();
        let online_servers = connections.iter().filter(|c| c.success).count();
        let offline_servers = total_servers - online_servers;
        let online_rate = if total_servers > 0 {
            (online_servers as f64 / total_servers as f64) * 100.0
        } else {
            0.0
        };

        let total_checks = check_results.len();
        let passed_checks = check_results.iter().filter(|c| c.passed).count();
        let failed_checks = total_checks - passed_checks;
        let pass_rate = if total_checks > 0 {
            (passed_checks as f64 / total_checks as f64) * 100.0
        } else {
            0.0
        };

        let critical_issues = check_results
            .iter()
            .filter(|c| !c.passed && c.severity == Severity::Critical)
            .count();
        let warning_issues = check_results
            .iter()
            .filter(|c| !c.passed && c.severity == Severity::Warning)
            .count();
        let info_issues = check_results
            .iter()
            .filter(|c| !c.passed && c.severity == Severity::Info)
            .count();

        let start_time = metrics.first().map(|m| m.timestamp).unwrap_or_else(|| Utc::now());
        let end_time = Utc::now();
        let duration_ms = (end_time - start_time).num_milliseconds().max(0) as u64;

        let summary = ReportSummary {
            total_servers,
            online_servers,
            offline_servers,
            online_rate,
            total_checks,
            passed_checks,
            failed_checks,
            pass_rate,
            critical_issues,
            warning_issues,
            info_issues,
            duration_ms,
        };

        InspectionReport {
            report_id: Uuid::new_v4().to_string(),
            generated_at: Utc::now(),
            summary,
            connections,
            metrics,
            check_results,
        }
    }

    pub fn save(
        &self,
        report: &InspectionReport,
        output_dir: &str,
        format: &str,
    ) -> Result<PathBuf> {
        let output_format = OutputFormat::from_str(format)?;
        let dir_path = Path::new(output_dir);
        fs::create_dir_all(dir_path)
            .with_context(|| format!("创建输出目录失败: {}", dir_path.display()))?;

        let timestamp = report.generated_at.format("%Y%m%d_%H%M%S");
        let filename = format!("inspection_report_{}.{}", timestamp, output_format.to_extension());
        let file_path = dir_path.join(filename);

        let content = match output_format {
            OutputFormat::Json => self.to_json(report)?,
            OutputFormat::Yaml => self.to_yaml(report)?,
            OutputFormat::Csv => self.to_csv(report)?,
            OutputFormat::Html => self.to_html(report)?,
        };

        fs::write(&file_path, content)
            .with_context(|| format!("写入报告文件失败: {}", file_path.display()))?;

        Ok(file_path)
    }

    pub fn load_from_file(&self, path: &str) -> Result<InspectionReport> {
        let file_path = Path::new(path);
        let content = fs::read_to_string(file_path)
            .with_context(|| format!("读取报告文件失败: {}", file_path.display()))?;

        let extension = file_path.extension().and_then(|s| s.to_str()).unwrap_or("");
        let report = match extension {
            "json" => serde_json::from_str(&content)
                .with_context(|| format!("解析 JSON 报告失败: {}", file_path.display()))?,
            "yaml" | "yml" => serde_yaml::from_str(&content)
                .with_context(|| format!("解析 YAML 报告失败: {}", file_path.display()))?,
            _ => return Err(anyhow!("不支持的报告格式: {}", extension)),
        };

        Ok(report)
    }

    fn to_json(&self, report: &InspectionReport) -> Result<String> {
        serde_json::to_string_pretty(report)
            .context("序列化 JSON 报告失败")
    }

    fn to_yaml(&self, report: &InspectionReport) -> Result<String> {
        serde_yaml::to_string(report)
            .context("序列化 YAML 报告失败")
    }

    fn to_csv(&self, report: &InspectionReport) -> Result<String> {
        let mut wtr = csv::Writer::from_writer(Vec::new());

        for result in &report.check_results {
            let row = CsvRow {
                timestamp: result.timestamp.to_rfc3339(),
                host: result.host.clone(),
                rule_id: result.rule_id.clone(),
                rule_name: result.rule_name.clone(),
                severity: format!("{:?}", result.severity),
                passed: if result.passed { "PASS".to_string() } else { "FAIL".to_string() },
                actual_value: result.actual_value.clone(),
                expected_condition: result.expected_condition.clone(),
                message: result.message.clone(),
            };
            wtr.serialize(row)?;
        }

        wtr.flush()?;
        let data = String::from_utf8(wtr.into_inner()?)?;
        Ok(data)
    }

    fn to_html(&self, report: &InspectionReport) -> Result<String> {
        let s = &report.summary;
        let generated_at = report.generated_at.format("%Y-%m-%d %H:%M:%S UTC").to_string();
        let report_id = html_escape(&report.report_id);

        let online_rate_color = if s.online_rate >= 90.0 { "#10b981" } else if s.online_rate >= 70.0 { "#f59e0b" } else { "#ef4444" };
        let pass_rate_color = if s.pass_rate >= 90.0 { "#10b981" } else if s.pass_rate >= 70.0 { "#f59e0b" } else { "#ef4444" };

        let mut conn_rows = String::new();
        for conn in &report.connections {
            let status = if conn.success {
                r#"<span style="color:#10b981">&#9679; 在线</span>"#
            } else {
                r#"<span style="color:#ef4444">&#9679; 离线</span>"#
            };
            let latency = conn.latency_ms.map(|ms| format!("{}ms", ms)).unwrap_or_else(|| "N/A".to_string());
            conn_rows.push_str(&format!(
                "<tr><td style=\"padding:10px;border-bottom:1px solid #e5e7eb\">{}</td>\
                 <td style=\"padding:10px;border-bottom:1px solid #e5e7eb\">{}</td>\
                 <td style=\"padding:10px;border-bottom:1px solid #e5e7eb\">{}</td>\
                 <td style=\"padding:10px;border-bottom:1px solid #e5e7eb\">{}</td></tr>\n",
                html_escape(&conn.host), status, latency, html_escape(&conn.message)
            ));
        }

        let mut check_rows = String::new();
        for result in &report.check_results {
            let status_html = if result.passed {
                r#"<span style="color:#10b981;font-weight:bold">通过</span>"#
            } else {
                r#"<span style="color:#ef4444;font-weight:bold">失败</span>"#
            };
            let (bg_color, label) = match &result.severity {
                Severity::Critical => ("#ef4444", "严重"),
                Severity::Warning => ("#f59e0b", "警告"),
                Severity::Info => ("#3b82f6", "信息"),
            };
            let severity_badge = format!(
                "<span style=\"background:{};color:white;padding:3px 8px;border-radius:4px;font-size:12px\">{}</span>",
                bg_color, label
            );
            check_rows.push_str(&format!(
                "<tr><td style=\"padding:10px;border-bottom:1px solid #e5e7eb\">{}</td>\
                 <td style=\"padding:10px;border-bottom:1px solid #e5e7eb\">{}</td>\
                 <td style=\"padding:10px;border-bottom:1px solid #e5e7eb\">{}</td>\
                 <td style=\"padding:10px;border-bottom:1px solid #e5e7eb\">{}</td>\
                 <td style=\"padding:10px;border-bottom:1px solid #e5e7eb\">{}</td>\
                 <td style=\"padding:10px;border-bottom:1px solid #e5e7eb\">{}</td></tr>\n",
                html_escape(&result.host),
                html_escape(&result.rule_name),
                severity_badge,
                status_html,
                html_escape(&result.actual_value),
                html_escape(&result.message)
            ));
        }

        let html = format!(r##"<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>服务器集群巡检报告</title>
<style>
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; background:#f9fafb; color:#111827; line-height:1.6; }}
.container {{ max-width:1200px; margin:0 auto; padding:40px 20px; }}
.header {{ background:linear-gradient(135deg,#667eea 0%,#764ba2 100%); color:white; padding:30px; border-radius:12px; margin-bottom:30px; }}
.header h1 {{ font-size:28px; margin-bottom:8px; }}
.header p {{ opacity:0.9; font-size:14px; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:16px; margin-bottom:30px; }}
.card {{ background:white; padding:20px; border-radius:12px; box-shadow:0 1px 3px rgba(0,0,0,0.1); }}
.card .label {{ font-size:13px; color:#6b7280; margin-bottom:6px; }}
.card .value {{ font-size:28px; font-weight:bold; color:#111827; }}
.card .sub {{ font-size:12px; color:#9ca3af; margin-top:4px; }}
.bar {{ width:100%; height:8px; background:#e5e7eb; border-radius:4px; overflow:hidden; margin-top:6px; }}
.bar-fill {{ height:100%; border-radius:4px; }}
.section {{ background:white; border-radius:12px; padding:24px; margin-bottom:24px; box-shadow:0 1px 3px rgba(0,0,0,0.1); }}
.section h2 {{ font-size:18px; margin-bottom:16px; padding-bottom:12px; border-bottom:2px solid #f3f4f6; }}
table {{ width:100%; border-collapse:collapse; }}
th {{ background:#f9fafb; padding:10px; text-align:left; font-weight:600; font-size:13px; color:#6b7280; border-bottom:2px solid #e5e7eb; }}
td {{ padding:10px; border-bottom:1px solid #e5e7eb; font-size:14px; }}
tr:hover {{ background:#f9fafb; }}
.badge {{ display:inline-block; padding:4px 10px; border-radius:20px; font-size:12px; font-weight:600; margin-right:4px; }}
.badge-critical {{ background:#fee2e2; color:#dc2626; }}
.badge-warning {{ background:#fef3c7; color:#d97706; }}
.badge-info {{ background:#dbeafe; color:#2563eb; }}
.footer {{ text-align:center; padding:20px; color:#9ca3af; font-size:12px; }}
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>服务器集群巡检报告</h1>
<p>报告 ID: {} | 生成时间: {}</p>
</div>
<div class="grid">
<div class="card"><div class="label">服务器总数</div><div class="value">{}</div><div class="sub">在线: {} / 离线: {}</div></div>
<div class="card"><div class="label">在线率</div><div class="value" style="color:{}">{:.1}%</div><div class="bar"><div class="bar-fill" style="width:{:.1}%;background-color:{}"></div></div></div>
<div class="card"><div class="label">检查项总数</div><div class="value">{}</div><div class="sub">通过: {} / 失败: {}</div></div>
<div class="card"><div class="label">通过率</div><div class="value" style="color:{}">{:.1}%</div><div class="bar"><div class="bar-fill" style="width:{:.1}%;background-color:{}"></div></div></div>
<div class="card"><div class="label">问题统计</div><div style="margin-top:8px"><span class="badge badge-critical">严重: {}</span><span class="badge badge-warning">警告: {}</span><span class="badge badge-info">信息: {}</span></div></div>
<div class="card"><div class="label">执行耗时</div><div class="value">{}ms</div><div class="sub">约 {:.2} 秒</div></div>
</div>
<div class="section">
<h2>服务器连接状态</h2>
<table><thead><tr><th>服务器</th><th>状态</th><th>延迟</th><th>消息</th></tr></thead><tbody>
{}</tbody></table>
</div>
<div class="section">
<h2>巡检检查结果</h2>
<table><thead><tr><th>服务器</th><th>检查项</th><th>级别</th><th>状态</th><th>实际值</th><th>详情</th></tr></thead><tbody>
{}</tbody></table>
</div>
<div class="footer"><p>本报告由 cluster-inspector 工具自动生成</p></div>
</div>
</body>
</html>"##,
            report_id,
            generated_at,
            s.total_servers, s.online_servers, s.offline_servers,
            online_rate_color, s.online_rate, s.online_rate, online_rate_color,
            s.total_checks, s.passed_checks, s.failed_checks,
            pass_rate_color, s.pass_rate, s.pass_rate, pass_rate_color,
            s.critical_issues, s.warning_issues, s.info_issues,
            s.duration_ms, s.duration_ms as f64 / 1000.0,
            conn_rows,
            check_rows
        );

        Ok(html)
    }
}

impl Default for ReportGenerator {
    fn default() -> Self {
        Self::new()
    }
}
