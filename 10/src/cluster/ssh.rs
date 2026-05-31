use anyhow::{anyhow, Result, Context};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::process::Command;

use crate::config::ServerConfig;

#[derive(Clone)]
pub struct SshSession {
    server: Arc<ServerConfig>,
    connected: Arc<Mutex<bool>>,
}

fn expand_tilde(path: &str) -> std::borrow::Cow<'_, str> {
    if path.starts_with("~/") {
        if let Ok(home) = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
        {
            return std::borrow::Cow::Owned(format!("{}{}", home, &path[1..]));
        }
    }
    std::borrow::Cow::Borrowed(path)
}

impl SshSession {
    pub async fn connect(server: &ServerConfig) -> Result<Self> {
        Self::connect_with_config(server, &crate::config::GlobalConfig::default()).await
    }

    pub async fn connect_with_config(server: &ServerConfig, global: &crate::config::GlobalConfig) -> Result<Self> {
        let session = SshSession {
            server: Arc::new(server.clone()),
            connected: Arc::new(Mutex::new(true)),
        };

        let test_result = session.execute_raw_with_timeout("echo ok", server.timeout_secs(Some(global))).await;
        match test_result {
            Ok((stdout, _, 0)) if stdout.trim() == "ok" => Ok(session),
            Ok((stdout, stderr, code)) => {
                let detail = if !stderr.trim().is_empty() {
                    stderr.trim().to_string()
                } else if !stdout.trim().is_empty() {
                    stdout.trim().to_string()
                } else {
                    format!("exit code: {}", code)
                };
                Err(anyhow!(
                    "SSH 连接 {}@{}:{} 失败 - {}",
                    server.username, server.host, server.port, detail
                ))
            }
            Err(e) => Err(anyhow!(
                "无法连接 {}@{}:{} - {}",
                server.username, server.host, server.port, e
            )),
        }
    }

    pub async fn execute(&self, command: &str) -> Result<(String, String, i32)> {
        let connected = self.connected.lock().await;
        if !*connected {
            return Err(anyhow!("SSH 会话已断开: {}", self.server.host));
        }
        drop(connected);
        self.execute_raw(command).await
    }

    async fn execute_raw(&self, command: &str) -> Result<(String, String, i32)> {
        self.execute_raw_with_timeout(command, self.server.timeout_secs(None)).await
    }

    async fn execute_raw_with_timeout(&self, command: &str, timeout: u64) -> Result<(String, String, i32)> {
        let server = &self.server;

        let mut cmd = Command::new("ssh");

        cmd.arg("-o")
            .arg("StrictHostKeyChecking=no")
            .arg("-o")
            .arg("UserKnownHostsFile=NUL")
            .arg("-o")
            .arg(format!("ConnectTimeout={}", timeout))
            .arg("-o")
            .arg("ServerAliveInterval=30")
            .arg("-o")
            .arg("ServerAliveCountMax=3")
            .arg("-o")
            .arg("BatchMode=yes")
            .arg("-p")
            .arg(server.port.to_string());

        match &server.auth {
            crate::config::AuthConfig::Key { key_path, passphrase: _ } => {
                let key = PathBuf::from(expand_tilde(key_path).to_string());
                if !key.exists() {
                    return Err(anyhow!("SSH 密钥文件不存在: {}", key.display()));
                }
                cmd.arg("-i").arg(&key);
            }
            crate::config::AuthConfig::Password { .. } => {
                cmd.arg("-o").arg("PubkeyAuthentication=no");
            }
        }

        cmd.arg(format!("{}@{}", server.username, server.host))
            .arg(command);

        let output = cmd.output()
            .await
            .with_context(|| format!(
                "执行 SSH 命令失败: ssh 未安装或不在 PATH 中 (host={})",
                server.host
            ))?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let exit_code = output.status.code().unwrap_or(-1);

        if stderr.contains("Permission denied") {
            return Err(anyhow!(
                "SSH 认证失败 ({}@{}): 权限被拒绝，请检查密钥或密码",
                server.username, server.host
            ));
        }

        if stderr.contains("Connection refused") {
            return Err(anyhow!(
                "SSH 连接被拒绝 ({}:{}): 目标端口未开放",
                server.host, server.port
            ));
        }

        if stderr.contains("No route to host") {
            return Err(anyhow!(
                "SSH 连接不可达 ({}): 网络路由不可达",
                server.host
            ));
        }

        if stderr.contains("timed out") {
            return Err(anyhow!(
                "SSH 连接超时 ({}:{}): 请检查网络和防火墙",
                server.host, server.port
            ));
        }

        Ok((stdout, stderr, exit_code))
    }

    pub async fn is_alive(&self) -> Result<bool> {
        let mut connected = self.connected.lock().await;
        if !*connected {
            return Ok(false);
        }

        match self.execute_raw_with_timeout("echo alive", 5).await {
            Ok((stdout, _, 0)) if stdout.trim() == "alive" => Ok(true),
            _ => {
                *connected = false;
                Ok(false)
            }
        }
    }

    pub async fn close(&mut self) -> Result<()> {
        let mut connected = self.connected.lock().await;
        *connected = false;
        Ok(())
    }

    pub fn get_server(&self) -> &ServerConfig {
        &self.server
    }
}
