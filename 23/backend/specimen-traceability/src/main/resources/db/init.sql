-- 创建数据库
CREATE DATABASE IF NOT EXISTS specimen_traceability DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE specimen_traceability;

-- 溯源记录表
DROP TABLE IF EXISTS traceability_record;
CREATE TABLE traceability_record (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    specimen_id BIGINT NOT NULL COMMENT '标本ID',
    operation_type TINYINT NOT NULL COMMENT '操作类型 1创建 2编辑 3标注 4审核 5借出 6归还 7销毁',
    operator_id BIGINT NOT NULL COMMENT '操作人ID',
    operator_name VARCHAR(50) NOT NULL COMMENT '操作人姓名',
    operation_time DATETIME NOT NULL COMMENT '操作时间',
    location VARCHAR(255) COMMENT '操作地点',
    remark VARCHAR(500) COMMENT '备注',
    before_data JSON COMMENT '操作前数据(JSON)',
    after_data JSON COMMENT '操作后数据(JSON)',
    ip_address VARCHAR(50) COMMENT 'IP地址',
    user_agent VARCHAR(500) COMMENT '用户代理',
    create_by BIGINT COMMENT '创建人',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_by BIGINT COMMENT '更新人',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT DEFAULT 0 COMMENT '逻辑删除 0未删除 1已删除',
    version INT DEFAULT 0 COMMENT '版本号',
    INDEX idx_tenant_id (tenant_id),
    INDEX idx_specimen_id (specimen_id),
    INDEX idx_operation_type (operation_type),
    INDEX idx_operator_id (operator_id),
    INDEX idx_operation_time (operation_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='溯源记录表';

-- 溯源索引表
DROP TABLE IF EXISTS traceability_index;
CREATE TABLE traceability_index (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    specimen_id BIGINT NOT NULL COMMENT '标本ID',
    index_type VARCHAR(50) NOT NULL COMMENT '索引类型',
    index_value VARCHAR(255) NOT NULL COMMENT '索引值',
    weight INT DEFAULT 1 COMMENT '权重',
    create_by BIGINT COMMENT '创建人',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_by BIGINT COMMENT '更新人',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT DEFAULT 0 COMMENT '逻辑删除 0未删除 1已删除',
    version INT DEFAULT 0 COMMENT '版本号',
    INDEX idx_tenant_id (tenant_id),
    INDEX idx_specimen_id (specimen_id),
    INDEX idx_index_type (index_type),
    INDEX idx_index_value (index_value)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='溯源索引表';

-- 溯源二维码表
DROP TABLE IF EXISTS traceability_qrcode;
CREATE TABLE traceability_qrcode (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    specimen_id BIGINT NOT NULL COMMENT '标本ID',
    qr_code_url VARCHAR(255) COMMENT '二维码访问URL',
    qr_code_content VARCHAR(255) NOT NULL COMMENT '二维码内容',
    scan_count INT DEFAULT 0 COMMENT '扫码次数',
    last_scan_time DATETIME COMMENT '最后扫码时间',
    expire_time DATETIME COMMENT '过期时间',
    status TINYINT DEFAULT 1 COMMENT '状态 0禁用 1启用',
    create_by BIGINT COMMENT '创建人',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_by BIGINT COMMENT '更新人',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT DEFAULT 0 COMMENT '逻辑删除 0未删除 1已删除',
    version INT DEFAULT 0 COMMENT '版本号',
    INDEX idx_tenant_id (tenant_id),
    INDEX idx_specimen_id (specimen_id),
    INDEX idx_qr_code_content (qr_code_content),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='溯源二维码表';

-- 初始化测试数据
INSERT INTO traceability_record (tenant_id, specimen_id, operation_type, operator_id, operator_name, operation_time, location, remark, ip_address, user_agent) VALUES
(1, 1, 1, 1, '张教授', '2024-01-20 10:30:00', '长白山自然保护区', '创建东北虎标本记录', '192.168.1.100', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'),
(1, 1, 2, 2, '李研究员', '2024-01-25 14:20:00', '标本馆A区', '更新标本描述信息', '192.168.1.101', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'),
(1, 1, 3, 3, '王标注员', '2024-02-01 09:15:00', '标注室', '完成头部和身体标注', '192.168.1.102', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15'),
(1, 1, 4, 4, '赵审核员', '2024-02-05 16:45:00', '审核室', '审核通过，标注质量良好', '192.168.1.103', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'),
(1, 2, 1, 1, '张教授', '2024-02-10 11:00:00', '西双版纳热带雨林', '创建亚洲象标本记录', '192.168.1.100', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

INSERT INTO traceability_qrcode (tenant_id, specimen_id, qr_code_url, qr_code_content, scan_count, status) VALUES
(1, 1, '/traceability/qrcode/image/1', 'a1b2c3d4e5f6_1', 15, 1),
(1, 2, '/traceability/qrcode/image/2', 'f6e5d4c3b2a1_2', 8, 1);
