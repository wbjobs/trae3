# 边缘节点监控系统

分布式边缘设备监控平台，实现边缘节点状态实时上报、数据聚合、异常检测与可视化展示。

## 系统架构

```
边缘节点 (TCP Client) → TCP服务端 → 数据聚合模块 → 状态存储(SQLite)
                                          ↓
                                    HTTP API服务
                                          ↓
                                前端可视化面板(React)
```

## 功能特性

- ✅ **边缘节点通信模块**: TCP长连接、自动重连、指标采集
- ✅ **服务端数据聚合**: 多节点数据接收、异常检测、实时推送
- ✅ **状态存储模块**: SQLite数据库、节点信息、历史指标、告警记录
- ✅ **前端可视化面板**: 实时监控、异常标记、指标图表、系统日志
- ✅ **异常检测**: CPU/内存/磁盘阈值告警、心跳超时检测
- ✅ **实时推送**: SSE服务端事件推送

## 技术栈

| 模块 | 技术 |
|------|------|
| 前端 | React 18 + Vite + TypeScript + TailwindCSS + Chart.js |
| 后端 | Python 3.10+ + FastAPI + Uvicorn |
| 通信 | TCP Socket + SSE |
| 数据库 | SQLite |

## 快速开始

### 环境要求

- Python 3.10+
- Node.js 18+
- npm 或 pnpm

### 一键启动（Windows）

```batch
scripts\start-all.bat
```

### 手动启动

#### 1. 安装后端依赖

```bash
pip install fastapi uvicorn psutil
```

#### 2. 启动服务端

```bash
cd server
python api_server.py
```

服务启动后:
- TCP服务: `127.0.0.1:8888`
- HTTP API: `http://127.0.0.1:8000`
- API文档: `http://127.0.0.1:8000/docs`

#### 3. 启动边缘节点

```bash
cd edge-node
python client.py node-001 "北京机房-节点1" "北京机房-A区"
```

#### 4. 启动前端

```bash
cd frontend
npm install
npm run dev
```

访问前端面板: `http://127.0.0.1:5173`

## 项目结构

```
project/
├── edge-node/              # 边缘节点通信模块
│   ├── client.py           # TCP客户端主程序
│   ├── metrics.py          # 系统指标采集
│   └── requirements.txt    # 依赖
├── server/                 # 服务端模块
│   ├── tcp_server.py       # TCP服务端
│   ├── data_aggregator.py  # 数据聚合模块
│   ├── api_server.py       # HTTP API服务
│   └── requirements.txt    # 依赖
├── storage/                # 状态存储模块
│   ├── db.py               # 数据库操作
│   ├── models.py           # 数据模型
│   └── init.sql            # 初始化DDL
├── frontend/               # 前端可视化模块
│   ├── src/
│   │   ├── components/     # UI组件
│   │   ├── pages/          # 页面组件
│   │   ├── services/       # API调用
│   │   ├── store/          # 状态管理
│   │   └── types/          # 类型定义
│   └── package.json
├── config/                 # 配置文件
│   └── config.json         # 全局配置
├── scripts/                # 启动脚本
│   ├── start-all.bat       # Windows一键启动
│   ├── start-server.bat    # 启动服务端
│   ├── start-nodes.bat     # 启动边缘节点
│   └── start-frontend.bat  # 启动前端
└── data/                   # 数据库文件（自动创建）
```

## API接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/stats/summary` | 获取统计概览 |
| GET | `/api/nodes` | 获取所有节点列表 |
| GET | `/api/nodes/:id` | 获取单个节点详情 |
| GET | `/api/nodes/:id/metrics` | 获取节点历史指标 |
| GET | `/api/alerts` | 获取告警列表 |
| POST | `/api/alerts/:id/resolve` | 标记告警已处理 |
| GET | `/api/metrics/realtime` | 获取实时指标数据 |
| GET | `/api/logs` | 获取系统日志 |
| GET | `/api/stream` | SSE实时事件流 |

## TCP协议规范

### 数据包格式

```json
{
  "type": "register|report|alert|heartbeat|disconnect",
  "node_id": "node-001",
  "timestamp": 1704067200,
  "data": { ... }
}
```

### 异常检测阈值

| 指标 | 警告 | 严重 | 说明 |
|------|------|------|------|
| CPU | > 80% | > 95% | 持续3个周期 |
| 内存 | > 85% | > 95% | 持续3个周期 |
| 磁盘 | > 90% | > 98% | 单次触发 |
| 心跳 | > 30秒 | > 60秒 | 无上报数据 |

## 开发说明

### 预置节点

系统预置5个测试节点：
- node-001: 北京机房-节点1
- node-002: 北京机房-节点2
- node-003: 上海机房-节点1
- node-004: 上海机房-节点2
- node-005: 深圳机房-节点1

### 测试异常节点

可以通过修改边缘节点代码来模拟异常：

```python
# 在client.py启动后调用
client.set_abnormal('cpu')  # 模拟CPU高负载
```

## 许可证

MIT License
