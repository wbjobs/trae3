CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS devices (
  id SERIAL PRIMARY KEY,
  device_id VARCHAR(64) UNIQUE NOT NULL,
  device_type VARCHAR(32) NOT NULL,
  name VARCHAR(128) NOT NULL,
  location VARCHAR(256),
  ip_address VARCHAR(45),
  mac_address VARCHAR(17),
  status VARCHAR(32) DEFAULT 'offline',
  parent_device_id VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devices_device_id ON devices(device_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_type ON devices(device_type);
CREATE INDEX IF NOT EXISTS idx_devices_parent ON devices(parent_device_id);

CREATE TABLE IF NOT EXISTS signal_data (
  time TIMESTAMPTZ NOT NULL,
  device_id VARCHAR(64) NOT NULL,
  signal_strength INTEGER,
  snr INTEGER,
  channel INTEGER,
  bandwidth INTEGER,
  connected_clients INTEGER,
  cpu_usage REAL,
  memory_usage REAL,
  temperature REAL,
  status VARCHAR(32)
);

SELECT create_hypertable('signal_data', 'time', if_not_exists => TRUE, chunk_time_interval => INTERVAL '1 hour');

CREATE INDEX IF NOT EXISTS idx_signal_data_device_time ON signal_data(device_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_signal_data_time ON signal_data(time DESC);
CREATE INDEX IF NOT EXISTS idx_signal_data_status ON signal_data(status, time DESC);

CREATE TABLE IF NOT EXISTS topology_links (
  id SERIAL PRIMARY KEY,
  source_device_id VARCHAR(64) NOT NULL,
  target_device_id VARCHAR(64) NOT NULL,
  link_type VARCHAR(32) DEFAULT 'wireless',
  quality INTEGER DEFAULT 100,
  status VARCHAR(32) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_device_id, target_device_id)
);

CREATE INDEX IF NOT EXISTS idx_topology_links_source ON topology_links(source_device_id);
CREATE INDEX IF NOT EXISTS idx_topology_links_target ON topology_links(target_device_id);
CREATE INDEX IF NOT EXISTS idx_topology_links_status ON topology_links(status);

CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,
  alert_id VARCHAR(64) UNIQUE NOT NULL,
  device_id VARCHAR(64) NOT NULL,
  alert_type VARCHAR(64) NOT NULL,
  severity VARCHAR(32) NOT NULL,
  message TEXT,
  status VARCHAR(32) DEFAULT 'active',
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alerts_device_id ON alerts(device_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_alerts_device_type ON alerts(device_id, alert_type) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS strategies (
  id SERIAL PRIMARY KEY,
  strategy_id VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  trigger_condition JSONB NOT NULL,
  actions JSONB NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_strategies_enabled ON strategies(enabled) WHERE enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_strategies_trigger ON strategies USING gin (trigger_condition);
CREATE INDEX IF NOT EXISTS idx_strategies_actions ON strategies USING gin (actions);

CREATE TABLE IF NOT EXISTS strategy_executions (
  id SERIAL PRIMARY KEY,
  execution_id VARCHAR(64) UNIQUE NOT NULL,
  strategy_id VARCHAR(64) NOT NULL,
  trigger_data JSONB,
  execution_result JSONB,
  status VARCHAR(32) DEFAULT 'success',
  executed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_strategy_executions_strategy ON strategy_executions(strategy_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_strategy_executions_status ON strategy_executions(status, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_strategy_executions_time ON strategy_executions(executed_at DESC);

INSERT INTO devices (device_id, device_type, name, location, status, parent_device_id) VALUES
('ap-core-001', 'ap', '核心AP-01', '厂房A-1F-机房', 'online', NULL),
('ap-core-002', 'ap', '核心AP-02', '厂房A-2F-机房', 'online', NULL),
('repeater-001', 'repeater', '中继节点-01', '厂房A-1F-东区', 'online', 'ap-core-001'),
('repeater-002', 'repeater', '中继节点-02', '厂房A-1F-西区', 'online', 'ap-core-001'),
('repeater-003', 'repeater', '中继节点-03', '厂房A-2F-东区', 'online', 'ap-core-002'),
('repeater-004', 'repeater', '中继节点-04', '厂房A-2F-西区', 'online', 'ap-core-002'),
('end-device-001', 'endpoint', '终端设备-001', '生产线A1', 'online', 'repeater-001'),
('end-device-002', 'endpoint', '终端设备-002', '生产线A2', 'online', 'repeater-001'),
('end-device-003', 'endpoint', '终端设备-003', '生产线B1', 'online', 'repeater-002'),
('end-device-004', 'endpoint', '终端设备-004', '生产线B2', 'offline', 'repeater-002');

INSERT INTO topology_links (source_device_id, target_device_id, link_type, quality) VALUES
('ap-core-001', 'repeater-001', 'wireless', 95),
('ap-core-001', 'repeater-002', 'wireless', 88),
('ap-core-002', 'repeater-003', 'wireless', 92),
('ap-core-002', 'repeater-004', 'wireless', 90),
('repeater-001', 'end-device-001', 'wireless', 85),
('repeater-001', 'end-device-002', 'wireless', 82),
('repeater-002', 'end-device-003', 'wireless', 88),
('repeater-002', 'end-device-004', 'wireless', 45);

INSERT INTO strategies (strategy_id, name, description, trigger_condition, actions) VALUES
('str-001', '信号弱告警', '当设备信号强度低于-75dBm时触发告警',
 '{"metric": "signal_strength", "operator": "lt", "threshold": -75, "duration": 60}',
 '[{"type": "alert", "severity": "warning", "message": "设备信号强度过低"}]'),
('str-002', '设备离线告警', '当设备离线超过5分钟时触发告警',
 '{"metric": "status", "operator": "eq", "value": "offline", "duration": 300}',
 '[{"type": "alert", "severity": "critical", "message": "设备离线"}]'),
('str-003', '高CPU负载告警', '当设备CPU使用率超过80%时触发告警',
 '{"metric": "cpu_usage", "operator": "gt", "threshold": 80, "duration": 120}',
 '[{"type": "alert", "severity": "warning", "message": "设备CPU负载过高"}]');
