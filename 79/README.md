# 储罐3D监控系统

全栈3D多文件项目，前端加载储罐3D模型并支持交互查询，后端对接监测网关和实时数据库，同步液位、压力等安全数据。

## 功能特性

### 前端功能
- 🏭 **3D可视化** - 使用 Three.js 渲染储罐场景，支持旋转、缩放、平移
- 🔍 **交互查询** - 点击储罐查看详细信息（液位、压力、温度）
- 📊 **实时数据** - WebSocket 实时同步储罐运行数据
- ⚠️ **报警系统** - 实时显示超阈值报警（警告/严重级别）
- 📈 **历史数据** - 查看储罐历史数据趋势图
- 📱 **响应式界面** - 现代化深色主题UI

### 后端功能
- 🌐 **REST API** - Express 提供数据接口
- 🔌 **WebSocket** - 实时数据推送服务
- 🎮 **数据模拟** - 模拟监测网关和实时数据库数据
- 🚨 **阈值检测** - 自动检测超阈值并触发报警
- 📋 **历史记录** - 存储历史数据和报警记录

## 项目结构

```
tank-3d-monitoring-system/
├── client/                      # 前端代码
│   ├── index.html              # 入口HTML
│   ├── styles.css              # 样式文件
│   ├── main.js                 # 主应用入口
│   └── js/
│       ├── scene3D.js          # 3D场景模块
│       ├── websocketService.js # WebSocket服务
│       └── apiService.js       # API服务
├── server/                      # 后端代码
│   ├── index.js                # 服务器入口
│   ├── dataSimulator.js        # 数据模拟器
│   └── tanksConfig.js          # 储罐配置
├── package.json                # 项目配置
├── vite.config.js              # Vite配置
└── README.md                   # 项目说明
```

## 技术栈

**前端：**
- Three.js - 3D图形渲染
- Vite - 构建工具
- 原生 JavaScript

**后端：**
- Node.js
- Express - Web框架
- ws - WebSocket库
- CORS - 跨域支持

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发服务

```bash
# 同时启动后端和前端
npm run dev

# 或单独启动
npm run server   # 启动后端服务 (端口8080)
npm run client   # 启动前端开发服务器 (端口3000)
```

### 3. 访问应用

打开浏览器访问: `http://localhost:3000`

## API 接口

### 获取所有储罐信息
```
GET /api/tanks
```

### 获取单个储罐信息
```
GET /api/tanks/:id
```

### 获取储罐历史数据
```
GET /api/tanks/:id/history?startTime=&endTime=
```

### 获取储罐报警记录
```
GET /api/tanks/:id/alerts
```

## WebSocket 协议

### 连接地址
```
ws://localhost:8080
```

### 订阅数据
```json
{
  "type": "subscribe",
  "tankIds": ["tank-001", "tank-002"]
}
```

### 接收数据更新
```json
{
  "type": "tankData",
  "tankId": "tank-001",
  "data": {
    "level": 2500,
    "levelPercent": 50,
    "pressure": 0.85,
    "temperature": 35,
    "timestamp": 1234567890,
    "status": "normal"
  }
}
```

### 接收报警
```json
{
  "type": "alert",
  "alert": {
    "tankId": "tank-001",
    "tankName": "原油储罐 A-1",
    "type": "level",
    "severity": "warning",
    "message": "液位高报警",
    "value": 4600,
    "threshold": 4500,
    "timestamp": 1234567890
  }
}
```

## 储罐配置

在 `server/tanksConfig.js` 中配置储罐信息：

```javascript
{
  id: 'tank-001',
  name: '原油储罐 A-1',
  type: '原油',
  capacity: 5000,
  unit: 'm³',
  height: 15,
  diameter: 22,
  position: { x: -40, y: 0, z: 0 },
  color: 0x4a90d9,
  thresholds: {
    level: { high: 4500, highHigh: 4750, low: 500, lowLow: 250 },
    pressure: { high: 1.2, low: 0.6 },
    temperature: { high: 60, low: 10 }
  }
}
```

## 生产构建

```bash
npm run build
```

构建产物将输出到 `dist` 目录。

## 部署

```bash
npm start
```

启动生产服务器，后端同时提供静态文件服务。

## 许可证

MIT
