-- 创建数据库
CREATE DATABASE IF NOT EXISTS specimen_auth DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE specimen_auth;

-- 租户表
DROP TABLE IF EXISTS sys_tenant;
CREATE TABLE sys_tenant (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    name VARCHAR(100) NOT NULL COMMENT '租户名称',
    code VARCHAR(50) NOT NULL UNIQUE COMMENT '租户编码',
    status TINYINT DEFAULT 1 COMMENT '状态 0禁用 1启用',
    expire_time DATETIME COMMENT '过期时间',
    contact_name VARCHAR(50) COMMENT '联系人姓名',
    contact_phone VARCHAR(20) COMMENT '联系电话',
    create_by BIGINT COMMENT '创建人',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_by BIGINT COMMENT '更新人',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT DEFAULT 0 COMMENT '逻辑删除 0未删除 1已删除',
    version INT DEFAULT 0 COMMENT '版本号'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='租户表';

-- 用户表
DROP TABLE IF EXISTS sys_user;
CREATE TABLE sys_user (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    username VARCHAR(50) NOT NULL COMMENT '用户名',
    password VARCHAR(255) NOT NULL COMMENT '密码',
    nickname VARCHAR(50) COMMENT '昵称',
    email VARCHAR(100) COMMENT '邮箱',
    phone VARCHAR(20) COMMENT '手机号',
    avatar VARCHAR(255) COMMENT '头像',
    status TINYINT DEFAULT 1 COMMENT '状态 0禁用 1启用',
    role_ids VARCHAR(255) COMMENT '角色ID列表，逗号分隔',
    create_by BIGINT COMMENT '创建人',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_by BIGINT COMMENT '更新人',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT DEFAULT 0 COMMENT '逻辑删除 0未删除 1已删除',
    version INT DEFAULT 0 COMMENT '版本号',
    INDEX idx_tenant_id (tenant_id),
    INDEX idx_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- 角色表
DROP TABLE IF EXISTS sys_role;
CREATE TABLE sys_role (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    name VARCHAR(50) NOT NULL COMMENT '角色名称',
    code VARCHAR(50) NOT NULL COMMENT '角色编码',
    description VARCHAR(255) COMMENT '角色描述',
    status TINYINT DEFAULT 1 COMMENT '状态 0禁用 1启用',
    create_by BIGINT COMMENT '创建人',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_by BIGINT COMMENT '更新人',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT DEFAULT 0 COMMENT '逻辑删除 0未删除 1已删除',
    version INT DEFAULT 0 COMMENT '版本号',
    INDEX idx_tenant_id (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色表';

-- 权限表
DROP TABLE IF EXISTS sys_permission;
CREATE TABLE sys_permission (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    name VARCHAR(50) NOT NULL COMMENT '权限名称',
    code VARCHAR(100) NOT NULL COMMENT '权限编码',
    type TINYINT DEFAULT 1 COMMENT '类型 1菜单 2按钮',
    parent_id BIGINT DEFAULT 0 COMMENT '父级ID',
    path VARCHAR(255) COMMENT '路由路径',
    component VARCHAR(255) COMMENT '组件路径',
    icon VARCHAR(50) COMMENT '图标',
    sort INT DEFAULT 0 COMMENT '排序',
    create_by BIGINT COMMENT '创建人',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_by BIGINT COMMENT '更新人',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT DEFAULT 0 COMMENT '逻辑删除 0未删除 1已删除',
    version INT DEFAULT 0 COMMENT '版本号',
    INDEX idx_tenant_id (tenant_id),
    INDEX idx_parent_id (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='权限表';

-- 初始化默认租户
INSERT INTO sys_tenant (id, name, code, status, contact_name, contact_phone, create_by, create_time)
VALUES (1, '默认租户', 'DEFAULT', 1, '管理员', '13800138000', 1, NOW());

-- 初始化管理员角色
INSERT INTO sys_role (id, tenant_id, name, code, description, status, create_by, create_time)
VALUES (1, 1, '超级管理员', 'SUPER_ADMIN', '拥有所有权限', 1, 1, NOW());

-- 初始化管理员用户 (密码: admin123)
INSERT INTO sys_user (id, tenant_id, username, password, nickname, email, phone, status, role_ids, create_by, create_time)
VALUES (1, 1, 'admin', '$2a$10$7JB720yubVSZvUI0rEqK/.VqGOZTH.ulu33dHOiBE8ByOhJIrdAu2', '系统管理员', 'admin@specimen.com', '13800138000', 1, '1', 1, NOW());

-- 初始化默认菜单权限
INSERT INTO sys_permission (id, tenant_id, name, code, type, parent_id, path, component, icon, sort, create_by, create_time) VALUES
(1, 1, '系统管理', 'system', 1, 0, '/system', 'Layout', 'setting', 1, 1, NOW()),
(2, 1, '用户管理', 'system:user', 1, 1, '/system/user', 'system/user/index', 'user', 1, 1, NOW()),
(3, 1, '角色管理', 'system:role', 1, 1, '/system/role', 'system/role/index', 'role', 2, 1, NOW()),
(4, 1, '权限管理', 'system:permission', 1, 1, '/system/permission', 'system/permission/index', 'permission', 3, 1, NOW()),
(5, 1, '租户管理', 'system:tenant', 1, 1, '/system/tenant', 'system/tenant/index', 'tenant', 4, 1, NOW()),
(6, 1, '用户新增', 'system:user:add', 2, 2, NULL, NULL, NULL, 1, 1, NOW()),
(7, 1, '用户编辑', 'system:user:edit', 2, 2, NULL, NULL, NULL, 2, 1, NOW()),
(8, 1, '用户删除', 'system:user:delete', 2, 2, NULL, NULL, NULL, 3, 1, NOW()),
(9, 1, '角色新增', 'system:role:add', 2, 3, NULL, NULL, NULL, 1, 1, NOW()),
(10, 1, '角色编辑', 'system:role:edit', 2, 3, NULL, NULL, NULL, 2, 1, NOW()),
(11, 1, '角色删除', 'system:role:delete', 2, 3, NULL, NULL, NULL, 3, 1, NOW());
