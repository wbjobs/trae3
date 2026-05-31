# 工业无线组网拓扑监测联动系统

基于 **Vue3 + Koa2 + TimescaleDB** 技术栈开发的工业级无线网络监测系统，实现设备状态实时监控、拓扑可视化展示、告警联动策略等功能。

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         前端 (Vue3)                              │
├─────────────┬──────────────┬──────────────┬──────────────────┤
│  拓扑绘图   │  告警面板    │  设备管理    │  策略配置        │
└─────────────┴──────────────┴──────────────┴──────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    后端组网数据网关 (Koa2)                       │
├─────────────────────────────────────────────────────────────────┤
│  RESTful API  │  WebSocket 实时推送  │  数据存储/查询          │
└─────────────────────────────────────────────────────────────────┘
          │                    │
          ▼                    ▼
┌──────────────────┐  ┌──────────────────┐
│  信号采集子服务  │  │  联动策略引擎    │
│  (数据模拟/上报) │  │  (条件判断/执行)  │
└──────────────────┘  └──────────────────┘
          │                    │
          └─────────┬──────────┘
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    TimescaleDB 时序数据库                       │
└─────────────────────────────────────────────────────────────────┘
```

## 模块拆分

### 后端模块

| 模块 | 路径 | 功能说明 |
|------|------|----------|
| 数据库读写模块 | `backend/database/` | TimescaleDB 连接、数据模型、CRUD 操作 |
| 信号采集子服务 | `backend/collector/` | 模拟设备数据采集、HTTP/MQTT 数据上报 |
| 组网数据网关 | `backend/gateway/` | Koa2 API 服务、WebSocket 推送、路由管理 |
| 联动策略引擎 | `backend/strategy/` | 策略条件判断、告警触发、动作执行 |

### 前端模块

| 模块 | 路径 | 功能说明 |
|------|------|----------|
| 拓扑绘图模块 | `frontend/src/components/TopologyGraph.vue` | ECharts 力导向图、设备节点渲染、链路展示 |
| 设备告警面板 | `frontend/src/views/AlertsView.vue` | 告警统计、列表展示、状态管理 |
| 设备管理模块 | `frontend/src/views/DevicesView.vue` | 设备列表、详情查看、信号图表 |
| 联动策略配置 | `frontend/src/views/StrategiesView.vue` | 策略列表、创建编辑、执行日志 |
| 拓扑监控视图 | `frontend/src/views/TopologyView.vue` | 拓扑图展示、设备统计、实时更新 |

## 环境要求

- Node.js >= 16.0.0
- PostgreSQL >= 12.0 + TimescaleDB 扩展
- 可选：MQTT Broker (Mosquitto)

## 快速开始

### 1. 安装依赖

```bash
# 安装后端依赖
npm install

# 安装前端依赖
cd frontend && npm install && cd ..
```

### 2. 配置环境变量

复制并修改环境配置文件：
- `.env.development` - 测试环境配置
- `.env.production` - 生产环境配置

```bash
# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_NAME=industrial_monitor_dev
DB_USER=postgres
DB_PASSWORD=postgres

# 服务端口
GATEWAY_PORT=3000
COLLECTOR_PORT=3001
STRATEGY_PORT=3002
```

### 3. 初始化数据库

```sql
-- 执行初始化脚本
psql -U postgres -d industrial_monitor_dev -f backend/database/init.sql
```

### 4. 启动服务

```bash
# 方式一：分别启动各服务
npm run dev:gateway      # 启动数据网关 (端口 3000)
npm run dev:collector    # 启动采集服务 (端口 3001)
npm run dev:strategy     # 启动策略引擎 (端口 3002)

# 方式二：一键启动所有后端服务
npm run dev:all

# 启动前端
npm run frontend:dev
```

### 5. 启动数据采集

调用采集服务接口开始模拟数据采集：

```bash
curl -X POST http://localhost:3001/collect/start
```

## API 接口

### 设备管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/device` | 获取所有设备 |
| GET | `/api/device/:id` | 获取设备详情 |
| POST | `/api/device` | 创建设备 |
| PUT | `/api/device/:id/status` | 更新设备状态 |
| DELETE | `/api/device/:id` | 删除设备 |

### 信号数据

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/signal/data` | 上报信号数据 |
| GET | `/api/signal/latest` | 获取所有设备最新数据 |
| GET | `/api/signal/device/:id` | 获取指定设备历史数据 |

### 拓扑结构

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/topology` | 获取完整拓扑结构 |
| GET | `/api/topology/summary` | 获取统计摘要 |
| GET | `/api/topology/tree` | 获取树形结构 |

### 告警管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/alert` | 获取告警列表 |
| GET | `/api/alert/active` | 获取未处理告警 |
| GET | `/api/alert/stats` | 获取告警统计 |
| PUT | `/api/alert/:id/resolve` | 处理告警 |

### 联动策略

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/strategy` | 获取策略列表 |
| POST | `/api/strategy` | 创建策略 |
| PUT | `/api/strategy/:id/toggle` | 启用/禁用策略 |
| DELETE | `/api/strategy/:id` | 删除策略 |

## WebSocket 实时推送

连接地址：`ws://localhost:3000`

### 消息类型

| 类型 | 说明 |
|------|------|
| `signal_update` | 信号数据更新 |
| `alert_created` | 新告警产生 |
| `device_status` | 设备状态变更 |

## 数据模型

### 设备表 (devices)
- `device_id` - 设备唯一标识
- `device_type` - 设备类型 (ap/repeater/endpoint)
- `status` - 在线状态 (online/offline)
- `parent_device_id` - 父节点ID

### 信号数据表 (signal_data)
时序超表，按时间分区存储
- `time` - 采集时间
- `device_id` - 设备ID
- `signal_strength` - 信号强度 (dBm)
- `snr` - 信噪比
- `cpu_usage` - CPU使用率
- `memory_usage` - 内存使用率
- `temperature` - 温度

### 告警表 (alerts)
- `alert_id` - 告警ID
- `device_id` - 关联设备
- `severity` - 严重级别 (critical/warning/info)
- `status` - 状态 (active/resolved)

### 策略表 (strategies)
- `strategy_id` - 策略ID
- `trigger_condition` - 触发条件 (JSON)
- `actions` - 执行动作 (JSON)

## 运行环境切换

### 测试环境
```bash
# 后端
npm run dev:gateway
npm run dev:collector
npm run dev:strategy

# 前端
npm run frontend:dev
```

### 生产环境
```bash
# 后端
npm run prod:gateway
npm run prod:collector
npm run prod:strategy

# 前端构建
npm run frontend:build
```

## 跨子服务数据流转

```
采集子服务 (Collector)
      │
      ▼  HTTP/MQTT
数据网关 (Gateway)
      │
      ├─► 写入 TimescaleDB
      │
      ├─► WebSocket 广播到前端
      │
      ▼
策略引擎 (Strategy Engine)
      │
      ├─► 条件判断
      ├─► 触发告警
      └─► 执行联动动作 (Webhook/日志等)
```

## 技术栈

**后端：**
- Koa2 - Web 框架
- PostgreSQL + TimescaleDB - 时序数据库
- WebSocket - 实时通信
- MQTT - 消息队列
- Axios - HTTP 客户端

**前端：**
- Vue 3 - 框架
- Vue Router - 路由
- Element Plus - UI 组件库
- ECharts - 图表/拓扑图
- Axios - HTTP 客户端
- Vite - 构建工具
