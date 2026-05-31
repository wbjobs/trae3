-- 图片转换记录表
CREATE TABLE IF NOT EXISTS t_image_conversion_record (
    id BIGINT NOT NULL COMMENT '主键ID(雪花算法)',
    project_id BIGINT DEFAULT NULL COMMENT '项目ID',
    source_file_id VARCHAR(64) DEFAULT NULL COMMENT '源文件ID',
    target_file_id VARCHAR(64) DEFAULT NULL COMMENT '目标文件ID',
    source_format VARCHAR(32) DEFAULT NULL COMMENT '源格式',
    target_format VARCHAR(32) DEFAULT NULL COMMENT '目标格式',
    source_size BIGINT DEFAULT NULL COMMENT '源文件大小(字节)',
    target_size BIGINT DEFAULT NULL COMMENT '目标文件大小(字节)',
    quality FLOAT DEFAULT NULL COMMENT '压缩质量(0.0-1.0)',
    width INT DEFAULT NULL COMMENT '图片宽度',
    height INT DEFAULT NULL COMMENT '图片高度',
    conversion_time DATETIME DEFAULT NULL COMMENT '转换时间',
    status TINYINT DEFAULT 1 COMMENT '状态：0失败，1成功',
    deleted TINYINT DEFAULT 0 COMMENT '逻辑删除：0未删除，1已删除',
    PRIMARY KEY (id),
    KEY idx_project_id (project_id),
    KEY idx_source_file_id (source_file_id),
    KEY idx_target_file_id (target_file_id),
    KEY idx_conversion_time (conversion_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='图片转换记录表';
