mod modules;

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use colored::*;
use std::path::PathBuf;

use modules::config::{self, GatewayConfig, RuleConfig};
use modules::metrics::{self, HighlightThresholds};
use modules::remote::{self, BatchOptions};
use modules::report::OpsReport;
use modules::scheduler;
use modules::validator;

#[derive(Parser)]
#[command(name = "iot-gw-ops")]
#[command(about = "物联网采集网关批量运维命令行工具集", long_about = None)]
#[command(version)]
struct Cli {
    #[command(subcommand)]
    command: Commands,

    #[arg(long, global = true, help = "网关配置文件路径")]
    config: Option<PathBuf>,

    #[arg(long, global = true, help = "规则配置文件路径")]
    rules: Option<PathBuf>,

    #[arg(long, global = true, default_value = "30", help = "SSH 连接超时(秒)")]
    timeout: u64,

    #[arg(long, global = true, help = "按标签过滤网关(可多次指定)")]
    tags: Vec<String>,

    #[arg(long, global = true, default_value = "2", help = "失败重试次数")]
    retry: u32,

    #[arg(long, global = true, default_value = "32", help = "最大并发连接数")]
    parallel: usize,

    #[arg(long, global = true, help = "禁用彩色输出")]
    no_color: bool,
}

#[derive(Subcommand)]
enum Commands {
    #[command(about = "批量测试网关远程连接")]
    Connect {
        #[arg(short, long, help = "测试连接后执行的单条命令")]
        exec: Option<String>,
    },
    #[command(about = "按标签分组查看网关信息")]
    Group {
        #[arg(short, long, help = "分组后执行的命令: list/connect/metrics/validate")]
        action: Option<String>,

        #[arg(short, long, help = "指定要操作的分组标签")]
        tag: Option<String>,
    },
    #[command(about = "读取网关运行指标")]
    Metrics {
        #[arg(short, long, help = "自定义采集命令(覆盖默认指标脚本)")]
        command: Option<String>,

        #[arg(short, long, help = "输出格式: table/json/yaml")]
        format: Option<String>,

        #[arg(long, help = "显示所有网关(包括不可达)")]
        show_all: bool,
    },
    #[command(about = "运维规则校验，检测异常")]
    Validate,
    #[command(about = "生成运维报告")]
    Report {
        #[arg(short, long, help = "输出文件路径")]
        output: PathBuf,

        #[arg(short, long, default_value = "txt", help = "报告格式: txt/json/yaml")]
        format: String,
    },
    #[command(about = "管理定时运维任务")]
    Schedule {
        #[command(subcommand)]
        action: ScheduleActions,
    },
    #[command(about = "初始化示例配置文件")]
    Init {
        #[arg(short, long, default_value = ".", help = "输出目录")]
        dir: PathBuf,
    },
}

#[derive(Subcommand)]
enum ScheduleActions {
    #[command(about = "列出所有定时任务")]
    List {
        #[arg(long, help = "定时任务配置文件路径")]
        file: Option<PathBuf>,
    },
    #[command(about = "交互式添加定时任务")]
    Add {
        #[arg(long, help = "定时任务配置文件路径")]
        file: Option<PathBuf>,
    },
    #[command(about = "删除定时任务")]
    Remove {
        #[arg(long, help = "定时任务配置文件路径")]
        file: Option<PathBuf>,

        task_id: String,
    },
    #[command(about = "启用/禁用定时任务")]
    Toggle {
        #[arg(long, help = "定时任务配置文件路径")]
        file: Option<PathBuf>,

        task_id: String,
    },
    #[command(about = "立即运行指定定时任务")]
    Run {
        task_id: String,
    },
}

fn build_batch_options(cli: &Cli) -> BatchOptions {
    BatchOptions {
        timeout_secs: cli.timeout,
        max_retries: cli.retry,
        retry_delay_ms: 1000,
        max_parallel: cli.parallel,
    }
}

fn load_gateway_config(path: &Option<PathBuf>) -> Result<GatewayConfig> {
    match path {
        Some(p) => GatewayConfig::load(p).with_context(|| format!("加载网关配置失败: {:?}", p)),
        None => {
            let candidates = ["gateways.yaml", "gateways.json", "gateways.yml"];
            for c in &candidates {
                let p = PathBuf::from(c);
                if p.exists() {
                    return GatewayConfig::load(&p);
                }
            }
            anyhow::bail!(
                "未指定网关配置文件，且当前目录未找到 gateways.yaml/json。请使用 --config 指定"
            )
        }
    }
}

fn load_rule_config(path: &Option<PathBuf>) -> Result<RuleConfig> {
    match path {
        Some(p) => RuleConfig::load(p).with_context(|| format!("加载规则配置失败: {:?}", p)),
        None => {
            let candidates = ["rules.yaml", "rules.json", "rules.yml"];
            for c in &candidates {
                let p = PathBuf::from(c);
                if p.exists() {
                    return RuleConfig::load(&p);
                }
            }
            Ok(RuleConfig::default())
        }
    }
}

fn load_schedule_config(path: &Option<PathBuf>) -> Result<scheduler::ScheduleConfig> {
    match path {
        Some(p) => scheduler::ScheduleConfig::load(p)
            .with_context(|| format!("加载定时任务配置失败: {:?}", p)),
        None => {
            let candidates = ["schedule.yaml", "schedule.json", "schedule.yml"];
            for c in &candidates {
                let p = PathBuf::from(c);
                if p.exists() {
                    return scheduler::ScheduleConfig::load(&p);
                }
            }
            Ok(scheduler::ScheduleConfig::default())
        }
    }
}

fn save_schedule_config(config: &scheduler::ScheduleConfig, path: &Option<PathBuf>) -> Result<()> {
    let save_path = match path {
        Some(p) => p.clone(),
        None => PathBuf::from("schedule.yaml"),
    };
    config.save(&save_path)?;
    println!("定时任务配置已保存: {:?}", save_path);
    Ok(())
}

fn print_group_overview(gw_config: &GatewayConfig) {
    use std::collections::HashMap;
    let mut groups: HashMap<String, usize> = HashMap::new();

    for gw in &gw_config.gateways {
        if gw.tags.is_empty() {
            *groups.entry("未分组".to_string()).or_insert(0) += 1;
        } else {
            for tag in &gw.tags {
                *groups.entry(tag.clone()).or_insert(0) += 1;
            }
        }
    }

    println!("\n{} 网关分组概览", "[分组]".bold().cyan());
    println!("{}", "─".repeat(50));
    let mut sorted: Vec<_> = groups.iter().collect();
    sorted.sort_by(|a, b| a.0.cmp(b.0));

    for (tag, count) in sorted {
        println!("  {:<20} {} 台", tag, count);
    }
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    if cli.no_color {
        colored::control::set_override(false);
    }

    let batch_opts = build_batch_options(&cli);

    match &cli.command {
        Commands::Init { dir } => {
            std::fs::create_dir_all(dir)?;
            let gw_path = dir.join("gateways.yaml");
            let rule_path = dir.join("rules.yaml");
            let sched_path = dir.join("schedule.yaml");

            config::generate_sample_gateway_config(&gw_path)?;
            config::generate_sample_rule_config(&rule_path)?;

            let sched = scheduler::ScheduleConfig::default();
            sched.save(&sched_path)?;

            println!("{} 示例配置文件已生成:", "✓".green().bold());
            println!("  网关配置: {:?}", gw_path);
            println!("  规则配置: {:?}", rule_path);
            println!("  定时任务: {:?}", sched_path);
            println!("\n请编辑配置文件后使用各子命令进行运维操作。");
        }
        Commands::Connect { exec } => {
            let gw_config = load_gateway_config(&cli.config)?;
            let gateways = gw_config.filter_by_tags(&cli.tags);

            if gateways.is_empty() {
                println!("{}", "未找到匹配的网关".yellow());
                return Ok(());
            }

            println!(
                "{} 测试 {} 台网关连接 (并发={}, 重试={})...",
                "[连接]".bold().cyan(),
                gateways.len(),
                cli.parallel,
                cli.retry,
            );

            let command = exec.as_deref().unwrap_or("echo iot-gw-ops-connectivity-test");
            let results = remote::batch_exec(&gw_config, &gateways, command, &batch_opts);
            remote::print_batch_results(&results);
        }
        Commands::Group { action, tag } => {
            let gw_config = load_gateway_config(&cli.config)?;

            match action.as_deref() {
                None | Some("list") | Some("overview") => {
                    print_group_overview(&gw_config);
                }
                Some("connect") => {
                    let target_tags: Vec<String> = if let Some(t) = tag {
                        vec![t.clone()]
                    } else {
                        Vec::new()
                    };

                    let gateways = if target_tags.is_empty() {
                        gw_config.filter_by_tags(&[])
                    } else {
                        gw_config.filter_by_tags(&target_tags)
                    };

                    if gateways.is_empty() {
                        println!("{}", "未找到匹配的网关".yellow());
                        return Ok(());
                    }

                    let tag_label = if let Some(t) = tag {
                        t.clone()
                    } else {
                        "全部".to_string()
                    };

                    println!(
                        "{} 分组连接测试: {} ({} 台)...",
                        "[分组]".bold().cyan(),
                        tag_label,
                        gateways.len()
                    );

                    let results = remote::test_connectivity(&gw_config, &gateways, &batch_opts);
                    remote::print_batch_results(&results);
                }
                Some("metrics") => {
                    let target_tags: Vec<String> = if let Some(t) = tag {
                        vec![t.clone()]
                    } else {
                        Vec::new()
                    };

                    let gateways = if target_tags.is_empty() {
                        gw_config.filter_by_tags(&[])
                    } else {
                        gw_config.filter_by_tags(&target_tags)
                    };

                    if gateways.is_empty() {
                        println!("{}", "未找到匹配的网关".yellow());
                        return Ok(());
                    }

                    let rule_config = load_rule_config(&cli.rules)?;
                    let thresholds = HighlightThresholds::from_rules(&rule_config.rules);

                    let tag_label = if let Some(t) = tag {
                        t.clone()
                    } else {
                        "全部".to_string()
                    };

                    println!(
                        "{} 分组指标采集: {} ({} 台)...",
                        "[分组]".bold().cyan(),
                        tag_label,
                        gateways.len()
                    );

                    let metrics_list = metrics::collect_metrics(&gw_config, &gateways, &batch_opts);
                    metrics::print_metrics_table(&metrics_list, Some(&thresholds));
                }
                Some("validate") => {
                    let target_tags: Vec<String> = if let Some(t) = tag {
                        vec![t.clone()]
                    } else {
                        Vec::new()
                    };

                    let gateways = if target_tags.is_empty() {
                        gw_config.filter_by_tags(&[])
                    } else {
                        gw_config.filter_by_tags(&target_tags)
                    };

                    if gateways.is_empty() {
                        println!("{}", "未找到匹配的网关".yellow());
                        return Ok(());
                    }

                    let rule_config = load_rule_config(&cli.rules)?;
                    let tag_label = if let Some(t) = tag {
                        t.clone()
                    } else {
                        "全部".to_string()
                    };

                    println!(
                        "{} 分组规则校验: {} ({} 台, {} 条规则)...",
                        "[分组]".bold().cyan(),
                        tag_label,
                        gateways.len(),
                        rule_config.rules.len(),
                    );

                    let metrics_list = metrics::collect_metrics(&gw_config, &gateways, &batch_opts);
                    let result = validator::validate(&metrics_list, &rule_config.rules);
                    validator::print_validation_result(&result);
                }
                Some(other) => {
                    println!("{} 未知分组操作: {}", "!".red(), other);
                    println!("支持的操作: list/overview, connect, metrics, validate");
                }
            }
        }
        Commands::Metrics { command, format, show_all } => {
            let gw_config = load_gateway_config(&cli.config)?;
            let rule_config = load_rule_config(&cli.rules)?;
            let gateways = gw_config.filter_by_tags(&cli.tags);

            if gateways.is_empty() {
                println!("{}", "未找到匹配的网关".yellow());
                return Ok(());
            }

            println!(
                "{} 采集 {} 台网关运行指标 (并发={}, 重试={})...",
                "[指标]".bold().cyan(),
                gateways.len(),
                cli.parallel,
                cli.retry,
            );

            let thresholds = HighlightThresholds::from_rules(&rule_config.rules);

            if let Some(cmd) = command {
                let results = metrics::collect_custom_metrics(&gw_config, &gateways, cmd, &batch_opts);
                for r in &results {
                    if r.success {
                        println!("[{}] {}", r.gateway_id.green(), r.stdout.trim());
                    } else {
                        println!("[{}] {}", r.gateway_id.red(), r.stderr.trim());
                    }
                }
            } else {
                let mut metrics_list = metrics::collect_metrics(&gw_config, &gateways, &batch_opts);

                if !show_all {
                    metrics_list.retain(|m| m.reachable);
                }

                match format.as_deref() {
                    Some("json") => println!("{}", serde_json::to_string_pretty(&metrics_list)?),
                    Some("yaml") => println!("{}", serde_yaml::to_string(&metrics_list)?),
                    _ => metrics::print_metrics_table(&metrics_list, Some(&thresholds)),
                }
            }
        }
        Commands::Validate => {
            let gw_config = load_gateway_config(&cli.config)?;
            let rule_config = load_rule_config(&cli.rules)?;
            let gateways = gw_config.filter_by_tags(&cli.tags);

            if gateways.is_empty() {
                println!("{}", "未找到匹配的网关".yellow());
                return Ok(());
            }

            println!(
                "{} 采集指标并校验 {} 条规则...",
                "[校验]".bold().cyan(),
                rule_config.rules.len()
            );

            let metrics_list = metrics::collect_metrics(&gw_config, &gateways, &batch_opts);
            let result = validator::validate(&metrics_list, &rule_config.rules);
            validator::print_validation_result(&result);
        }
        Commands::Report { output, format } => {
            let gw_config = load_gateway_config(&cli.config)?;
            let rule_config = load_rule_config(&cli.rules)?;
            let gateways = gw_config.filter_by_tags(&cli.tags);

            if gateways.is_empty() {
                println!("{}", "未找到匹配的网关".yellow());
                return Ok(());
            }

            println!(
                "{} 采集指标、校验规则、生成报告...",
                "[报告]".bold().cyan()
            );

            let metrics_list = metrics::collect_metrics(&gw_config, &gateways, &batch_opts);
            let validation = validator::validate(&metrics_list, &rule_config.rules);
            let report = OpsReport::new(metrics_list, validation);

            if let Some(parent) = output.parent() {
                std::fs::create_dir_all(parent)?;
            }

            let final_path = if output.extension().is_none() {
                let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
                PathBuf::from(format!(
                    "{}_{}.{}",
                    output.display(),
                    timestamp,
                    format
                ))
            } else {
                output.clone()
            };

            report.save_to_file(&final_path)?;
            println!(
                "{} 运维报告已生成: {:?}",
                "✓".green().bold(),
                final_path
            );
        }
        Commands::Schedule { action } => match action {
            ScheduleActions::List { file } => {
                let sched_config = load_schedule_config(file)?;
                scheduler::list_tasks(&sched_config);
            }
            ScheduleActions::Add { file } => {
                let mut sched_config = load_schedule_config(file)?;
                println!("{}", "添加定时任务 (交互模式)".bold().cyan());
                let task = scheduler::add_task_interactive()?;
                println!("{} 已添加任务: {} ({})", "✓".green(), task.name, task.id);
                sched_config.tasks.push(task);
                save_schedule_config(&sched_config, file)?;
            }
            ScheduleActions::Remove { file, task_id } => {
                let mut sched_config = load_schedule_config(file)?;
                scheduler::remove_task(&mut sched_config, task_id)?;
                println!("{} 已删除任务: {}", "✓".green(), task_id);
                save_schedule_config(&sched_config, file)?;
            }
            ScheduleActions::Toggle { file, task_id } => {
                let mut sched_config = load_schedule_config(file)?;
                scheduler::toggle_task(&mut sched_config, task_id)?;
                let task = sched_config.tasks.iter().find(|t| t.id == *task_id).unwrap();
                let status = if task.enabled { "启用" } else { "禁用" };
                println!("{} 任务 {} 已{}", "✓".green(), task_id, status);
                save_schedule_config(&sched_config, file)?;
            }
            ScheduleActions::Run { task_id } => {
                let gw_config = load_gateway_config(&cli.config)?;
                let rule_config = load_rule_config(&cli.rules)?;
                let sched_config = load_schedule_config(&None::<PathBuf>)?;

                let task = sched_config
                    .tasks
                    .iter()
                    .find(|t| t.id == *task_id)
                    .with_context(|| format!("未找到任务: {}", task_id))?;

                if !task.enabled {
                    println!("{} 任务 {} 已禁用，跳过执行", "!".yellow(), task_id);
                    return Ok(());
                }

                scheduler::run_task(task, &gw_config, &rule_config, &batch_opts)?;
            }
        },
    }

    Ok(())
}
