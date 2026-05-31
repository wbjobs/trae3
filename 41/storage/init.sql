CREATE TABLE IF NOT EXISTS nodes (
    node_id TEXT PRIMARY KEY,
    node_name TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    location TEXT,
    version TEXT,
    priority INTEGER DEFAULT 2,
    status TEXT NOT NULL DEFAULT 'offline',
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_report DATETIME
);

CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT NOT NULL,
    cpu_usage REAL NOT NULL,
    memory_usage REAL NOT NULL,
    disk_usage REAL NOT NULL,
    network_in REAL DEFAULT 0,
    network_out REAL DEFAULT 0,
    process_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES nodes(node_id)
);

CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT NOT NULL,
    alert_type TEXT NOT NULL,
    alert_level TEXT NOT NULL,
    message TEXT NOT NULL,
    severity INTEGER DEFAULT 1,
    escalation_count INTEGER DEFAULT 0,
    resolved BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    FOREIGN KEY (node_id) REFERENCES nodes(node_id)
);

CREATE TABLE IF NOT EXISTS status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT NOT NULL,
    status TEXT NOT NULL,
    old_status TEXT,
    changed_by TEXT DEFAULT 'system',
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES nodes(node_id)
);

CREATE INDEX IF NOT EXISTS idx_metrics_node_created ON metrics(node_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_created ON metrics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_node_created ON alerts(node_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_resolved_created ON alerts(resolved, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_status_history_node_created ON status_history(node_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_status_history_created ON status_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nodes_status ON nodes(status);
CREATE INDEX IF NOT EXISTS idx_nodes_priority ON nodes(priority);

INSERT OR IGNORE INTO nodes (node_id, node_name, ip_address, location, version, priority, status) VALUES
('node-001', '北京机房-节点1', '192.168.1.101', '北京机房-A区', 'v1.2.0', 1, 'offline'),
('node-002', '北京机房-节点2', '192.168.1.102', '北京机房-A区', 'v1.2.0', 1, 'offline'),
('node-003', '上海机房-节点1', '192.168.2.101', '上海机房-B区', 'v1.1.5', 2, 'offline'),
('node-004', '上海机房-节点2', '192.168.2.102', '上海机房-B区', 'v1.2.0', 2, 'offline'),
('node-005', '深圳机房-节点1', '192.168.3.101', '深圳机房-C区', 'v1.2.0', 3, 'offline');
