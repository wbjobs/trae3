-- =============================================
-- 古籍数字化勘校平台 数据库初始化脚本
-- 数据库: ancient_platform
-- 字符集: utf8mb4
-- =============================================

CREATE DATABASE IF NOT EXISTS `ancient_platform` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `ancient_platform`;

-- =============================================
-- 1. 用户表
-- =============================================
DROP TABLE IF EXISTS `sys_user`;
CREATE TABLE `sys_user` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `username` VARCHAR(50) NOT NULL COMMENT '用户名',
    `password` VARCHAR(100) NOT NULL COMMENT '密码(加密)',
    `nickname` VARCHAR(50) DEFAULT NULL COMMENT '昵称',
    `email` VARCHAR(100) DEFAULT NULL COMMENT '邮箱',
    `phone` VARCHAR(20) DEFAULT NULL COMMENT '手机号',
    `avatar` VARCHAR(255) DEFAULT NULL COMMENT '头像地址',
    `status` TINYINT DEFAULT 1 COMMENT '状态: 0-禁用, 1-启用',
    `deleted` TINYINT DEFAULT 0 COMMENT '删除标记: 0-未删除, 1-已删除',
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_username` (`username`),
    KEY `idx_email` (`email`),
    KEY `idx_phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- =============================================
-- 2. 角色表
-- =============================================
DROP TABLE IF EXISTS `sys_role`;
CREATE TABLE `sys_role` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `role_name` VARCHAR(50) NOT NULL COMMENT '角色名称',
    `role_code` VARCHAR(50) NOT NULL COMMENT '角色编码',
    `description` VARCHAR(200) DEFAULT NULL COMMENT '角色描述',
    `status` TINYINT DEFAULT 1 COMMENT '状态: 0-禁用, 1-启用',
    `deleted` TINYINT DEFAULT 0 COMMENT '删除标记: 0-未删除, 1-已删除',
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_role_code` (`role_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色表';

-- =============================================
-- 3. 权限表
-- =============================================
DROP TABLE IF EXISTS `sys_permission`;
CREATE TABLE `sys_permission` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `permission_name` VARCHAR(50) NOT NULL COMMENT '权限名称',
    `permission_code` VARCHAR(100) NOT NULL COMMENT '权限编码',
    `type` TINYINT DEFAULT 1 COMMENT '权限类型: 1-菜单, 2-按钮, 3-接口',
    `parent_id` BIGINT DEFAULT 0 COMMENT '父级ID',
    `path` VARCHAR(200) DEFAULT NULL COMMENT '路由路径',
    `icon` VARCHAR(50) DEFAULT NULL COMMENT '图标',
    `sort` INT DEFAULT 0 COMMENT '排序',
    `description` VARCHAR(200) DEFAULT NULL COMMENT '权限描述',
    `deleted` TINYINT DEFAULT 0 COMMENT '删除标记: 0-未删除, 1-已删除',
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_permission_code` (`permission_code`),
    KEY `idx_parent_id` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='权限表';

-- =============================================
-- 4. 用户角色关联表
-- =============================================
DROP TABLE IF EXISTS `sys_user_role`;
CREATE TABLE `sys_user_role` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `user_id` BIGINT NOT NULL COMMENT '用户ID',
    `role_id` BIGINT NOT NULL COMMENT '角色ID',
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_user_role` (`user_id`, `role_id`),
    KEY `idx_user_id` (`user_id`),
    KEY `idx_role_id` (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户角色关联表';

-- =============================================
-- 5. 角色权限关联表
-- =============================================
DROP TABLE IF EXISTS `sys_role_permission`;
CREATE TABLE `sys_role_permission` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `role_id` BIGINT NOT NULL COMMENT '角色ID',
    `permission_id` BIGINT NOT NULL COMMENT '权限ID',
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_role_permission` (`role_id`, `permission_id`),
    KEY `idx_role_id` (`role_id`),
    KEY `idx_permission_id` (`permission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色权限关联表';

-- =============================================
-- 6. 项目表
-- =============================================
DROP TABLE IF EXISTS `biz_project`;
CREATE TABLE `biz_project` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `project_name` VARCHAR(100) NOT NULL COMMENT '项目名称',
    `project_code` VARCHAR(50) NOT NULL COMMENT '项目编码',
    `description` TEXT COMMENT '项目描述',
    `cover_image` VARCHAR(255) DEFAULT NULL COMMENT '封面图片',
    `dynasty` VARCHAR(50) DEFAULT NULL COMMENT '朝代',
    `author` VARCHAR(50) DEFAULT NULL COMMENT '作者',
    `total_pages` INT DEFAULT 0 COMMENT '总页数',
    `status` TINYINT DEFAULT 0 COMMENT '项目状态: 0-待开始, 1-进行中, 2-已完成, 3-已暂停',
    `progress` DECIMAL(5,2) DEFAULT 0.00 COMMENT '进度百分比',
    `create_user_id` BIGINT NOT NULL COMMENT '创建人ID',
    `deleted` TINYINT DEFAULT 0 COMMENT '删除标记: 0-未删除, 1-已删除',
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_project_code` (`project_code`),
    KEY `idx_project_name` (`project_name`),
    KEY `idx_status` (`status`),
    KEY `idx_create_user_id` (`create_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='项目表';

-- =============================================
-- 7. 书页表
-- =============================================
DROP TABLE IF EXISTS `biz_page`;
CREATE TABLE `biz_page` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `project_id` BIGINT NOT NULL COMMENT '项目ID',
    `page_no` INT NOT NULL COMMENT '页码',
    `page_name` VARCHAR(100) DEFAULT NULL COMMENT '书页名称',
    `original_image` VARCHAR(255) NOT NULL COMMENT '原始图片地址',
    `processed_image` VARCHAR(255) DEFAULT NULL COMMENT '处理后图片地址',
    `content_text` TEXT COMMENT '识别文字内容',
    `corrected_text` TEXT COMMENT '勘校后文字内容',
    `status` TINYINT DEFAULT 0 COMMENT '状态: 0-待处理, 1-已识别, 2-勘校中, 3-已完成',
    `ocr_result` JSON DEFAULT NULL COMMENT 'OCR识别结果JSON',
    `annotations` JSON DEFAULT NULL COMMENT '标注信息JSON',
    `check_user_id` BIGINT DEFAULT NULL COMMENT '勘校人ID',
    `check_time` DATETIME DEFAULT NULL COMMENT '勘校时间',
    `deleted` TINYINT DEFAULT 0 COMMENT '删除标记: 0-未删除, 1-已删除',
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_project_page` (`project_id`, `page_no`),
    KEY `idx_project_id` (`project_id`),
    KEY `idx_status` (`status`),
    KEY `idx_check_user_id` (`check_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='书页表';

-- =============================================
-- 8. 勘校记录表
-- =============================================
DROP TABLE IF EXISTS `biz_correction`;
CREATE TABLE `biz_correction` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `project_id` BIGINT NOT NULL COMMENT '项目ID',
    `page_id` BIGINT NOT NULL COMMENT '书页ID',
    `user_id` BIGINT NOT NULL COMMENT '操作人ID',
    `operation_type` TINYINT NOT NULL COMMENT '操作类型: 1-修改文字, 2-添加标注, 3-删除标注, 4-修改标注, 5-状态变更',
    `original_content` TEXT COMMENT '原始内容',
    `corrected_content` TEXT COMMENT '修正后内容',
    `annotation_id` BIGINT DEFAULT NULL COMMENT '标注ID',
    `remark` VARCHAR(500) DEFAULT NULL COMMENT '备注',
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`),
    KEY `idx_project_id` (`project_id`),
    KEY `idx_page_id` (`page_id`),
    KEY `idx_user_id` (`user_id`),
    KEY `idx_operation_type` (`operation_type`),
    KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='勘校记录表';

-- =============================================
-- 9. 文件信息表
-- =============================================
DROP TABLE IF EXISTS `biz_file`;
CREATE TABLE `biz_file` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `file_name` VARCHAR(255) NOT NULL COMMENT '文件名称',
    `original_name` VARCHAR(255) NOT NULL COMMENT '原始文件名',
    `file_path` VARCHAR(500) NOT NULL COMMENT '文件存储路径',
    `file_url` VARCHAR(500) NOT NULL COMMENT '文件访问URL',
    `file_size` BIGINT NOT NULL COMMENT '文件大小(字节)',
    `file_type` VARCHAR(50) DEFAULT NULL COMMENT '文件类型',
    `mime_type` VARCHAR(100) DEFAULT NULL COMMENT 'MIME类型',
    `md5` VARCHAR(32) DEFAULT NULL COMMENT 'MD5值',
    `bucket` VARCHAR(100) DEFAULT NULL COMMENT '存储桶',
    `storage_type` TINYINT DEFAULT 1 COMMENT '存储类型: 1-本地, 2-MinIO, 3-OSS',
    `business_type` VARCHAR(50) DEFAULT NULL COMMENT '业务类型',
    `business_id` BIGINT DEFAULT NULL COMMENT '业务ID',
    `create_user_id` BIGINT DEFAULT NULL COMMENT '上传人ID',
    `deleted` TINYINT DEFAULT 0 COMMENT '删除标记: 0-未删除, 1-已删除',
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    KEY `idx_md5` (`md5`),
    KEY `idx_business` (`business_type`, `business_id`),
    KEY `idx_create_user_id` (`create_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文件信息表';

-- =============================================
-- 初始化数据
-- =============================================

-- 初始化角色数据
INSERT INTO `sys_role` (`role_name`, `role_code`, `description`) VALUES
('超级管理员', 'ROLE_SUPER_ADMIN', '拥有所有权限'),
('管理员', 'ROLE_ADMIN', '系统管理员'),
('勘校员', 'ROLE_PROOFREADER', '负责古籍勘校工作'),
('普通用户', 'ROLE_USER', '普通用户');

-- 初始化权限数据
INSERT INTO `sys_permission` (`permission_name`, `permission_code`, `type`, `parent_id`, `path`, `icon`, `sort`) VALUES
('系统管理', 'system', 1, 0, '/system', 'setting', 1),
('用户管理', 'system:user', 1, 1, '/system/user', 'user', 1),
('用户列表', 'system:user:list', 2, 2, NULL, NULL, 1),
('新增用户', 'system:user:add', 2, 2, NULL, NULL, 2),
('编辑用户', 'system:user:edit', 2, 2, NULL, NULL, 3),
('删除用户', 'system:user:delete', 2, 2, NULL, NULL, 4),
('角色管理', 'system:role', 1, 1, '/system/role', 'team', 2),
('权限管理', 'system:permission', 1, 1, '/system/permission', 'key', 3),
('项目管理', 'project', 1, 0, '/project', 'book', 2),
('项目列表', 'project:list', 2, 9, NULL, NULL, 1),
('创建项目', 'project:create', 2, 9, NULL, NULL, 2),
('编辑项目', 'project:edit', 2, 9, NULL, NULL, 3),
('删除项目', 'project:delete', 2, 9, NULL, NULL, 4),
('勘校工作', 'proofread', 1, 0, '/proofread', 'edit', 3),
('我的勘校', 'proofread:my', 1, 14, '/proofread/my', 'edit', 1),
('文件管理', 'file', 1, 0, '/file', 'folder', 4),
('文件列表', 'file:list', 2, 16, NULL, NULL, 1),
('文件上传', 'file:upload', 2, 16, NULL, NULL, 2),
('文件删除', 'file:delete', 2, 16, NULL, NULL, 3);

-- 初始化管理员用户 (密码: admin123, 需要BCrypt加密)
INSERT INTO `sys_user` (`username`, `password`, `nickname`, `email`) VALUES
('admin', '$2a$10$7JB720yubVSZvUI0rEqK/.VqGOZTH.ulu33dHOiBE8ByOhJIrdAu2', '系统管理员', 'admin@ancient.com');

-- 分配角色
INSERT INTO `sys_user_role` (`user_id`, `role_id`) VALUES (1, 1);

-- 超级管理员拥有所有权限
INSERT INTO `sys_role_permission` (`role_id`, `permission_id`)
SELECT 1, id FROM `sys_permission`;
