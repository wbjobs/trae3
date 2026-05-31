-- 创建数据库
CREATE DATABASE IF NOT EXISTS config_version DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE config_version;

-- 配置版本表
CREATE TABLE IF NOT EXISTS config_versions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    app_id VARCHAR(128) NOT NULL COMMENT '应用ID',
    namespace VARCHAR(128) NOT NULL COMMENT '命名空间',
    version INT NOT NULL COMMENT '版本号',
    config_data JSON NOT NULL COMMENT '配置数据',
    config_hash VARCHAR(64) COMMENT '配置内容哈希',
    change_type VARCHAR(32) DEFAULT 'update' COMMENT '变更类型: create/update/rollback/delete',
    description VARCHAR(512) COMMENT '变更描述',
    operator VARCHAR(64) DEFAULT 'system' COMMENT '操作人',
    diff_summary JSON COMMENT '变更统计摘要',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    UNIQUE KEY idx_app_namespace_version (app_id, namespace, version),
    KEY idx_app_id (app_id),
    KEY idx_namespace (namespace),
    KEY idx_version (version),
    KEY idx_config_hash (config_hash),
    KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='配置版本表';

-- 回滚记录表
CREATE TABLE IF NOT EXISTS rollback_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    app_id VARCHAR(128) NOT NULL COMMENT '应用ID',
    namespace VARCHAR(128) NOT NULL COMMENT '命名空间',
    from_version INT NOT NULL COMMENT '回滚前版本',
    to_version INT NOT NULL COMMENT '回滚后版本',
    task_id VARCHAR(64) COMMENT '回滚任务ID',
    operator VARCHAR(64) DEFAULT 'system' COMMENT '操作人',
    reason VARCHAR(512) COMMENT '回滚原因',
    status VARCHAR(32) DEFAULT 'success' COMMENT '回滚状态',
    details JSON COMMENT '回滚详情',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    KEY idx_app_id (app_id),
    KEY idx_namespace (namespace),
    KEY idx_task_id (task_id),
    KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='回滚记录表';

-- 配置变更明细表
CREATE TABLE IF NOT EXISTS config_change_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    app_id VARCHAR(128) NOT NULL COMMENT '应用ID',
    namespace VARCHAR(128) NOT NULL COMMENT '命名空间',
    version INT NOT NULL COMMENT '版本号',
    key_path VARCHAR(256) NOT NULL COMMENT '配置项路径',
    change_type VARCHAR(16) NOT NULL COMMENT '变更类型: added/removed/modified',
    old_value TEXT COMMENT '旧值',
    new_value TEXT COMMENT '新值',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    KEY idx_app_id (app_id),
    KEY idx_namespace (namespace),
    KEY idx_version (version),
    KEY idx_key_path (key_path)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='配置变更明细表';

-- 插入示例数据
INSERT INTO config_versions (app_id, namespace, version, config_data, config_hash, change_type, description, operator) VALUES
('demo-app', 'application', 1, '{"app":{"name":"demo","version":"1.0.0"},"server":{"port":8080}}', 'abc123', 'create', '初始化配置', 'admin'),
('demo-app', 'application', 2, '{"app":{"name":"demo","version":"1.0.1"},"server":{"port":8080,"timeout":30}}', 'def456', 'update', '新增timeout配置', 'admin'),
('demo-app', 'application', 3, '{"app":{"name":"demo","version":"1.1.0"},"server":{"port":9090,"timeout":60},"database":{"host":"localhost"}}', 'ghi789', 'update', '版本升级，调整端口', 'admin');
