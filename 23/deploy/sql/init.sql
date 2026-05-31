CREATE DATABASE IF NOT EXISTS nacos_config DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

USE nacos_config;

CREATE TABLE IF NOT EXISTS config_info (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT 'id',
    data_id VARCHAR(255) NOT NULL COMMENT 'data_id',
    group_id VARCHAR(128) DEFAULT NULL,
    content LONGTEXT NOT NULL COMMENT 'content',
    md5 VARCHAR(32) DEFAULT NULL COMMENT 'md5',
    gmt_create DATETIME NOT NULL DEFAULT '2010-05-05 00:00:00' COMMENT '创建时间',
    gmt_modified DATETIME NOT NULL DEFAULT '2010-05-05 00:00:00' COMMENT '修改时间',
    src_user TEXT COMMENT 'source user',
    src_ip VARCHAR(20) DEFAULT NULL COMMENT 'source ip',
    app_name VARCHAR(128) DEFAULT NULL,
    tenant_id VARCHAR(128) DEFAULT '' COMMENT 'tenant_id',
    c_desc VARCHAR(256) DEFAULT NULL,
    c_use VARCHAR(64) DEFAULT NULL,
    effect VARCHAR(64) DEFAULT NULL,
    type VARCHAR(64) DEFAULT NULL,
    c_schema TEXT,
    PRIMARY KEY (id),
    UNIQUE KEY uk_configinfo_datagrouptenant (data_id,group_id,tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='config_info';

CREATE DATABASE IF NOT EXISTS specimen_auth DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS specimen_storage DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS specimen_data DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS specimen_traceability DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
