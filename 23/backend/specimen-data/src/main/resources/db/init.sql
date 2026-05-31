-- 创建数据库
CREATE DATABASE IF NOT EXISTS specimen_data DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE specimen_data;

-- 标本表
DROP TABLE IF EXISTS specimen;
CREATE TABLE specimen (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    specimen_no VARCHAR(100) NOT NULL COMMENT '标本编号',
    name VARCHAR(200) NOT NULL COMMENT '标本名称',
    type TINYINT COMMENT '标本类型 1生物标本 2地质标本 3植物标本 4动物标本 5化石标本 6矿物标本 99其他',
    classification VARCHAR(200) COMMENT '分类学名',
    description TEXT COMMENT '描述',
    location VARCHAR(500) COMMENT '采集地点',
    longitude DECIMAL(10,7) COMMENT '经度',
    latitude DECIMAL(10,7) COMMENT '纬度',
    collector VARCHAR(100) COMMENT '采集人',
    collect_time DATETIME COMMENT '采集时间',
    storage_method VARCHAR(200) COMMENT '存储方式',
    status TINYINT DEFAULT 1 COMMENT '状态 0停用 1正常',
    tags JSON COMMENT '标签列表JSON格式',
    custom_fields JSON COMMENT '扩展字段JSON格式',
    file_id BIGINT COMMENT '关联存储文件ID',
    create_by BIGINT COMMENT '创建人',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_by BIGINT COMMENT '更新人',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT DEFAULT 0 COMMENT '逻辑删除 0未删除 1已删除',
    version INT DEFAULT 0 COMMENT '版本号',
    INDEX idx_tenant_id (tenant_id),
    INDEX idx_specimen_no (specimen_no),
    INDEX idx_type (type),
    INDEX idx_status (status),
    INDEX idx_create_time (create_time),
    INDEX idx_location (longitude, latitude)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='标本表';

-- 标本图表
DROP TABLE IF EXISTS specimen_image;
CREATE TABLE specimen_image (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    specimen_id BIGINT NOT NULL COMMENT '标本ID',
    file_id BIGINT COMMENT '存储文件ID',
    image_url VARCHAR(500) COMMENT '图片URL',
    image_type TINYINT DEFAULT 1 COMMENT '图片类型 1原图 2缩略图 3标注图',
    sort INT DEFAULT 0 COMMENT '排序',
    description VARCHAR(500) COMMENT '描述',
    create_by BIGINT COMMENT '创建人',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_by BIGINT COMMENT '更新人',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT DEFAULT 0 COMMENT '逻辑删除 0未删除 1已删除',
    version INT DEFAULT 0 COMMENT '版本号',
    INDEX idx_tenant_id (tenant_id),
    INDEX idx_specimen_id (specimen_id),
    INDEX idx_file_id (file_id),
    INDEX idx_image_type (image_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='标本图表';

-- 标本标注表
DROP TABLE IF EXISTS specimen_annotation;
CREATE TABLE specimen_annotation (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    specimen_id BIGINT NOT NULL COMMENT '标本ID',
    image_id BIGINT NOT NULL COMMENT '图片ID',
    annotation_type TINYINT NOT NULL COMMENT '标注类型 1矩形框 2多边形 3点标记 4圆形 5线条 6文字标注',
    label VARCHAR(200) COMMENT '标注标签',
    confidence DECIMAL(5,4) COMMENT '置信度',
    coordinates JSON NOT NULL COMMENT '坐标数据JSON格式',
    color VARCHAR(20) DEFAULT '#FF0000' COMMENT '标注颜色',
    note VARCHAR(500) COMMENT '备注',
    annotator_id BIGINT COMMENT '标注人ID',
    annotator_name VARCHAR(100) COMMENT '标注人姓名',
    annotation_time DATETIME COMMENT '标注时间',
    status TINYINT DEFAULT 1 COMMENT '状态 0无效 1有效',
    create_by BIGINT COMMENT '创建人',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_by BIGINT COMMENT '更新人',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT DEFAULT 0 COMMENT '逻辑删除 0未删除 1已删除',
    version INT DEFAULT 0 COMMENT '版本号',
    INDEX idx_tenant_id (tenant_id),
    INDEX idx_specimen_id (specimen_id),
    INDEX idx_image_id (image_id),
    INDEX idx_annotation_type (annotation_type),
    INDEX idx_label (label),
    INDEX idx_annotator_id (annotator_id),
    INDEX idx_annotation_time (annotation_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='标本标注表';

-- 标本标签表
DROP TABLE IF EXISTS specimen_tag;
CREATE TABLE specimen_tag (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    name VARCHAR(100) NOT NULL COMMENT '标签名称',
    color VARCHAR(20) DEFAULT '#1677ff' COMMENT '标签颜色',
    description VARCHAR(500) COMMENT '描述',
    count INT DEFAULT 0 COMMENT '使用次数',
    create_by BIGINT COMMENT '创建人',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_by BIGINT COMMENT '更新人',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT DEFAULT 0 COMMENT '逻辑删除 0未删除 1已删除',
    version INT DEFAULT 0 COMMENT '版本号',
    INDEX idx_tenant_id (tenant_id),
    INDEX idx_name (name),
    INDEX idx_count (count)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='标本标签表';

-- 坐标数据格式说明:
-- 1. 矩形: {"x": 100, "y": 100, "width": 200, "height": 150}
-- 2. 多边形: [{"x": 100, "y": 100}, {"x": 200, "y": 100}, {"x": 150, "y": 200}]
-- 3. 点: {"x": 100, "y": 100}
-- 4. 圆形: {"x": 100, "y": 100, "r": 50}
-- 5. 线条: [{"x": 100, "y": 100}, {"x": 200, "y": 100}, {"x": 150, "y": 200}]

-- 初始化示例标签数据
INSERT INTO specimen_tag (tenant_id, name, color, description, count, create_by, create_time) VALUES
(1, '重要标本', '#FF5722', '需要重点关注的标本', 0, 1, NOW()),
(1, '待鉴定', '#1677ff', '需要专家鉴定', 0, 1, NOW()),
(1, '已完成', '#52c41a', '标注已完成', 0, 1, NOW()),
(1, '需审核', '#faad14', '需要审核确认', 0, 1, NOW()),
(1, '模式标本', '#722ed1', '模式标本特别标记', 0, 1, NOW());

-- 初始化示例标本数据
INSERT INTO specimen (tenant_id, specimen_no, name, type, classification, description, location, longitude, latitude, collector, collect_time, storage_method, status, tags, custom_fields, file_id, create_by, create_time) VALUES
(1, 'SP20240001', '银杏叶片标本', 3, 'Ginkgo biloba L.', '银杏科银杏属落叶乔木，叶片扇形，秋季变黄。', '北京市海淀区香山', 116.1859, 39.9935, '张三', '2024-10-15 10:30:00', '腊叶标本', 1, '["重要标本","已完成"]', '{"海拔":"500m","生境":"山坡林缘"}', 1, 1, NOW()),
(1, 'SP20240002', '花岗岩标本', 2, 'Granite', '酸性侵入岩，主要由石英、长石和云母组成。', '河北省秦皇岛市山海关', 119.7513, 40.0012, '李四', '2024-09-20 14:00:00', '岩石标本盒', 1, '["待鉴定"]', '{"岩石类型":"岩浆岩","采集深度":"地表","重量":"2.5kg"}', 2, 1, NOW()),
(1, 'SP20240003', '蝴蝶标本', 1, 'Papilio xuthus', '鳞翅目凤蝶科，翅膀黄色带黑色斑纹。', '云南省大理市苍山', 100.2345, 25.6789, '王五', '2024-08-10 09:15:00', '展翅标本盒', 1, '["重要标本","需审核"]', '{"性别":"雄性","翅展":"95mm"}', 3, 1, NOW());

-- 初始化示例标本图片数据
INSERT INTO specimen_image (tenant_id, specimen_id, file_id, image_url, image_type, sort, description, create_by, create_time) VALUES
(1, 1, 1, '', 1, 1, '银杏叶片正面', 1, NOW()),
(1, 1, 2, '', 1, 2, '银杏叶片背面', 1, NOW()),
(1, 2, 3, '', 1, 1, '花岗岩标本全貌', 1, NOW()),
(1, 3, 4, '', 1, 1, '蝴蝶标本正面', 1, NOW());

-- 初始化示例标注数据
INSERT INTO specimen_annotation (tenant_id, specimen_id, image_id, annotation_type, label, confidence, coordinates, color, note, annotator_id, annotator_name, annotation_time, status, create_by, create_time) VALUES
(1, 1, 1, 1, '叶片', 0.9500, '{"x": 50, "y": 30, "width": 300, "height": 250}', '#1677ff', '完整叶片区域', 1, '管理员', NOW(), 1, 1, NOW()),
(1, 1, 1, 3, '叶脉', 0.8800, '{"x": 200, "y": 150}', '#FF5722', '叶脉交叉点', 1, '管理员', NOW(), 1, 1, NOW()),
(1, 3, 4, 2, '翅膀边缘', 0.9200, '[{"x": 50, "y": 100}, {"x": 150, "y": 50}, {"x": 250, "y": 100}, {"x": 150, "y": 200}]', '#52c41a', '翅膀轮廓', 1, '管理员', NOW(), 1, 1, NOW()),
(1, 3, 4, 4, '身体', 0.9800, '{"x": 150, "y": 125, "r": 30}', '#faad14', '蝴蝶身体', 1, '管理员', NOW(), 1, 1, NOW());
