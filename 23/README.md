# 野外标本影像标注与溯源全栈平台

基于 React + SpringCloud + MinIO 构建的野外标本影像标注与溯源全栈平台，实现野外生物/地质标本影像在线标注、溯源信息录入、大影像文件分布式存储、团队协作管理。

## 🏗️ 系统架构

### 技术栈

**前端**
- React 18 + TypeScript
- Vite 5
- Ant Design 5
- Redux Toolkit
- Fabric.js (影像标注)
- React Router 6

**后端**
- Spring Boot 3.2
- Spring Cloud 2023.0.0
- Spring Cloud Alibaba 2023.0.1.0
- Nacos (服务注册与配置中心)
- Gateway (API网关)
- OpenFeign (服务间调用)
- MyBatis Plus 3.5.5
- JWT (认证授权)

**中间件**
- MySQL 8.0 (关系型数据库)
- Redis 7.2 (缓存)
- MinIO (分布式对象存储)
- Elasticsearch 8.11 (全文检索)
- RabbitMQ (消息队列)

### 模块划分

```
specimen-platform/
├── backend/
│   ├── specimen-common        # 公共模块（工具类、实体、配置）
│   ├── specimen-gateway       # 网关服务（路由、鉴权）
│   ├── specimen-auth          # 权限服务（用户、角色、权限、多租户）
│   ├── specimen-storage       # 存储服务（MinIO、大文件分片上传）
│   ├── specimen-data          # 标本数据服务（标本、标注、标签）
│   └── specimen-traceability  # 溯源索引服务（溯源链、ES检索、二维码）
├── frontend/                  # React前端应用
│   ├── src/
│   │   ├── api/               # API接口封装
│   │   ├── components/        # 公共组件
│   │   ├── pages/             # 页面组件
│   │   ├── router/            # 路由配置
│   │   ├── store/             # Redux状态管理
│   │   └── utils/             # 工具函数
└── deploy/                    # Docker部署配置
```

## 🚀 快速开始

### 环境要求

- JDK 17+
- Node.js 18+
- Docker & Docker Compose
- Maven 3.9+

### 本地开发启动

#### 1. 启动中间件

```bash
cd deploy
docker-compose up -d
```

启动的服务：
- MySQL: http://localhost:3306
- Redis: http://localhost:6379
- Nacos: http://localhost:8848/nacos (nacos/nacos)
- MinIO: http://localhost:9001 (minioadmin/minioadmin)
- Elasticsearch: http://localhost:9200
- RabbitMQ: http://localhost:15672 (admin/admin)

#### 2. 初始化数据库

执行各模块下的 SQL 初始化脚本：
- `backend/specimen-auth/src/main/resources/db/init.sql`
- `backend/specimen-storage/src/main/resources/db/init.sql`
- `backend/specimen-data/src/main/resources/db/init.sql`
- `backend/specimen-traceability/src/main/resources/db/init.sql`

#### 3. 启动后端服务

按顺序启动各微服务：
1. specimen-gateway (9999)
2. specimen-auth (9001)
3. specimen-storage (9002)
4. specimen-data (9003)
5. specimen-traceability (9004)

#### 4. 启动前端

```bash
cd frontend
npm install
npm run dev
```

访问: http://localhost:5173

### Docker 一键部署

```bash
cd deploy
docker-compose -f docker-compose-all.yml up -d
```

## 📋 功能模块

### 1. 团队权限模块

- **多租户隔离**: 基于租户ID实现数据隔离
- **用户管理**: 用户增删改查、状态管理
- **角色管理**: 角色创建、权限分配
- **权限管理**: 菜单权限、按钮权限
- **租户管理**: 租户创建、过期管理

默认账号：`admin / admin123` (租户编码: `DEFAULT`)

### 2. 影像分布式存储模块

- **大文件分片上传**: 支持GB级文件分片上传、断点续传
- **MinIO分布式存储**: 高性能对象存储
- **文件管理**: 文件列表、预览、下载、删除
- **MD5校验**: 文件完整性校验
- **按日期归档**: 文件按日期路径存储

### 3. 标本数据服务模块

- **标本管理**: 标本CRUD、分类管理
- **标本查询**: 多条件筛选、关键词搜索
- **图片管理**: 标本多图片关联
- **标签管理**: 自定义标签体系
- **统计分析**: 标本类型统计、新增趋势

### 4. 影像标注模块

- **多种标注工具**:
  - 🔲 矩形框标注
  - 🔷 多边形标注
  - 🔴 点标记
  - ⭕ 圆形标注
  - 📏 线条标注
  - 📝 文字标注
- **标注属性**: 标签名称、置信度、颜色、备注
- **画布操作**: 缩放、平移、撤销/重做
- **批量标注**: 多图批量标注
- **标注导出**: JSON格式导出

### 5. 溯源索引模块

- **操作日志**: 全量操作记录审计
- **溯源链**: 完整的标本生命周期时间线
- **全文检索**: Elasticsearch高性能检索
- **高亮显示**: 搜索结果关键词高亮
- **二维码**: 标本溯源二维码生成
- **扫码记录**: 二维码扫码统计

## 🔧 API 接口

### 网关地址
- 开发环境: http://localhost:9999
- 生产环境: http://your-domain/api

### 接口文档
- Knife4j: http://localhost:9001/doc.html
- Swagger UI: http://localhost:9001/swagger-ui.html

### 主要接口

| 模块 | 前缀 | 说明 |
|------|------|------|
| 认证授权 | /auth/** | 登录、注册、用户信息 |
| 文件存储 | /storage/** | 文件上传、下载、预览 |
| 标本数据 | /data/** | 标本、标注、标签管理 |
| 溯源索引 | /traceability/** | 溯源、搜索、二维码 |

## 🔒 安全机制

1. **多租户隔离**
   - 基于 tenant_id 的数据隔离
   - MyBatis Plus 租户插件自动过滤
   - 支持 @TenantIgnore 注解跳过隔离

2. **JWT认证**
   - Gateway 统一鉴权
   - Token 自动续期
   - Redis 黑名单机制

3. **权限控制**
   - 基于角色的访问控制 (RBAC)
   - 接口级别权限校验
   - 前端按钮权限控制

## 📊 数据模型

### 核心实体关系

```
租户 (SysTenant)
  ├─ 用户 (SysUser)
  │   └─ 角色 (SysRole)
  │       └─ 权限 (SysPermission)
  └─ 标本 (Specimen)
      ├─ 标本图片 (SpecimenImage)
      │   └─ 文件存储 (StorageFile)
      ├─ 标注 (SpecimenAnnotation)
      ├─ 标签 (SpecimenTag)
      └─ 溯源记录 (TraceabilityRecord)
          └─ 二维码 (TraceabilityQrCode)
```

## 🎯 特色功能

### 1. 大文件分片上传

```typescript
// 前端上传流程
1. 调用 initMultipartUpload 获取 uploadId 和分片URL
2. 并发上传所有分片
3. 调用 completeMultipartUpload 完成合并
```

### 2. Canvas影像标注

```typescript
// Fabric.js 标注实现
const canvas = new fabric.Canvas('annotation-canvas');
// 矩形标注
const rect = new fabric.Rect({
  left: 100,
  top: 100,
  width: 200,
  height: 150,
  fill: 'transparent',
  stroke: '#ff0000',
  strokeWidth: 2
});
canvas.add(rect);
```

### 3. Elasticsearch全文检索

```json
// 索引文档结构
{
  "specimenId": 1,
  "specimenNo": "SP001",
  "name": "东北虎标本",
  "type": 4,
  "description": "成年东北虎皮毛标本",
  "location": "长白山自然保护区",
  "tags": ["老虎", "猫科", "濒危"],
  "annotations": ["头部", "身体"]
}
```

## 🔍 监控与运维

### 健康检查

- Nacos: http://localhost:8848/nacos/v1/console/health/readiness
- MinIO: http://localhost:9000/minio/health/live
- Elasticsearch: http://localhost:9200/_cluster/health

### 日志配置

各服务日志位置：
- 控制台输出
- 文件日志: `logs/` 目录

### 性能优化

1. **数据库**: 索引优化、连接池配置
2. **缓存**: Redis热点数据缓存
3. **存储**: MinIO分片、压缩
4. **检索**: Elasticsearch索引优化

## 📝 开发规范

### 后端规范

1. 实体类继承 `BaseEntity` 或 `TenantEntity`
2. 接口统一返回 `Result<T>`
3. 业务异常抛出 `BusinessException`
4. 使用 `@TenantIgnore` 标记不需要租户隔离的接口
5. Mapper 使用 MyBatis Plus 接口

### 前端规范

1. 使用 TypeScript 类型定义
2. API 接口统一封装
3. 状态使用 Redux Toolkit 管理
4. 组件使用函数式组件 + Hooks
5. 使用 Ant Design 组件库

## 🤝 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/xxx`)
3. 提交更改 (`git commit -m 'Add xxx'`)
4. 推送到分支 (`git push origin feature/xxx`)
5. 提交 Pull Request

## 📄 许可证

MIT License

## 📞 联系方式

如有问题，请提交 Issue 或联系维护团队。
