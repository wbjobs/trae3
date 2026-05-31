use anyhow::{Context, Result};
use rayon::prelude::*;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::modules::config::{Gateway, GatewayConfig};

#[derive(Debug, Clone)]
pub struct CommandResult {
    pub gateway_id: String,
    pub host: String,
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub success: bool,
    pub timed_out: bool,
    pub retries: u32,
    pub elapsed_ms: u64,
}

#[derive(Debug, Clone)]
pub struct BatchOptions {
    pub timeout_secs: u64,
    pub max_retries: u32,
    pub retry_delay_ms: u64,
    #[allow(dead_code)]
    pub max_parallel: usize,
}

impl Default for BatchOptions {
    fn default() -> Self {
        BatchOptions {
            timeout_secs: 30,
            max_retries: 2,
            retry_delay_ms: 1000,
            max_parallel: 32,
        }
    }
}

fn build_ssh_args(gateway: &Gateway, command: &str) -> Vec<String> {
    let mut args = Vec::new();

    args.push("-o".into());
    args.push("StrictHostKeyChecking=no".into());
    args.push("-o".into());
    if cfg!(windows) {
        args.push("UserKnownHostsFile=NUL".into());
    } else {
        args.push("UserKnownHostsFile=/dev/null".into());
    }
    args.push("-o".into());
    args.push("LogLevel=ERROR".into());
    args.push("-o".into());
    args.push("BatchMode=yes".into());
    args.push("-o".into());
    args.push("ConnectTimeout=10".into());
    args.push("-o".into());
    args.push("ServerAliveInterval=5".into());
    args.push("-o".into());
    args.push("ServerAliveCountMax=2".into());

    if let Some(key_path) = &gateway.key_path {
        args.push("-i".into());
        args.push(key_path.clone());
    }

    args.push("-p".into());
    args.push(gateway.port.to_string());

    let target = format!("{}@{}", gateway.username, gateway.host);
    args.push(target);
    args.push(command.into());

    args
}

pub fn ssh_exec(gateway: &Gateway, command: &str, timeout_secs: u64) -> Result<CommandResult> {
    let start = Instant::now();
    let args = build_ssh_args(gateway, command);

    let child = Command::new("ssh")
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .with_context(|| "执行 ssh 命令失败，请确认 ssh 已安装并在 PATH 中")?;

    let output = match child.wait_with_output() {
        Ok(o) => o,
        Err(e) => {
            let elapsed = start.elapsed().as_millis() as u64;
            if start.elapsed() > Duration::from_secs(timeout_secs) {
                return Ok(CommandResult {
                    gateway_id: gateway.id.clone(),
                    host: gateway.host.clone(),
                    exit_code: -1,
                    stdout: String::new(),
                    stderr: format!("连接超时 ({}秒)", timeout_secs),
                    success: false,
                    timed_out: true,
                    retries: 0,
                    elapsed_ms: elapsed,
                });
            }
            return Err(e).with_context(|| "等待 ssh 命令完成失败");
        }
    };

    let elapsed = start.elapsed().as_millis() as u64;
    let exit_code = output.status.code().unwrap_or(-1);
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    Ok(CommandResult {
        gateway_id: gateway.id.clone(),
        host: gateway.host.clone(),
        exit_code,
        stdout,
        stderr,
        success: exit_code == 0,
        timed_out: false,
        retries: 0,
        elapsed_ms: elapsed,
    })
}

pub fn ssh_exec_with_retry(
    gateway: &Gateway,
    command: &str,
    options: &BatchOptions,
) -> Result<CommandResult> {
    let mut last_err: Option<anyhow::Error> = None;
    let mut last_result: Option<CommandResult> = None;

    for attempt in 0..=options.max_retries {
        let result = match ssh_exec(gateway, command, options.timeout_secs) {
            Ok(r) => r,
            Err(e) => {
                last_err = Some(e);
                if attempt < options.max_retries {
                    std::thread::sleep(Duration::from_millis(options.retry_delay_ms));
                    continue;
                }
                let mut result = CommandResult {
                    gateway_id: gateway.id.clone(),
                    host: gateway.host.clone(),
                    exit_code: -1,
                    stdout: String::new(),
                    stderr: last_err.as_ref().unwrap().to_string(),
                    success: false,
                    timed_out: false,
                    retries: attempt,
                    elapsed_ms: 0,
                };
                result.retries = attempt;
                return Ok(result);
            }
        };

        if result.success {
            let mut result = result;
            result.retries = attempt;
            return Ok(result);
        }

        last_result = Some(result);

        if attempt < options.max_retries {
            std::thread::sleep(Duration::from_millis(options.retry_delay_ms));
        }
    }

    if let Some(mut result) = last_result {
        result.retries = options.max_retries;
        Ok(result)
    } else {
        Err(last_err.unwrap_or_else(|| anyhow::anyhow!("执行失败")))
    }
}

pub fn batch_exec(
    _config: &GatewayConfig,
    gateways: &[&Gateway],
    command: &str,
    options: &BatchOptions,
) -> Vec<CommandResult> {
    let _counter = Arc::new(AtomicUsize::new(0));
    let _total = gateways.len();

    let command_arc = Arc::new(command.to_string());
    let options_arc = Arc::new(options.clone());

    gateways
        .par_iter()
        .with_min_len(1)
        .with_max_len(1)
        .map(|gw| {
            let _count = _counter.fetch_add(1, Ordering::SeqCst) + 1;
            let cmd = command_arc.as_str();
            let opts = options_arc.as_ref();

            match ssh_exec_with_retry(gw, cmd, opts) {
                Ok(r) => r,
                Err(e) => CommandResult {
                    gateway_id: gw.id.clone(),
                    host: gw.host.clone(),
                    exit_code: -1,
                    stdout: String::new(),
                    stderr: e.to_string(),
                    success: false,
                    timed_out: false,
                    retries: 0,
                    elapsed_ms: 0,
                },
            }
        })
        .collect()
}

pub fn test_connectivity(
    config: &GatewayConfig,
    gateways: &[&Gateway],
    options: &BatchOptions,
) -> Vec<CommandResult> {
    batch_exec(config, gateways, "echo iot-gw-ops-ok", options)
}

pub fn print_batch_results(results: &[CommandResult]) {
    let success_count = results.iter().filter(|r| r.success).count();
    let fail_count = results.len() - success_count;
    let total_time: u64 = results.iter().map(|r| r.elapsed_ms).sum();
    let avg_time = if !results.is_empty() {
        total_time / results.len() as u64
    } else {
        0
    };

    println!(
        "\n批量执行结果: 总计 {} | 成功 {} | 失败 {} | 平均耗时 {}ms",
        results.len(),
        success_count,
        fail_count,
        avg_time,
    );

    if fail_count > 0 {
        println!("\n失败网关:");
        for r in results.iter().filter(|r| !r.success) {
            let reason = if r.timed_out {
                "超时".to_string()
            } else {
                r.stderr.lines().next().unwrap_or("未知错误").chars().take(50).collect::<String>()
            };
            println!(
                "  {} ({}): {} (重试 {} 次, 耗时 {}ms)",
                r.gateway_id,
                r.host,
                reason,
                r.retries,
                r.elapsed_ms,
            );
        }
    }
}
