-- 创建数据库
CREATE DATABASE IF NOT EXISTS smart_meter DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE smart_meter;

-- 仪表数据表
CREATE TABLE IF NOT EXISTS meter_data (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    meter_id VARCHAR(64) NOT NULL COMMENT '仪表ID',
    protocol_type VARCHAR(32) NOT NULL COMMENT '协议类型: DL/T645, CJ/T188',
    data_type VARCHAR(64) NOT NULL COMMENT '数据类型: VOLTAGE, CURRENT, POWER, ENERGY, HEAT, FLOW, TEMP等',
    value DECIMAL(20,6) NOT NULL COMMENT '数值',
    unit VARCHAR(16) DEFAULT NULL COMMENT '单位',
    collect_time DATETIME NOT NULL COMMENT '采集时间',
    raw_data TEXT COMMENT '原始十六进制数据',
    parsed_data TEXT COMMENT '解析后的附加数据(JSON)',
    forward_status VARCHAR(16) DEFAULT 'PENDING' COMMENT '转发状态: PENDING, SUCCESS, FAILED',
    forward_time DATETIME DEFAULT NULL COMMENT '转发成功时间',
    retry_count INT DEFAULT 0 COMMENT '转发重试次数',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_meter_id (meter_id),
    INDEX idx_collect_time (collect_time),
    INDEX idx_forward_status (forward_status),
    INDEX idx_meter_collect (meter_id, collect_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='仪表数据表';

-- 仪表设备表
CREATE TABLE IF NOT EXISTS meter_device (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    meter_id VARCHAR(64) NOT NULL UNIQUE COMMENT '仪表ID',
    protocol_type VARCHAR(32) NOT NULL COMMENT '协议类型',
    device_type VARCHAR(32) DEFAULT NULL COMMENT '设备类型',
    manufacturer VARCHAR(64) DEFAULT NULL COMMENT '生产厂商',
    model VARCHAR(64) DEFAULT NULL COMMENT '型号',
    install_location VARCHAR(255) DEFAULT NULL COMMENT '安装位置',
    status TINYINT DEFAULT 1 COMMENT '状态: 0-离线, 1-在线',
    last_online_time DATETIME DEFAULT NULL COMMENT '最后在线时间',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_meter_id (meter_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='仪表设备表';

-- 系统用户表（可选，用于扩展用户管理）
CREATE TABLE IF NOT EXISTS sys_user (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    username VARCHAR(64) NOT NULL UNIQUE COMMENT '用户名',
    password VARCHAR(128) NOT NULL COMMENT '密码',
    nickname VARCHAR(64) DEFAULT NULL COMMENT '昵称',
    email VARCHAR(128) DEFAULT NULL COMMENT '邮箱',
    mobile VARCHAR(32) DEFAULT NULL COMMENT '手机号',
    status TINYINT DEFAULT 1 COMMENT '状态: 0-禁用, 1-启用',
    roles VARCHAR(255) DEFAULT 'USER' COMMENT '角色列表，逗号分隔',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统用户表';

-- 插入默认用户
INSERT IGNORE INTO sys_user (username, password, nickname, roles) VALUES
('admin', 'admin123', '系统管理员', 'ADMIN,USER,API'),
('user', 'user123', '普通用户', 'USER'),
('api', 'api123', 'API调用用户', 'API');

-- 创建转发失败重试的存储过程
DELIMITER //
CREATE PROCEDURE reset_failed_forward()
BEGIN
    UPDATE meter_data 
    SET forward_status = 'PENDING', retry_count = 0
    WHERE forward_status = 'FAILED' AND retry_count >= 3;
END //
DELIMITER ;

-- 授予权限
GRANT ALL PRIVILEGES ON smart_meter.* TO 'smartmeter'@'%' IDENTIFIED BY 'smartmeter123';
FLUSH PRIVILEGES;
