# 后端多模块 API 服务

一个基于 FastAPI 的多模块 API 服务，包含租户隔离、消息推送、优先级调度、数据统计等核心功能。

## 功能特性

### 1. 租户隔离 (Tenant Isolation)
- 基于请求头 `X-Tenant-ID` 的租户识别
- ContextVar 上下文管理
- 数据库级别的数据隔离
- 租户资源配额管理

### 2. 消息推送 (Message Push)
- WebSocket 实时连接
- 优先级消息队列 (堆实现)
- 按租户广播和定向推送
- 消息状态持久化

### 3. 优先级调度 (Priority Scheduler)
- 基于 APScheduler 的定时任务
- 优先级任务队列
- Cron 表达式和一次性任务
- 任务重试机制
- 任务状态追踪

### 4. 数据统计 (Statistics)
- 设备在线/离线统计
- 消息发送统计 (按状态、优先级、渠道)
- 调度任务执行统计
- 消息趋势分析
- 仪表板概览

### 5. 多数据库对接
- **主库**: 租户信息、调度任务
- **设备库**: 设备数据管理
- **消息日志库**: 消息推送历史记录

## 项目结构

```
.
├── app/
│   ├── __init__.py
│   ├── config/
│   │   ├── __init__.py
│   │   └── config.py          # 配置管理
│   ├── database/
│   │   ├── __init__.py
│   │   └── connection.py      # 多数据库连接
│   ├── tenant/
│   │   ├── __init__.py
│   │   ├── models.py          # 租户模型
│   │   ├── middleware.py      # 租户中间件
│   │   ├── context.py         # 上下文管理
│   │   └── dependencies.py    # 依赖注入
│   ├── device/
│   │   ├── __init__.py
│   │   └── models.py          # 设备模型
│   ├── message_log/
│   │   ├── __init__.py
│   │   └── models.py          # 消息日志模型
│   ├── push/
│   │   ├── __init__.py
│   │   ├── websocket_manager.py  # WebSocket管理
│   │   ├── message_queue.py   # 优先级消息队列
│   │   └── service.py         # 推送服务
│   ├── scheduler/
│   │   ├── __init__.py
│   │   ├── models.py          # 调度任务模型
│   │   └── service.py         # 调度服务
│   ├── statistics/
│   │   ├── __init__.py
│   │   └── service.py         # 统计服务
│   └── api/
│       ├── __init__.py
│       ├── schemas.py         # Pydantic 模型
│       ├── tenant_routes.py   # 租户API
│       ├── device_routes.py   # 设备API
│       ├── push_routes.py     # 推送API
│       ├── scheduler_routes.py # 调度API
│       └── statistics_routes.py # 统计API
├── main.py                    # 应用入口
├── requirements.txt           # 依赖包
└── README.md
```

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 启动服务

```bash
python main.py
```

或者使用 uvicorn:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. 访问 API 文档

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## API 使用说明

### 公共端点

- `GET /health` - 健康检查

### 租户管理 (不需要 X-Tenant-ID)

- `POST /api/v1/tenants` - 创建租户
- `GET /api/v1/tenants/{id}` - 获取租户信息
- `GET /api/v1/tenants` - 获取租户列表
- `PUT /api/v1/tenants/{id}` - 更新租户
- `DELETE /api/v1/tenants/{id}` - 删除租户

### 设备管理 (需要 X-Tenant-ID)

- `POST /api/v1/devices` - 创建设备
- `GET /api/v1/devices/{id}` - 获取设备
- `GET /api/v1/devices` - 获取设备列表
- `PUT /api/v1/devices/{id}` - 更新设备
- `DELETE /api/v1/devices/{id}` - 删除设备

### 消息推送 (需要 X-Tenant-ID)

- `POST /api/v1/push/send` - 发送消息
- `GET /api/v1/push/stats` - 获取推送统计
- `WebSocket /api/v1/push/ws` - WebSocket 连接

### 调度任务 (需要 X-Tenant-ID)

- `POST /api/v1/scheduler/tasks` - 创建调度任务
- `GET /api/v1/scheduler/tasks/{id}` - 获取任务
- `GET /api/v1/scheduler/tasks` - 获取任务列表
- `DELETE /api/v1/scheduler/tasks/{id}` - 取消任务
- `GET /api/v1/scheduler/stats` - 获取调度统计

### 数据统计 (需要 X-Tenant-ID)

- `GET /api/v1/statistics/dashboard` - 仪表板概览
- `GET /api/v1/statistics/devices` - 设备统计
- `GET /api/v1/statistics/messages` - 消息统计
- `GET /api/v1/statistics/messages/trend` - 消息趋势
- `GET /api/v1/statistics/scheduler` - 调度统计

## 请求头说明

除租户管理接口外，所有 API 请求都需要在请求头中携带:

```
X-Tenant-ID: <your-tenant-id>
```

## WebSocket 连接示例

```javascript
const ws = new WebSocket(
  'ws://localhost:8000/api/v1/push/ws?tenant_id=<tenant-id>&client_id=<client-id>'
);

ws.onmessage = (event) => {
  console.log('Received:', JSON.parse(event.data));
};
```

## 配置说明

主要配置项 (app/config/config.py):

- `DATABASE_URL`: 主数据库连接
- `DEVICE_DATABASE_URL`: 设备数据库连接
- `MESSAGE_LOG_DATABASE_URL`: 消息日志数据库连接
- `TENANT_HEADER`: 租户识别请求头
- `SCHEDULER_TIMEZONE`: 调度器时区
- `MESSAGE_QUEUE_MAX_SIZE`: 消息队列最大长度

## 技术栈

- **框架**: FastAPI 0.104+
- **数据库**: SQLAlchemy 2.0+
- **调度器**: APScheduler 3.10+
- **WebSocket**: 原生 FastAPI WebSocket
- **优先级队列**: heapq
- **上下文管理**: contextvars

## 注意事项

1. 生产环境请更换 `SECRET_KEY`
2. SQLite 仅用于开发，生产环境建议使用 PostgreSQL/MySQL
3. 如使用 Redis，请配置 `REDIS_URL`
4. 确保时区配置正确

## License

MIT
