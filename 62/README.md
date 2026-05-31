# 多模块后端 API 服务

多区域消息网关服务，提供统一的 API 接口，支持队列路由、消息转发、区域负载统计和日志记录功能。

## 功能模块

### 1. 队列路由模块 (Queue Router)
- 基于 BullMQ 的消息队列管理
- 支持多种路由策略：轮询、加权、最小负载、区域亲和
- 按消息优先级自动分配队列
- 支持队列暂停/恢复/清空操作

### 2. 消息转发模块 (Message Forwarder)
- 对接多区域消息集群
- 健康检查与熔断机制
- 故障自动转移
- 同步/异步消息发送

### 3. 区域负载统计模块 (Load Stats)
- 实时统计各区域消息处理情况
- 成功率、失败率、延迟统计
- 历史数据记录
- 系统概览指标

### 4. 日志记录模块 (Logger)
- 基于 Winston 的多文件日志系统
- 应用日志、错误日志、审计日志分离
- 按日期自动滚动归档
- 支持请求链路追踪

## 项目结构

```
src/
├── api/
│   ├── middleware.ts      # Express 中间件
│   └── routes.ts          # API 路由定义
├── modules/
│   ├── logger/            # 日志记录模块
│   ├── load-stats/        # 区域负载统计模块
│   ├── message-forwarder/ # 消息转发模块
│   └── queue-router/      # 队列路由模块
├── types/
│   └── index.ts           # TypeScript 类型定义
├── utils/
│   ├── config.ts          # 配置加载
│   └── helpers.ts         # 工具函数
└── index.ts               # 服务入口
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并修改配置：

```bash
cp .env.example .env
```

主要配置项：
- `PORT`: 服务端口
- `REDIS_*`: Redis 连接配置
- `REGION_CLUSTERS`: 区域集群配置（JSON 格式）
- `LOG_DIR`: 日志目录

### 3. 启动 Redis

确保 Redis 服务已启动：

```bash
redis-server
```

### 4. 启动开发服务

```bash
npm run dev
```

### 5. 构建生产版本

```bash
npm run build
npm start
```

## API 接口

### 消息接口

- `POST /api/v1/messages` - 异步发送消息（入队）
- `POST /api/v1/messages/sync` - 同步发送消息

### 统计接口

- `GET /api/v1/stats/overview` - 系统概览统计
- `GET /api/v1/stats/regions` - 所有区域统计
- `GET /api/v1/stats/regions/{regionId}` - 单个区域统计
- `GET /api/v1/stats/regions/{regionId}/history` - 区域历史统计

### 管理接口

- `GET /api/v1/admin/queues` - 队列状态
- `GET /api/v1/admin/strategy` - 获取路由策略
- `PUT /api/v1/admin/strategy` - 设置路由策略
- `POST /api/v1/admin/queues/{name}/pause` - 暂停队列
- `POST /api/v1/admin/queues/{name}/resume` - 恢复队列
- `DELETE /api/v1/admin/queues/{name}` - 清空队列
- `POST /api/v1/admin/regions/{regionId}/reset` - 重置区域状态
- `GET /api/v1/admin/clusters` - 集群状态

### 健康检查

- `GET /api/v1/health` - 服务健康检查

## 消息格式

```json
{
  "type": "command",
  "priority": "high",
  "payload": {
    "action": "send",
    "data": "..."
  },
  "targetRegion": "cn-north",
  "source": "api-client"
}
```

### 字段说明

- `type`: 消息类型 - `command` | `event` | `notification`
- `priority`: 优先级 - `low` | `normal` | `high` | `critical`
- `payload`: 消息负载（JSON 对象）
- `targetRegion`: 目标区域（可选，自动路由）
- `source`: 消息来源（可选）

## 路由策略

1. **轮询 (round-robin)**: 按顺序轮流分配到各区域
2. **加权 (weighted)**: 按配置权重随机分配
3. **最小负载 (least-load)**: 优先分配到负载最低的区域（默认）
4. **区域亲和 (region-affinity)**: 根据消息来源匹配区域

## 技术栈

- **框架**: Express.js
- **队列**: BullMQ + Redis
- **语言**: TypeScript
- **日志**: Winston + Daily Rotate File
- **HTTP**: Axios
- **安全**: Helmet, CORS

## 许可证

ISC
