use anyhow::{Context, Result};
use chrono::Local;
use colored::*;
use cron::Schedule;
use std::fs;
use std::io::{self, BufRead, Write};
use std::path::Path;
use std::str::FromStr;

use crate::modules::config::{GatewayConfig, RuleConfig};
use crate::modules::remote::BatchOptions;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ScheduledTask {
    pub id: String,
    pub name: String,
    pub cron_expr: String,
    pub command: TaskCommand,
    pub enabled: bool,
    pub last_run: Option<String>,
    pub next_run: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum TaskCommand {
    Connect,
    Metrics,
    Validate,
    Report { output: String, format: String },
    Custom { command: String },
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ScheduleConfig {
    pub tasks: Vec<ScheduledTask>,
}

impl ScheduleConfig {
    pub fn load(path: &Path) -> Result<Self> {
        let content = fs::read_to_string(path)?;
        let ext = path.extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");
        match ext {
            "json" => Ok(serde_json::from_str(&content)?),
            "yaml" | "yml" => Ok(serde_yaml::from_str(&content)?),
            _ => anyhow::bail!("unsupported schedule config format: .{}", ext),
        }
    }

    pub fn save(&self, path: &Path) -> Result<()> {
        let ext = path.extension()
            .and_then(|e| e.to_str())
            .unwrap_or("yaml");
        let content = match ext {
            "json" => serde_json::to_string_pretty(self)?,
            _ => serde_yaml::to_string(self)?,
        };
        fs::write(path, content)?;
        Ok(())
    }
}

fn calc_next_run(cron_expr: &str) -> Option<String> {
    Schedule::from_str(cron_expr)
        .ok()
        .and_then(|s| s.upcoming(Local).next())
        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
}

impl Default for ScheduleConfig {
    fn default() -> Self {
        let health_cron = "0 0 8 * * *";
        let report_cron = "0 30 8 * * *";
        ScheduleConfig {
            tasks: vec![
                ScheduledTask {
                    id: "daily-health".into(),
                    name: "每日健康检查".into(),
                    cron_expr: health_cron.into(),
                    command: TaskCommand::Validate,
                    enabled: true,
                    last_run: None,
                    next_run: calc_next_run(health_cron),
                    tags: vec![],
                },
                ScheduledTask {
                    id: "daily-report".into(),
                    name: "每日运维报告".into(),
                    cron_expr: report_cron.into(),
                    command: TaskCommand::Report {
                        output: "reports/daily".into(),
                        format: "json".into(),
                    },
                    enabled: true,
                    last_run: None,
                    next_run: calc_next_run(report_cron),
                    tags: vec![],
                },
            ],
        }
    }
}

pub fn calculate_next_run(cron_expr: &str) -> Result<String> {
    let schedule = Schedule::from_str(cron_expr)
        .with_context(|| format!("无效的 cron 表达式: {}", cron_expr))?;
    let next = schedule
        .upcoming(Local)
        .next()
        .with_context(|| "无法计算下次执行时间")?;
    Ok(next.format("%Y-%m-%d %H:%M:%S").to_string())
}

#[allow(dead_code)]
pub fn refresh_next_runs(config: &mut ScheduleConfig) {
    for task in &mut config.tasks {
        if task.enabled {
            task.next_run = calc_next_run(&task.cron_expr);
        } else {
            task.next_run = None;
        }
    }
}

pub fn list_tasks(config: &ScheduleConfig) {
    println!("\n{}", "═══ 定时任务列表 ═══".bold().cyan());
    if config.tasks.is_empty() {
        println!("  (无定时任务)");
        return;
    }

    println!(
        "{:<14} {:<14} {:<20} {:<6} {:<20} {:<20} {}",
        "ID", "名称", "Cron表达式", "状态", "上次执行", "下次执行", "命令"
    );
    println!("{}", "─".repeat(110));

    for task in &config.tasks {
        let status = if task.enabled {
            "启用".green().to_string()
        } else {
            "禁用".red().to_string()
        };
        let cmd_str = match &task.command {
            TaskCommand::Connect => "connect".into(),
            TaskCommand::Metrics => "metrics".into(),
            TaskCommand::Validate => "validate".into(),
            TaskCommand::Report { format, .. } => format!("report({})", format),
            TaskCommand::Custom { command } => command.clone(),
        };
        println!(
            "{:<14} {:<14} {:<20} {:<6} {:<20} {:<20} {}",
            task.id,
            task.name,
            task.cron_expr,
            status,
            task.last_run.as_deref().unwrap_or("-"),
            task.next_run.as_deref().unwrap_or("-"),
            cmd_str,
        );
    }
}

pub fn run_task(
    task: &ScheduledTask,
    gw_config: &GatewayConfig,
    rule_config: &RuleConfig,
    options: &BatchOptions,
) -> Result<()> {
    println!("{} 执行定时任务: {}", "[定时]".bold().cyan(), task.name);

    let gateways = gw_config.filter_by_tags(&task.tags);

    if gateways.is_empty() {
        println!("  {} 无匹配网关(标签: {:?})", "!".yellow(), task.tags);
        return Ok(());
    }

    match &task.command {
        TaskCommand::Connect => {
            let results = crate::modules::remote::test_connectivity(gw_config, &gateways, options);
            for r in &results {
                if r.success {
                    println!("  {} {} ({}) - 连接正常", "✓".green(), r.gateway_id, r.host);
                } else {
                    println!("  {} {} ({}) - 连接失败: {}", "✗".red(), r.gateway_id, r.host, r.stderr.trim());
                }
            }
        }
        TaskCommand::Metrics => {
            let metrics = crate::modules::metrics::collect_metrics(gw_config, &gateways, options);
            crate::modules::metrics::print_metrics_table(&metrics, None);
        }
        TaskCommand::Validate => {
            let metrics = crate::modules::metrics::collect_metrics(gw_config, &gateways, options);
            let result = crate::modules::validator::validate(&metrics, &rule_config.rules);
            crate::modules::validator::print_validation_result(&result);
        }
        TaskCommand::Report { output, format } => {
            let metrics = crate::modules::metrics::collect_metrics(gw_config, &gateways, options);
            let validation = crate::modules::validator::validate(&metrics, &rule_config.rules);
            let report = crate::modules::report::OpsReport::new(metrics, validation);
            let timestamp = Local::now().format("%Y%m%d_%H%M%S");
            let filename = format!("{}_{}.{}", output, timestamp, format);
            let path = Path::new(&filename);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent)?;
            }
            report.save_to_file(path)?;
            println!("  报告已保存: {}", filename);
        }
        TaskCommand::Custom { command } => {
            let results = crate::modules::remote::batch_exec(gw_config, &gateways, command, options);
            for r in &results {
                println!("  [{}] {}", r.gateway_id, if r.success { &r.stdout } else { &r.stderr });
            }
        }
    }

    Ok(())
}

pub fn add_task_interactive() -> Result<ScheduledTask> {
    let stdin = io::stdin();
    let mut input = String::new();

    print!("任务ID: ");
    io::stdout().flush()?;
    stdin.lock().read_line(&mut input)?;
    let id = input.trim().to_string();
    input.clear();

    print!("任务名称: ");
    io::stdout().flush()?;
    stdin.lock().read_line(&mut input)?;
    let name = input.trim().to_string();
    input.clear();

    print!("Cron 表达式 (如: 0 0 8 * * *): ");
    io::stdout().flush()?;
    stdin.lock().read_line(&mut input)?;
    let cron_expr = input.trim().to_string();
    input.clear();

    print!("命令类型 (connect/metrics/validate/report/custom): ");
    io::stdout().flush()?;
    stdin.lock().read_line(&mut input)?;
    let cmd_type = input.trim().to_string();
    input.clear();

    let command = match cmd_type.as_str() {
        "connect" => TaskCommand::Connect,
        "metrics" => TaskCommand::Metrics,
        "validate" => TaskCommand::Validate,
        "report" => {
            print!("输出路径: ");
            io::stdout().flush()?;
            stdin.lock().read_line(&mut input)?;
            let output = input.trim().to_string();
            input.clear();
            print!("格式 (json/yaml/txt): ");
            io::stdout().flush()?;
            stdin.lock().read_line(&mut input)?;
            let format = input.trim().to_string();
            input.clear();
            TaskCommand::Report { output, format }
        }
        "custom" => {
            print!("自定义命令: ");
            io::stdout().flush()?;
            stdin.lock().read_line(&mut input)?;
            let command = input.trim().to_string();
            input.clear();
            TaskCommand::Custom { command }
        }
        _ => anyhow::bail!("未知命令类型: {}", cmd_type),
    };

    print!("标签(逗号分隔，留空=全部): ");
    io::stdout().flush()?;
    stdin.lock().read_line(&mut input)?;
    let tags: Vec<String> = input
        .trim()
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    input.clear();

    let next_run = calculate_next_run(&cron_expr).ok();

    Ok(ScheduledTask {
        id,
        name,
        cron_expr,
        command,
        enabled: true,
        last_run: None,
        next_run,
        tags,
    })
}

pub fn remove_task(config: &mut ScheduleConfig, task_id: &str) -> Result<()> {
    let original_len = config.tasks.len();
    config.tasks.retain(|t| t.id != task_id);
    if config.tasks.len() == original_len {
        anyhow::bail!("未找到任务: {}", task_id);
    }
    Ok(())
}

pub fn toggle_task(config: &mut ScheduleConfig, task_id: &str) -> Result<()> {
    let task = config
        .tasks
        .iter_mut()
        .find(|t| t.id == task_id)
        .with_context(|| format!("未找到任务: {}", task_id))?;
    task.enabled = !task.enabled;
    if task.enabled {
        task.next_run = calc_next_run(&task.cron_expr);
    } else {
        task.next_run = None;
    }
    Ok(())
}
