# 地下管廊管线三维拓扑 3D 交互系统

基于 Three.js + NestJS + MongoDB 的地下管廊管线三维可视化系统。

## 功能特性

- 3D 场景渲染：地下给排水、电力管线三维拓扑模型
- 管线数据加载：前后端联调加载海量管线点位数据
- 视角操控：缩放、旋转、平移等交互操作
- 点位标注：管线点位标注与编辑功能
- 管线分层查看：按类型分层显示管线

## 项目结构

```
├── backend/          # NestJS 后端服务
│   ├── src/
│   │   ├── pipeline/ # 管线数据模块
│   │   ├── annotation/ # 标注数据模块
│   │   └── ...
│   └── package.json
├── frontend/         # Three.js 前端应用
│   ├── src/
│   │   ├── modules/
│   │   │   ├── SceneRenderer.js    # 3D场景渲染模块
│   │   │   ├── DataLoader.js       # 管线数据加载模块
│   │   │   ├── CameraController.js # 视角操控模块
│   │   │   └── AnnotationEditor.js # 管线标注编辑模块
│   │   └── main.js
│   └── package.json
└── package.json
```

## 快速开始

### 安装依赖

```bash
npm run install:all
```

### 启动后端服务

```bash
npm run dev:server
```

### 启动前端应用

```bash
npm run dev:client
```
