# 车载日志审计系统

一个完整的车载终端日志审计系统，支持海量车载终端通过WebSocket长连接上报日志，提供日志分级过滤、数据存储和前端审计面板。

## 项目架构

```
├── backend/                 # 后端服务
│   ├── src/
│   │   ├── api/           # API 接口
│   │   ├── database/      # 数据库模块
│   │   ├── websocket/     # WebSocket服务
│   │   ├── utils/         # 工具函数
│   │   └── index.js       # 入口文件
│   ├── scripts/            # 脚本工具
│   └── package.json
│
└── frontend/               # 前端面板
    ├── src/
    │   ├── components/   # 组件
    │   ├── pages/        # 页面
    │   ├── services/     # API服务
    │   └── main.tsx       # 入口文件
    └── package.json
```

## 功能特性

### 后端服务
- ✅ WebSocket长连接服务，支持海量终端接入
- ✅ 日志分级过滤（全局/终端级别）
- ✅ 模块过滤和关键词过滤
- ✅ SQLite独立日志数据库
- ✅ 批量日志写入优化
- ✅ 日志统计和告警
- ✅ RESTful API接口

### 前端面板
- ✅ 仪表盘 - 日志趋势图、级别分布、终端状态
- ✅ 日志审计 - 多维度筛选、分页查询
- ✅ 终端管理 - 终端CRUD、状态监控
- ✅ 系统设置 - 日志过滤配置

## 快速开始

### 1. 安装依赖

```bash
# 后端
cd backend
npm install

# 前端
cd ../frontend
npm install
```

### 2. 启动服务

```bash
# 启动后端服务 (端口 3001)
cd backend
npm start

# 启动前端开发服务 (端口 3000)
cd ../frontend
npm run dev
```

### 3. 模拟终端上报日志

```bash
cd backend
node scripts/mock-terminal.js [终端ID] [服务器地址]

# 示例
node scripts/mock-terminal.js CAR-001 ws://localhost:3001
```

## API接口

### 日志接口
- `GET /api/logs` - 查询日志
- `GET /api/logs/statistics` - 日志统计
- `GET /api/logs/levels` - 日志级别分布
- `GET /api/logs/modules` - 模块列表
- `GET /api/logs/filter-config` - 获取过滤配置
- `PUT /api/logs/filter-config` - 更新过滤配置
- `POST /api/logs/clear` - 清理旧日志

### 终端接口
- `GET /api/terminals` - 终端列表
- `GET /api/terminals/:id` - 终端详情
- `POST /api/terminals` - 创建终端
- `PUT /api/terminals/:id` - 更新终端
- `DELETE /api/terminals/:id` - 删除终端
- `GET /api/terminals/:id/logs` - 终端日志
- `GET /api/terminals/statistics/summary` - 终端统计

### WebSocket协议

连接地址: `ws://localhost:3001?terminalId=xxx`

#### 消息格式

**上报日志:**
```json
{
  "type": "log",
  "data": {
    "level": "info",
    "module": "gps",
    "message": "GPS定位成功",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "metadata": {
      "lat": 39.9,
      "lng": 116.4
    }
  }
}
```

**批量上报:**
```json
{
  "type": "batch_logs",
  "data": [
    { "level": "info", "message": "..." },
    { "level": "error", "message": "..." }
  ]
}
```

**心跳:**
```json
{
  "type": "heartbeat"
}
```

## 日志级别

| 级别 | 说明 |
|------|------|
| debug | 调试信息 |
| info | 一般信息 |
| warning | 警告信息 |
| error | 错误信息 |
| critical | 严重错误 |

## 数据库表结构

### terminals 终端表
- id: 终端ID
- name: 终端名称
- vehicle_number: 车牌号
- status: 状态(online/offline)
- last_online: 最后在线时间
- ip_address: IP地址

### logs 日志表
- id: 日志ID
- terminal_id: 终端ID
- level: 日志级别
- module: 模块
- message: 日志消息
- metadata: 元数据(JSON)
- timestamp: 时间戳

### log_statistics 日志统计表
- date: 日期
- total_logs: 总日志数
- error_logs: 错误日志数
- warning_logs: 警告日志数
- info_logs: 信息日志数
- debug_logs: 调试日志数

### alerts 告警表
- id: 告警ID
- terminal_id: 终端ID
- type: 告警类型
- message: 告警消息
- level: 告警级别
- resolved: 是否已解决
- created_at: 创建时间
- resolved_at: 解决时间

## 技术栈

**后端:**
- Node.js + Express
- WebSocket (ws库)
- SQLite3
- Winston (日志)
- Express Rate Limit

**前端:**
- React 18 + TypeScript
- Ant Design 5
- React Router
- ECharts
- Axios
- Vite
