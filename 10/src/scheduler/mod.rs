pub mod task;

use anyhow::{anyhow, Result};
use chrono::{Datelike, Timelike};
use colored::Colorize;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};

pub use task::ScheduledTask;

const SCHEDULE_FILE: &str = ".scheduler_state.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
enum SchedulerMessage {
    Stop,
    RunTask(String),
}

pub struct TaskScheduler {
    tasks: HashMap<String, ScheduledTask>,
    running: bool,
    stop_sender: Option<mpsc::Sender<SchedulerMessage>>,
}

impl TaskScheduler {
    pub fn new() -> Result<Self> {
        let mut scheduler = TaskScheduler {
            tasks: HashMap::new(),
            running: false,
            stop_sender: None,
        };
        scheduler.load_state()?;
        Ok(scheduler)
    }

    pub fn add_task(
        &mut self,
        name: &str,
        cron: &str,
        config: &str,
        rules: &str,
        output: &str,
        format: &str,
        groups: &[String],
        exclude_groups: &[String],
    ) -> Result<String> {
        self.validate_cron(cron)?;

        let id = uuid::Uuid::new_v4().to_string();
        let task = ScheduledTask {
            id: id.clone(),
            name: name.to_string(),
            cron: cron.to_string(),
            config_path: config.to_string(),
            rules_path: rules.to_string(),
            output_dir: output.to_string(),
            format: format.to_string(),
            groups: groups.to_vec(),
            exclude_groups: exclude_groups.to_vec(),
            enabled: true,
            last_run: None,
            next_run: None,
            run_count: 0,
            created_at: chrono::Utc::now(),
        };

        self.tasks.insert(id.clone(), task);
        self.save_state()?;

        Ok(id)
    }

    pub fn remove_task(&mut self, id: &str) -> Result<()> {
        if self.tasks.remove(id).is_none() {
            return Err(anyhow!("任务不存在: {}", id));
        }
        self.save_state()?;
        Ok(())
    }

    pub fn list_tasks(&self) -> Vec<ScheduledTask> {
        self.tasks.values().cloned().collect()
    }

    pub fn get_task(&self, id: &str) -> Option<&ScheduledTask> {
        self.tasks.get(id)
    }

    pub async fn start(&mut self) -> Result<()> {
        if self.running {
            return Err(anyhow!("调度器已经在运行中"));
        }

        let (sender, receiver) = mpsc::channel::<SchedulerMessage>(100);
        self.stop_sender = Some(sender);
        self.running = true;

        let tasks_clone = self.tasks.clone();
        let state = Arc::new(Mutex::new(self.tasks.clone()));

        tokio::spawn(async move {
            if let Err(e) = Self::run_scheduler(tasks_clone, state, receiver).await {
                eprintln!("调度器错误: {}", e);
            }
        });

        println!("{}", "定时任务调度器已启动".green().bold());
        println!("当前任务数: {}", self.tasks.len());
        println!();

        for task in self.tasks.values() {
            if task.enabled {
                println!("  - [{}] {} ({})", task.id, task.name, task.cron);
            }
        }

        println!();
        println!("按 Ctrl+C 停止调度器...");

        tokio::signal::ctrl_c().await?;
        println!("\n收到停止信号，正在停止调度器...");

        if let Some(sender) = &self.stop_sender {
            let _ = sender.send(SchedulerMessage::Stop).await;
        }
        self.running = false;
        self.stop_sender = None;

        println!("{}", "调度器已停止".green().bold());
        Ok(())
    }

    pub fn stop(&mut self) -> Result<()> {
        if !self.running {
            return Err(anyhow!("调度器未运行"));
        }
        self.running = false;
        self.stop_sender = None;
        Ok(())
    }

    async fn run_scheduler(
        tasks: HashMap<String, ScheduledTask>,
        state: Arc<Mutex<HashMap<String, ScheduledTask>>>,
        mut receiver: mpsc::Receiver<SchedulerMessage>,
    ) -> Result<()> {
        println!("调度器运行中...");

        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(60));
        interval.tick().await;

        loop {
            tokio::select! {
                msg = receiver.recv() => {
                    match msg {
                        Some(SchedulerMessage::Stop) => {
                            println!("调度器收到停止信号");
                            break;
                        }
                        Some(SchedulerMessage::RunTask(id)) => {
                            if let Some(task) = tasks.get(&id) {
                                if task.enabled {
                                    if let Err(e) = Self::execute_task(task).await {
                                        eprintln!("任务执行失败 [{}]: {}", task.name, e);
                                    }
                                }
                            }
                        }
                        None => break,
                    }
                }
                _ = interval.tick() => {
                    let now = chrono::Utc::now();
                    for task in tasks.values() {
                        if !task.enabled {
                            continue;
                        }
                        if Self::should_run(task, now) {
                            if let Err(e) = Self::execute_task(task).await {
                                eprintln!("任务执行失败 [{}]: {}", task.name, e);
                            }
                            let mut state = state.lock().await;
                            if let Some(t) = state.get_mut(&task.id) {
                                t.last_run = Some(now);
                                t.run_count += 1;
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }

    async fn execute_task(task: &ScheduledTask) -> Result<()> {
        println!("[{}] 开始执行任务: {}",
            chrono::Local::now().format("%Y-%m-%d %H:%M:%S"), task.name);

        let config = crate::config::Config::load(&task.config_path)?;
        let rules_config = crate::config::RuleConfig::load(&task.rules_path)?;

        let servers = if task.groups.is_empty() && task.exclude_groups.is_empty() {
            config.servers.clone()
        } else {
            config.filter_servers(&task.groups, &task.exclude_groups)
        };

        if servers.is_empty() {
            println!("[{}] 任务 {} 没有匹配的服务器，跳过执行",
                chrono::Local::now().format("%Y-%m-%d %H:%M:%S"), task.name);
            return Ok(());
        }

        println!("[{}] 任务 {} 目标服务器: {} 台",
            chrono::Local::now().format("%Y-%m-%d %H:%M:%S"), task.name, servers.len());

        let cluster = crate::cluster::ClusterManager::with_config(servers, config.global.clone());
        let conn_results = cluster.test_all_connections_with_progress(false).await?;

        let collector = crate::collector::MetricsCollector::new(cluster);
        let metrics = collector.collect_all_with_progress("all", false).await?;

        let validator = crate::rules::RuleValidator::new(rules_config.rules.clone());
        let check_results = validator.validate_all(&metrics);

        let report_gen = crate::output::ReportGenerator::new();
        let report = report_gen.generate(conn_results, metrics, check_results);
        let output_path = report_gen.save(&report, &task.output_dir, &task.format)?;

        println!(
            "[{}] 任务完成: {} | 报告: {}",
            chrono::Local::now().format("%Y-%m-%d %H:%M:%S"),
            task.name,
            output_path.display()
        );

        Ok(())
    }

    fn should_run(task: &ScheduledTask, now: chrono::DateTime<chrono::Utc>) -> bool {
        let parts: Vec<&str> = task.cron.split_whitespace().collect();
        if parts.len() != 5 {
            return false;
        }

        let now_min = now.minute() as i32;
        let now_hour = now.hour() as i32;
        let now_day = now.day() as i32;
        let now_month = now.month() as i32;
        let now_weekday = now.weekday().num_days_from_sunday() as i32;

        Self::match_cron_field(parts[0], now_min)
            && Self::match_cron_field(parts[1], now_hour)
            && Self::match_cron_field(parts[2], now_day)
            && Self::match_cron_field(parts[3], now_month)
            && Self::match_cron_field(parts[4], now_weekday)
    }

    fn match_cron_field(field: &str, value: i32) -> bool {
        if field == "*" {
            return true;
        }

        if field.contains(',') {
            return field.split(',').any(|f| Self::match_cron_field(f.trim(), value));
        }

        if field.contains('-') {
            let range: Vec<&str> = field.split('-').collect();
            if range.len() == 2 {
                let start: i32 = range[0].parse().unwrap_or(-1);
                let end: i32 = range[1].parse().unwrap_or(-1);
                return value >= start && value <= end;
            }
        }

        if field.contains('/') {
            let parts: Vec<&str> = field.split('/').collect();
            if parts.len() == 2 {
                let step: i32 = parts[1].parse().unwrap_or(1);
                return if parts[0] == "*" {
                    value % step == 0
                } else {
                    let base: i32 = parts[0].parse().unwrap_or(0);
                    value >= base && (value - base) % step == 0
                };
            }
        }

        if let Ok(num) = field.parse::<i32>() {
            return num == value;
        }

        false
    }

    fn validate_cron(&self, cron: &str) -> Result<()> {
        let parts: Vec<&str> = cron.split_whitespace().collect();
        if parts.len() != 5 {
            return Err(anyhow!("Cron 表达式需要 5 个字段，实际 {} 个", parts.len()));
        }

        for part in parts {
            if !Self::is_valid_cron_part(part) {
                return Err(anyhow!("无效的 Cron 字段: {}", part));
            }
        }

        Ok(())
    }

    fn is_valid_cron_part(part: &str) -> bool {
        if part == "*" {
            return true;
        }

        if part.contains(',') {
            return part.split(',').all(|f| Self::is_valid_cron_part(f.trim()));
        }

        if part.contains('-') {
            let range: Vec<&str> = part.split('-').collect();
            return range.len() == 2
                && range.iter().all(|r| r.parse::<i32>().is_ok());
        }

        if part.contains('/') {
            let parts: Vec<&str> = part.split('/').collect();
            if parts.len() != 2 {
                return false;
            }
            let base_ok = parts[0] == "*" || parts[0].parse::<i32>().is_ok();
            let step_ok = parts[1].parse::<i32>().is_ok();
            return base_ok && step_ok;
        }

        part.parse::<i32>().is_ok()
    }

    fn save_state(&self) -> Result<()> {
        let tasks: Vec<ScheduledTask> = self.tasks.values().cloned().collect();
        let json = serde_json::to_string_pretty(&tasks)?;
        std::fs::write(SCHEDULE_FILE, json)?;
        Ok(())
    }

    fn load_state(&mut self) -> Result<()> {
        let path = Path::new(SCHEDULE_FILE);
        if !path.exists() {
            return Ok(());
        }

        let content = std::fs::read_to_string(path)?;
        let tasks: Vec<ScheduledTask> = serde_json::from_str(&content)?;
        for task in tasks {
            self.tasks.insert(task.id.clone(), task);
        }
        Ok(())
    }
}
