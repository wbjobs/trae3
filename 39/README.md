# 工业产线数字孪生3D交互可视化协同运维系统

## 项目简介

这是一个全栈工业数字孪生系统，实现工业产线的3D可视化、实时数据监控、多人协同运维。

## 技术架构

### 前端模块
- **3D场景渲染模块 - Three.js 3D渲染引擎
- **设备交互模块 - 设备选中、状态展示、参数控制
- **多人协同模块 - WebSocket实时通信
- **告警展示模块 - 实时告警展示和处理

### 后端模块
- **产线数据采集模块 - 模拟工业网关数据采集
- **状态转发模块 - 实时数据推送
- **运维指令处理模块 - 指令接收、校验、执行
- **实时数据库模块 - 内存数据库+数据持久化

## 快速开始

### 安装依赖

```bash

npm install
```

### 启动后端

```bash
# 同时启动前后端
npm run dev
```

### 分别启动：

```bash
# 启动后端 (端口3001)
npm run dev:backend

# 启动前端 (端口3000)
npm run dev:frontend
```

## 系统功能

### 3D场景功能
- 工业产线3D模型渲染
- 设备实时状态可视化
- 设备点击交互
- 设备运行动画

### 设备交互
- 设备详细信息查看
- 设备运行参数调整
- 运维控制

### 多人协同
- 多用户同时在线
- 实时用户状态同步
- 协同查看设备

### 告警系统
- 实时告警推送
- 告警分级展示
- 告警处理功能

## API接口

### REST API
- `GET /api/health - 健康检查
- `GET /api/devices - 获取所有设备
- `GET /api/devices/:id - 获取单个设备
- `GET /api/alarms - 获取告警列表
- `POST /api/command - 发送运维指令

### WebSocket事件

#### 服务端发送
- `device:update` - 设备状态更新
- `devices:initial` - 初始设备数据
- `alarm:new` - 新告警
- `users:update` - 用户列表更新
- `user:current` - 当前用户信息
- `command:response` - 指令响应

#### 客户端发送
- `command:send` - 发送运维指令
- `user:selectDevice` - 用户选中设备
- `alarm:acknowledge` - 确认告警
