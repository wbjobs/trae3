# 科研样本元数据全栈管理平台

基于 React + SpringBoot + PostgreSQL 开发的科研样本元数据全栈管理平台，支持多租户隔离、多级权限访问、云存储附件对接、跨科室数据协同查询。

## 技术架构

### 后端技术栈
- **SpringBoot 3.2** - 应用框架
- **Spring Data JPA** - ORM 框架
- **PostgreSQL** - 关系型数据库
- **Flyway** - 数据库版本迁移
- **MinIO** - 对象存储（附件云存储对接）
- **JWT** - 身份认证
- **Lombok** - 代码简化

### 前端技术栈
- **React 18** - UI 框架
- **TypeScript** - 类型安全
- **Vite** - 构建工具
- **Ant Design 5** - UI 组件库
- **React Router v6** - 路由管理
- **Zustand** - 状态管理
- **Axios** - HTTP 客户端
- **Day.js** - 日期处理

## 项目结构

```
.
├── backend/                              # 后端模块
│   ├── src/main/java/com/research/sample/
│   │   ├── business/                     # 业务服务模块
│   │   │   ├── controller/               # 样本 CRUD API
│   │   │   ├── service/                  # 样本业务逻辑
│   │   │   ├── repository/               # 数据访问层
│   │   │   ├── entity/                   # 实体类
│   │   │   └── dto/                      # 数据传输对象
│   │   ├── validation/                   # 元数据校验模块
│   │   │   ├── controller/               # 校验 API
│   │   │   ├── service/                  # 校验服务
│   │   │   ├── rule/                     # 规则引擎
│   │   │   ├── entity/                   # 校验规则实体
│   │   │   └── dto/                      # 校验 DTO
│   │   ├── storage/                      # 附件存储对接模块
│   │   │   ├── controller/               # 附件上传下载 API
│   │   │   ├── service/                  # 存储服务（MinIO）
│   │   │   ├── config/                   # MinIO 配置
│   │   │   ├── entity/                   # 附件实体
│   │   │   └── repository/               # 附件数据访问
│   │   ├── auth/                         # 权限控制模块
│   │   │   ├── controller/               # 认证 API
│   │   │   ├── service/                  # 认证服务
│   │   │   ├── interceptor/              # 请求头拦截器
│   │   │   ├── entity/                   # 用户角色实体
│   │   │   └── repository/               # 用户数据访问
│   │   ├── common/                       # 公共模块
│   │   │   ├── config/                   # 全局配置
│   │   │   ├── exception/                # 全局异常处理
│   │   │   └── util/                     # 工具类
│   │   └── SampleApplication.java        # 启动类
│   ├── src/main/resources/
│   │   ├── application.yml               # 配置文件
│   │   └── db/migration/                 # Flyway 迁移脚本
│   └── pom.xml                           # Maven 依赖
│
└── frontend/                             # 前端样本操作模块
    ├── src/
    │   ├── api/                          # API 请求封装
    │   ├── components/                   # 公共组件
    │   ├── pages/                        # 页面组件
    │   │   ├── SampleManage/             # 样本管理
    │   │   ├── CrossDeptQuery/           # 跨科室查询
    │   │   ├── AttachmentManage/         # 附件管理
    │   │   ├── Admin/                    # 系统管理
    │   │   └── Login.tsx                 # 登录页
    │   ├── store/                        # 状态管理（Zustand）
    │   ├── hooks/                        # 自定义 Hooks
    │   ├── utils/                        # 工具函数
    │   ├── types/                        # TypeScript 类型
    │   ├── App.tsx                       # 主应用
    │   └── main.tsx                      # 入口文件
    ├── vite.config.ts                    # Vite 配置
    ├── tsconfig.json                     # TypeScript 配置
    └── package.json                      # NPM 依赖
```

## 五大模块功能说明

### 1. 前端样本操作模块
- **样本元数据录入** - 表单录入，支持实时校验
- **样本查询编辑** - 列表查询、分页、编辑、删除
- **附件管理** - 附件上传、下载、预览链接
- **多租户切换** - 支持切换不同租户视图

### 2. 后端业务服务模块
- **样本 CRUD API** - RESTful 接口
- **多租户数据隔离** - 基于租户 ID 的数据过滤
- **动态查询** - JPA Specification 多条件组合
- **跨科室协同查询** - 跨租户数据访问，带审计日志

### 3. 元数据校验模块
- **可配置校验规则** - 支持 NOT_NULL、RANGE、REGEX、ENUM 四种类型
- **规则引擎工厂** - 策略模式实现规则匹配
- **单字段/批量校验** - API 支持两种校验方式
- **校验结果返回** - 结构化错误信息

### 4. 附件存储对接模块
- **云存储接口抽象** - StorageService 接口可扩展
- **MinIO 对接实现** - 对象存储，兼容 S3 协议
- **预签名 URL** - 安全的附件访问方式
- **租户目录隔离** - 按租户分层存储

### 5. 权限控制模块
- **自定义请求头校验** - X-User-Id、X-Tenant-Id、X-Role
- **JWT 令牌签发** - 登录获取 Token
- **RBAC 角色权限** - 用户-角色多对多
- **拦截器统一处理** - AuthInterceptor 全局认证

## 快速开始

### 环境要求
- JDK 17+
- Node.js 18+
- PostgreSQL 14+
- MinIO（可选，用于附件存储）

### 后端启动

1. **创建数据库**
```sql
CREATE DATABASE sample_db;
```

2. **配置数据库连接**
编辑 `backend/src/main/resources/application.yml`
```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/sample_db
    username: postgres
    password: your_password
```

3. **启动 MinIO（可选）**
```bash
minio server ./data --console-address ":9001"
```

4. **启动后端**
```bash
cd backend
mvn clean spring-boot:run
```

后端服务运行在 `http://localhost:8080`

### 前端启动

1. **安装依赖**
```bash
cd frontend
npm install
```

2. **启动开发服务器**
```bash
npm run dev
```

前端运行在 `http://localhost:5173`

## 默认账号

- **用户名**: `admin`
- **密码**: `admin123`
- **租户**: 默认租户

## API 接口列表

### 认证接口
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 登录获取 Token |
| POST | `/api/auth/register` | 用户注册 |
| GET | `/api/auth/info` | 获取当前用户信息 |

### 样本接口
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/samples` | 创建样本 |
| PUT | `/api/samples/{id}` | 更新样本 |
| DELETE | `/api/samples/{id}` | 删除样本（软删除） |
| GET | `/api/samples/{id}` | 获取样本详情 |
| GET | `/api/samples/query` | 分页查询样本 |
| GET | `/api/samples/cross-dept` | 跨部门查询 |

### 校验接口
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/validation/field` | 单字段校验 |
| POST | `/api/validation/batch` | 批量校验 |
| GET | `/api/validation/rules` | 获取校验规则 |
| POST | `/api/validation/rule` | 创建规则 |
| PUT | `/api/validation/rule` | 更新规则 |

### 附件接口
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/attachments/upload` | 上传附件 |
| GET | `/api/attachments/{id}/download` | 下载附件 |
| GET | `/api/attachments/{id}/url` | 获取预签名 URL |
| DELETE | `/api/attachments/{id}` | 删除附件 |
| GET | `/api/attachments/sample/{sampleId}` | 获取样本附件列表 |

## 自定义请求头说明

所有受保护的 API 都需要在请求头中携带以下信息：

| 头名称 | 说明 |
|--------|------|
| `X-User-Id` | 当前用户 ID |
| `X-Tenant-Id` | 当前租户 ID（多租户隔离） |
| `X-Role` | 用户角色，用于权限判断 |
| `Authorization` | Bearer Token（可选，JWT 验证） |

## 数据库表结构

1. **tenant** - 租户表
2. **sys_user** - 用户表
3. **sys_role** - 角色表
4. **sys_user_role** - 用户角色关联表
5. **sample_metadata** - 样本元数据表
6. **sample_attachment** - 样本附件表
7. **validation_rule** - 校验规则表
8. **cross_dept_query_log** - 跨部门查询审计表

## 多租户架构设计

- **数据隔离**: 所有业务表都有 `tenant_id` 字段
- **上下文传递**: `TenantContext` 使用 ThreadLocal 保存当前租户
- **拦截器注入**: 请求头解析后设置到上下文
- **SQL 过滤**: JPA 查询自动加入 `tenant_id` 条件

## 扩展开发

### 新增校验规则类型
1. 在 `validation/rule` 下创建新的 RuleEngine 实现
2. 在 `RuleEngineFactory` 中注册
3. 在 `RuleType` 枚举中新增类型

### 新增存储后端
1. 实现 `StorageService` 接口
2. 在配置中切换实现 Bean

## License

内部项目
