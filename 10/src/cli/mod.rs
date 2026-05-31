use anyhow::Result;
use clap::{Parser, Subcommand};
use colored::*;

use crate::cluster::ClusterManager;
use crate::collector::MetricsCollector;
use crate::config::Config;
use crate::output::ReportGenerator;
use crate::rules::RuleValidator;
use crate::scheduler::TaskScheduler;

#[derive(Parser, Debug)]
#[command(
    name = "cluster-inspector",
    version = "2.0.0",
    about = "服务器集群巡检自动化命令行工具集",
    long_about = "支持 SSH 批量连接、指标采集、规则校验、报告生成、定时巡检的全流程工具集\n\
                 新增功能：服务器分组执行、并发限流、连接重试、进度条、异常高亮"
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand, Debug)]
pub enum Commands {
    Connect {
        #[arg(short, long, default_value = "config/config.yaml")]
        config: String,
        #[arg(short, long)]
        host: Option<String>,
        #[arg(long, value_delimiter = ',')]
        group: Vec<String>,
        #[arg(long, value_delimiter = ',')]
        exclude_group: Vec<String>,
    },
    Collect {
        #[arg(short, long, default_value = "config/config.yaml")]
        config: String,
        #[arg(short, long)]
        host: Option<String>,
        #[arg(short, long, default_value = "all")]
        metric_type: String,
        #[arg(long, value_delimiter = ',')]
        group: Vec<String>,
        #[arg(long, value_delimiter = ',')]
        exclude_group: Vec<String>,
    },
    Inspect {
        #[arg(short, long, default_value = "config/config.yaml")]
        config: String,
        #[arg(short, long, default_value = "config/rules.yaml")]
        rules: String,
        #[arg(short, long, default_value = "reports")]
        output: String,
        #[arg(short, long, default_value = "json")]
        format: String,
        #[arg(long, value_delimiter = ',')]
        group: Vec<String>,
        #[arg(long, value_delimiter = ',')]
        exclude_group: Vec<String>,
    },
    Validate {
        #[arg(short, long, default_value = "config/rules.yaml")]
        rules: String,
    },
    Report {
        #[arg(short, long)]
        input: String,
        #[arg(short, long, default_value = "reports")]
        output: String,
        #[arg(short, long, default_value = "html")]
        format: String,
    },
    Groups {
        #[arg(short, long, default_value = "config/config.yaml")]
        config: String,
    },
    Schedule {
        #[command(subcommand)]
        action: ScheduleAction,
    },
}

#[derive(Subcommand, Debug)]
pub enum ScheduleAction {
    Add {
        #[arg(short, long)]
        name: String,
        #[arg(short, long)]
        cron: String,
        #[arg(short, long, default_value = "config/config.yaml")]
        config: String,
        #[arg(short, long, default_value = "config/rules.yaml")]
        rules: String,
        #[arg(short, long, default_value = "reports")]
        output: String,
        #[arg(short, long, default_value = "html")]
        format: String,
        #[arg(long, value_delimiter = ',')]
        group: Vec<String>,
        #[arg(long, value_delimiter = ',')]
        exclude_group: Vec<String>,
    },
    List,
    Remove {
        #[arg(short, long)]
        id: String,
    },
    Start,
    Stop,
}

impl Cli {
    pub async fn run(&self) -> Result<()> {
        match &self.command {
            Commands::Connect { config, host, group, exclude_group } => {
                Self::cmd_connect(config, host, group, exclude_group).await
            }
            Commands::Collect { config, host, metric_type, group, exclude_group } => {
                Self::cmd_collect(config, host, metric_type, group, exclude_group).await
            }
            Commands::Inspect { config, rules, output, format, group, exclude_group } => {
                Self::cmd_inspect(config, rules, output, format, group, exclude_group).await
            }
            Commands::Validate { rules } => {
                Self::cmd_validate(rules)
            }
            Commands::Report { input, output, format } => {
                Self::cmd_report(input, output, format)
            }
            Commands::Groups { config } => {
                Self::cmd_groups(config)
            }
            Commands::Schedule { action } => {
                Self::cmd_schedule(action).await
            }
        }
    }

    fn filter_servers<'a>(
        config: &'a Config,
        groups: &[String],
        exclude_groups: &[String],
    ) -> Vec<crate::config::ServerConfig> {
        let mut filtered = config.filter_servers(groups, exclude_groups);

        if filtered.is_empty() {
            filtered = config.servers.clone();
        }

        filtered
    }

    fn print_group_info(config: &Config, groups: &[String], exclude_groups: &[String]) {
        let all_groups = config.get_all_groups();
        if !all_groups.is_empty() {
            println!("可用分组: {}", all_groups.join(", ").cyan());
        }
        if !groups.is_empty() {
            println!("仅包含分组: {}", groups.join(", ").green());
        }
        if !exclude_groups.is_empty() {
            println!("排除分组: {}", exclude_groups.join(", ").yellow());
        }
    }

    async fn cmd_connect(
        config_path: &str,
        host: &Option<String>,
        groups: &[String],
        exclude_groups: &[String],
    ) -> Result<()> {
        println!("{}", "=== 服务器连接测试 ===".bold().blue());

        let config = Config::load(config_path)?;
        Self::print_group_info(&config, groups, exclude_groups);

        for server in &config.servers {
            if let crate::config::AuthConfig::Password { .. } = &server.auth {
                println!("{} 服务器 {} 使用密码认证，SSH BatchMode 下无法交互输入密码，建议改用密钥认证",
                    "!".yellow().bold(), server.name.bold());
            }
        }

        let servers = match host {
            Some(h) => {
                config.get_server(h)
                    .cloned()
                    .map(|s| vec![s])
                    .unwrap_or_default()
            }
            None => Self::filter_servers(&config, groups, exclude_groups),
        };

        if servers.is_empty() {
            println!("{} 没有匹配的服务器", "✗".red().bold());
            return Ok(());
        }

        println!("目标服务器: {} 台", servers.len().to_string().bold());
        let cluster = ClusterManager::with_config(servers, config.global.clone());

        let results = cluster.test_all_connections_with_progress(true).await?;
        let success = results.iter().filter(|r| r.success).count();
        let total = results.len();

        println!("\n{}", "连接结果:".bold());
        let mut grouped: std::collections::HashMap<String, Vec<_>> = std::collections::HashMap::new();
        for result in results {
            grouped.entry(result.group.clone()).or_default().push(result);
        }

        for (group, results) in grouped {
            println!("\n  [{}] 分组:", group.cyan().bold());
            for result in results {
                if result.success {
                    println!("    {} {} 连接成功 (延迟: {})",
                        "✓".green().bold(),
                        result.host.bold(),
                        result.latency_ms.map(|ms| format!("{}ms", ms)).unwrap_or_else(|| "N/A".to_string())
                    );
                } else {
                    println!("    {} {} 连接失败: {}",
                        "✗".red().bold(),
                        result.host.bold(),
                        result.message
                    );
                }
            }
        }

        println!("\n总计: {}/{} 服务器连接成功",
            success.to_string().green().bold(), total);

        Ok(())
    }

    async fn cmd_collect(
        config_path: &str,
        host: &Option<String>,
        metric_type: &str,
        groups: &[String],
        exclude_groups: &[String],
    ) -> Result<()> {
        println!("{}", "=== 指标采集 ===".bold().blue());

        let config = Config::load(config_path)?;
        Self::print_group_info(&config, groups, exclude_groups);

        let servers = match host {
            Some(h) => {
                config.get_server(h)
                    .cloned()
                    .map(|s| vec![s])
                    .unwrap_or_default()
            }
            None => Self::filter_servers(&config, groups, exclude_groups),
        };

        if servers.is_empty() {
            println!("{} 没有匹配的服务器", "✗".red().bold());
            return Ok(());
        }

        println!("目标服务器: {} 台", servers.len().to_string().bold());
        let cluster = ClusterManager::with_config(servers, config.global.clone());
        let collector = MetricsCollector::new(cluster);

        let metrics = match host {
            Some(h) => {
                println!("正在采集服务器指标: {}", h.bold());
                vec![collector.collect_single(h, metric_type).await?]
            }
            None => {
                collector.collect_all_with_progress(metric_type, true).await?
            }
        };

        println!("\n{}", "采集完成！".green().bold());

        let mut grouped: std::collections::HashMap<String, Vec<_>> = std::collections::HashMap::new();
        for m in metrics {
            grouped.entry(m.group.clone()).or_default().push(m);
        }

        let all_metrics: Vec<_> = grouped.values().flatten().cloned().collect();

        for (group, metrics) in grouped {
            println!("\n  [{}] 分组:", group.cyan().bold());
            for m in &metrics {
                let err_count = m.errors.len();
                if err_count > 0 {
                    println!("    {} 服务器 {} 有 {} 个采集错误",
                        "!".yellow().bold(), m.host.bold(), err_count);
                    for err in &m.errors {
                        println!("       - {}", err);
                    }
                } else {
                    println!("    {} 服务器 {} 采集正常", "✓".green().bold(), m.host.bold());
                }
            }
        }

        let json_output = serde_json::to_string_pretty(&all_metrics)?;
        println!("\n{}", json_output);

        Ok(())
    }

    async fn cmd_inspect(
        config_path: &str,
        rules_path: &str,
        output_dir: &str,
        format: &str,
        groups: &[String],
        exclude_groups: &[String],
    ) -> Result<()> {
        let start_time = std::time::Instant::now();
        println!("{}", "=== 开始集群巡检 ===".bold().blue());

        let config = Config::load(config_path)?;
        let rules = crate::config::RuleConfig::load(rules_path)?;
        Self::print_group_info(&config, groups, exclude_groups);

        let servers = Self::filter_servers(&config, groups, exclude_groups);
        if servers.is_empty() {
            println!("{} 没有匹配的服务器", "✗".red().bold());
            return Ok(());
        }
        println!("目标服务器: {} 台", servers.len().to_string().bold());

        println!("\n1. {} 连接测试...", "→".cyan());
        let cluster = ClusterManager::with_config(servers, config.global.clone());
        let conn_results = cluster.test_all_connections_with_progress(true).await?;
        let total_servers = conn_results.len();
        let success_count = conn_results.iter().filter(|r| r.success).count();

        println!("\n   连接结果:");
        for conn in &conn_results {
            if conn.success {
                println!("   {} {} 在线", "✓".green(), conn.host);
            } else {
                println!("   {} {} 离线: {}", "✗".red(), conn.host, conn.message);
            }
        }
        println!("   {} {}/{} 服务器在线", "✓".green(), success_count, total_servers);

        if success_count == 0 {
            println!("\n{} 没有可用连接，巡检终止", "✗".red().bold());
            return Ok(());
        }

        println!("\n2. {} 指标采集...", "→".cyan());
        let collector = MetricsCollector::new(cluster);
        let metrics = collector.collect_all_with_progress("all", true).await?;
        println!("   {} 完成 {} 台服务器指标采集", "✓".green(), metrics.len());

        println!("\n3. {} 规则校验...", "→".cyan());
        let validator = RuleValidator::new(rules.rules.clone());
        validator.validate_rules()?;
        let check_results = validator.validate_all(&metrics);
        let pass_count = check_results.iter().filter(|r| r.passed).count();
        let total_checks = check_results.len();
        println!("   {} {}/{} 检查项通过", "✓".green(), pass_count, total_checks);

        let critical_count = check_results.iter()
            .filter(|r| !r.passed && r.severity == crate::config::Severity::Critical)
            .count();
        let warning_count = check_results.iter()
            .filter(|r| !r.passed && r.severity == crate::config::Severity::Warning)
            .count();

        if critical_count > 0 || warning_count > 0 {
            println!("\n   {} 异常项高亮:", "!".yellow().bold());

            let failures: Vec<_> = check_results.iter().filter(|r| !r.passed).collect();
            let mut grouped_failures: std::collections::HashMap<&crate::config::Severity, Vec<_>> = std::collections::HashMap::new();
            for f in &failures {
                grouped_failures.entry(&f.severity).or_default().push(f);
            }

            if let Some(criticals) = grouped_failures.get(&crate::config::Severity::Critical) {
                println!("\n   {} 严重问题 ({} 个):", "CRITICAL".red().bold(), criticals.len());
                for f in criticals {
                    println!("     {} [{}] {}: {}",
                        "✗".red().bold(),
                        f.host.yellow(),
                        f.rule_name.bold(),
                        f.message
                    );
                }
            }

            if let Some(warnings) = grouped_failures.get(&crate::config::Severity::Warning) {
                println!("\n   {} 警告 ({} 个):", "WARNING".yellow().bold(), warnings.len());
                for f in warnings {
                    println!("     {} [{}] {}: {}",
                        "!".yellow().bold(),
                        f.host.yellow(),
                        f.rule_name.bold(),
                        f.message
                    );
                }
            }

            if let Some(infos) = grouped_failures.get(&crate::config::Severity::Info) {
                println!("\n   {} 信息 ({} 个):", "INFO".blue().bold(), infos.len());
                for f in infos {
                    println!("     {} [{}] {}: {}",
                        "i".blue().bold(),
                        f.host.yellow(),
                        f.rule_name.bold(),
                        f.message
                    );
                }
            }
        }

        println!("\n4. {} 生成报告...", "→".cyan());
        let report_gen = ReportGenerator::new();
        let report = report_gen.generate(conn_results, metrics, check_results);
        let output_path = report_gen.save(&report, output_dir, format)?;
        println!("   {} 报告已保存: {}", "✓".green(), output_path.display());

        let duration = start_time.elapsed();
        println!("\n{}", "=== 巡检完成 ===".bold().green());
        println!("总耗时: {:.2} 秒", duration.as_secs_f64());
        println!("服务器在线率: {:.1}%", (success_count as f64 / total_servers as f64) * 100.0);
        if total_checks > 0 {
            println!("检查项通过率: {:.1}%", (pass_count as f64 / total_checks as f64) * 100.0);
        }
        if critical_count > 0 {
            println!("{} {} 个严重问题需要立即处理", "⚠".red().bold(), critical_count);
        }
        if warning_count > 0 {
            println!("{} {} 个警告需要关注", "⚠".yellow().bold(), warning_count);
        }

        Ok(())
    }

    fn cmd_validate(rules_path: &str) -> Result<()> {
        println!("{}", "=== 规则校验 ===".bold().blue());

        let rules = crate::config::RuleConfig::load(rules_path)?;
        let validator = RuleValidator::new(rules.rules.clone());

        println!("共加载 {} 条巡检规则:", rules.rules.len());
        for (i, rule) in rules.rules.iter().enumerate() {
            let status = if rule.enabled { "启用".green() } else { "禁用".red() };
            let severity = match &rule.severity {
                crate::config::Severity::Critical => "严重".red(),
                crate::config::Severity::Warning => "警告".yellow(),
                crate::config::Severity::Info => "信息".blue(),
            };
            println!("  {}. [{}/{}] {} - {} [{}]",
                i + 1,
                rule.metric_type.bold(),
                severity,
                rule.name.bold(),
                rule.condition,
                status
            );
        }

        match validator.validate_rules() {
            Ok(_) => println!("\n{} 所有规则语法正确", "✓".green().bold()),
            Err(e) => println!("\n{} 规则存在错误: {}", "✗".red().bold(), e),
        }

        Ok(())
    }

    fn cmd_report(input: &str, output_dir: &str, format: &str) -> Result<()> {
        println!("{}", "=== 生成报告 ===".bold().blue());

        let report_gen = ReportGenerator::new();
        let report = report_gen.load_from_file(input)?;

        println!("报告 ID: {}", report.report_id);
        println!("生成时间: {}", report.generated_at.format("%Y-%m-%d %H:%M:%S UTC"));
        println!("服务器总数: {}", report.summary.total_servers);
        println!("检查项总数: {}", report.summary.total_checks);
        println!("通过率: {:.1}%", report.summary.pass_rate);

        let output_path = report_gen.save(&report, output_dir, format)?;
        println!("\n{} 报告已生成: {}", "✓".green().bold(), output_path.display());
        Ok(())
    }

    fn cmd_groups(config_path: &str) -> Result<()> {
        println!("{}", "=== 服务器分组 ===".bold().blue());

        let config = Config::load(config_path)?;
        let groups = config.get_all_groups();

        if groups.is_empty() {
            println!("未配置任何服务器分组");
            return Ok(());
        }

        for group in &groups {
            let servers: Vec<_> = config.servers.iter()
                .filter(|s| s.group == *group)
                .map(|s| s.name.clone())
                .collect();
            println!("  {}{}{} {} ({} 台服务器):",
                "[".cyan(),
                group.bold(),
                "]".cyan(),
                "分组".cyan(),
                servers.len()
            );
            for server in servers {
                println!("    - {}", server);
            }
        }

        println!("\n使用示例:");
        println!("  {} 只执行 web 组巡检", "cluster-inspector inspect --group web".dimmed());
        println!("  {} 排除 database 组巡检", "cluster-inspector inspect --exclude-group database".dimmed());
        println!("  {} 同时执行 web 和 cache 组", "cluster-inspector inspect --group web,cache".dimmed());

        Ok(())
    }

    async fn cmd_schedule(action: &ScheduleAction) -> Result<()> {
        let mut scheduler = TaskScheduler::new()?;

        match action {
            ScheduleAction::Add { name, cron, config, rules, output, format, group, exclude_group } => {
                println!("{}", "=== 添加定时任务 ===".bold().blue());
                let task_id = scheduler.add_task(name, cron, config, rules, output, format, group, exclude_group)?;
                println!("{} 任务已添加，ID: {}", "✓".green().bold(), task_id.bold());
            }
            ScheduleAction::List => {
                println!("{}", "=== 定时任务列表 ===".bold().blue());
                let tasks = scheduler.list_tasks();
                if tasks.is_empty() {
                    println!("暂无定时任务");
                } else {
                    for task in tasks {
                        let groups = if !task.groups.is_empty() {
                            format!(" [分组: {}]", task.groups.join(","))
                        } else {
                            String::new()
                        };
                        println!("  ID: {} | 名称: {}{} | Cron: {} | 状态: {} | 执行次数: {}",
                            task.id.bold(),
                            task.name,
                            groups,
                            task.cron,
                            if task.enabled { "启用".green() } else { "禁用".red() },
                            task.run_count
                        );
                    }
                }
            }
            ScheduleAction::Remove { id } => {
                println!("{}", "=== 移除定时任务 ===".bold().blue());
                scheduler.remove_task(id)?;
                println!("{} 任务 {} 已移除", "✓".green().bold(), id.bold());
            }
            ScheduleAction::Start => {
                println!("{}", "=== 启动调度器 ===".bold().blue());
                scheduler.start().await?;
            }
            ScheduleAction::Stop => {
                println!("{}", "=== 停止调度器 ===".bold().blue());
                scheduler.stop()?;
                println!("{} 调度器已停止", "✓".green().bold());
            }
        }

        Ok(())
    }
}
