pub mod ssh;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, Semaphore};
use indicatif::{ProgressBar, ProgressStyle};

pub use ssh::SshSession;

use crate::config::{GlobalConfig, ServerConfig};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionResult {
    pub host: String,
    pub group: String,
    pub success: bool,
    pub message: String,
    pub latency_ms: Option<u64>,
}

pub struct ClusterManager {
    servers: Vec<ServerConfig>,
    global: GlobalConfig,
    sessions: Arc<Mutex<HashMap<String, SshSession>>>,
    semaphore: Arc<Semaphore>,
}

impl ClusterManager {
    pub fn new(servers: Vec<ServerConfig>) -> Self {
        Self::with_config(servers, GlobalConfig::default())
    }

    pub fn with_config(servers: Vec<ServerConfig>, global: GlobalConfig) -> Self {
        let parallel = if global.parallel == 0 { 5 } else { global.parallel };
        ClusterManager {
            servers,
            global,
            sessions: Arc::new(Mutex::new(HashMap::new())),
            semaphore: Arc::new(Semaphore::new(parallel)),
        }
    }

    pub fn get_servers(&self) -> &[ServerConfig] {
        &self.servers
    }

    pub fn get_global_config(&self) -> &GlobalConfig {
        &self.global
    }

    pub fn get_server(&self, name: &str) -> Option<&ServerConfig> {
        self.servers.iter().find(|s| s.name == name || s.host == name)
    }

    pub async fn test_single_connection(&self, host: &str) -> Result<ConnectionResult> {
        let server = self.get_server(host)
            .ok_or_else(|| anyhow::anyhow!("未找到服务器: {}", host))?;
        self.test_connection_internal(server).await
    }

    async fn test_connection_internal(&self, server: &ServerConfig) -> Result<ConnectionResult> {
        let retries = self.global.retries.max(1);
        let mut last_result: Option<ConnectionResult> = None;

        for attempt in 1..=retries {
            let start = std::time::Instant::now();
            let result = SshSession::connect_with_config(server, &self.global).await;
            let latency = start.elapsed().as_millis() as u64;

            match result {
                Ok(mut session) => {
                    session.close().await?;
                    return Ok(ConnectionResult {
                        host: server.name.clone(),
                        group: server.group.clone(),
                        success: true,
                        message: "连接成功".to_string(),
                        latency_ms: Some(latency),
                    });
                }
                Err(e) => {
                    last_result = Some(ConnectionResult {
                        host: server.name.clone(),
                        group: server.group.clone(),
                        success: false,
                        message: if attempt < retries {
                            format!("第{}次尝试失败: {}，正在重试...", attempt, e)
                        } else {
                            e.to_string()
                        },
                        latency_ms: Some(latency),
                    });
                    if attempt < retries {
                        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                    }
                }
            }
        }

        Ok(last_result.unwrap_or_else(|| ConnectionResult {
            host: server.name.clone(),
            group: server.group.clone(),
            success: false,
            message: "连接失败".to_string(),
            latency_ms: None,
        }))
    }

    pub async fn test_all_connections(&self) -> Result<Vec<ConnectionResult>> {
        self.test_all_connections_with_progress(false).await
    }

    pub async fn test_all_connections_with_progress(
        &self,
        show_progress: bool,
    ) -> Result<Vec<ConnectionResult>> {
        let servers: Vec<ServerConfig> = self.servers.clone();
        let total = servers.len();

        let pb = if show_progress {
            let pb = ProgressBar::new(total as u64);
            pb.set_style(ProgressStyle::default_bar()
                .template("{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}/{len} 连接测试中...").unwrap()
                .progress_chars("#>-"));
            Some(pb)
        } else {
            None
        };

        let mut handles = Vec::new();
        let semaphore = self.semaphore.clone();
        let global = self.global.clone();

        for server in servers {
            let permit = semaphore.clone().acquire_owned().await.unwrap();
            let pb_clone = pb.clone();
            let global_clone = global.clone();

            handles.push(tokio::spawn(async move {
                let _permit = permit;
                let retries = global_clone.retries.max(1);
                let mut last_result: Option<ConnectionResult> = None;

                for attempt in 1..=retries {
                    let start = std::time::Instant::now();
                    let result = SshSession::connect_with_config(&server, &global_clone).await;
                    let latency = start.elapsed().as_millis() as u64;

                    match result {
                        Ok(mut session) => {
                            let _ = session.close().await;
                            last_result = Some(ConnectionResult {
                                host: server.name.clone(),
                                group: server.group.clone(),
                                success: true,
                                message: "连接成功".to_string(),
                                latency_ms: Some(latency),
                            });
                            break;
                        }
                        Err(e) => {
                            last_result = Some(ConnectionResult {
                                host: server.name.clone(),
                                group: server.group.clone(),
                                success: false,
                                message: if attempt < retries {
                                    format!("第{}次尝试失败: {}", attempt, e)
                                } else {
                                    e.to_string()
                                },
                                latency_ms: Some(latency),
                            });
                            if attempt < retries {
                                tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                            }
                        }
                    }
                }

                if let Some(pb) = pb_clone {
                    pb.inc(1);
                }

                last_result.unwrap_or_else(|| ConnectionResult {
                    host: server.name.clone(),
                    group: server.group.clone(),
                    success: false,
                    message: "连接失败".to_string(),
                    latency_ms: None,
                })
            }));
        }

        let mut results = Vec::new();
        for handle in handles {
            results.push(handle.await?);
        }

        if let Some(pb) = pb {
            pb.finish_with_message("连接测试完成");
        }

        Ok(results)
    }

    pub async fn get_session(&self, host: &str) -> Result<SshSession> {
        let server = self.get_server(host)
            .ok_or_else(|| anyhow::anyhow!("未找到服务器: {}", host))?;

        let mut sessions = self.sessions.lock().await;
        if let Some(session) = sessions.get(host) {
            if session.is_alive().await? {
                return Ok(session.clone());
            }
        }

        let session = SshSession::connect_with_config(server, &self.global).await?;
        sessions.insert(host.to_string(), session.clone());
        Ok(session)
    }

    pub async fn execute_command(&self, host: &str, command: &str) -> Result<(String, String, i32)> {
        let session = self.get_session(host).await?;
        session.execute(command).await
    }

    pub async fn close_all(&self) -> Result<()> {
        let mut sessions = self.sessions.lock().await;
        for (_, mut session) in sessions.drain() {
            let _ = session.close().await;
        }
        Ok(())
    }

    pub fn get_semaphore(&self) -> Arc<Semaphore> {
        self.semaphore.clone()
    }
}
