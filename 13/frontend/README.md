# 古籍数字化勘校平台

## 项目简介

古籍数字化勘校平台是一个专业的古籍整理、勘校、批注系统，旨在为古籍研究者和整理工作者提供现代化的数字化工作平台。

## 技术栈

- **框架**: Angular 17 + Standalone Components
- **语言**: TypeScript 5.2
- **构建工具**: Vite + @analogjs/vite-plugin-angular
- **UI 组件**: Angular Material 17
- **状态管理**: @ngrx/signals
- **响应式编程**: RxJS 7.8
- **实时通信**: Socket.IO Client
- **图像浏览**: OpenSeadragon 4.1

## 项目结构

```
frontend/
├── src/
│   ├── app/
│   │   ├── core/                 # 核心模块
│   │   │   ├── services/         # 核心服务
│   │   │   ├── interceptors/     # HTTP拦截器
│   │   │   ├── guards/           # 路由守卫
│   │   │   └── models/           # 数据模型
│   │   ├── shared/               # 共享模块
│   │   │   ├── components/       # 共享组件
│   │   │   ├── directives/       # 共享指令
│   │   │   └── pipes/            # 共享管道
│   │   ├── modules/              # 业务模块
│   │   │   ├── auth/             # 认证模块
│   │   │   ├── dashboard/        # 工作台模块
│   │   │   ├── project/          # 项目管理模块
│   │   │   ├── collation/        # 勘校工作台模块
│   │   │   ├── annotation/       # 批注管理模块
│   │   │   ├── search/           # 全文检索模块
│   │   │   ├── file/             # 文件管理模块
│   │   │   └── admin/            # 管理后台模块
│   │   ├── app.component.ts      # 主应用组件
│   │   ├── app.config.ts         # 应用配置
│   │   └── app.routes.ts         # 路由配置
│   ├── assets/                   # 静态资源
│   ├── styles/                   # 全局样式
│   │   ├── _variables.scss       # 样式变量
│   │   ├── theme.scss            # 主题样式
│   │   └── styles.scss           # 全局样式
│   ├── main.ts                   # 应用入口
│   └── index.html                # HTML模板
├── angular.json                  # Angular配置
├── tsconfig.json                 # TypeScript配置
├── vite.config.ts                # Vite配置
└── package.json                  # 项目依赖
```

## 主题设计

本项目采用古籍风格暖色调设计：

- **背景主色**: 米白 #F5F0E6
- **主色调**: 深棕 #5D4E37
- **强调色**: 朱砂红 #C84C3B
- **字体**: 思源宋体 (Noto Serif SC)

## 安装与运行

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm start
```

应用将在 `http://localhost:4200` 启动。

### 生产构建

```bash
npm run build
```

构建产物将输出到 `dist/` 目录。

### 预览构建结果

```bash
npm run serve
```

## 主要功能模块

### 1. 认证模块 (Auth)
- 用户登录/注册
- 忘记密码
- Token 自动刷新

### 2. 工作台 (Dashboard)
- 数据概览
- 工作进度统计
- 最近任务列表
- 快捷操作

### 3. 项目管理 (Project)
- 项目列表
- 创建/编辑项目
- 项目详情
- 项目成员管理

### 4. 勘校工作台 (Collation)
- 勘校工作区
- 文本比对
- 版本管理
- 审核工作区

### 5. 批注管理 (Annotation)
- 批注列表
- 创建批注
- 批注详情
- 实时批注协作

### 6. 全文检索 (Search)
- 简单检索
- 高级检索
- 检索结果展示

### 7. 文件管理 (File)
- 文件列表
- 文件上传
- 文件预览 (OpenSeadragon)

### 8. 管理后台 (Admin)
- 用户管理
- 角色管理
- 系统日志
- 系统设置

## 核心服务

### AuthService
处理用户认证相关功能，包括登录、注册、登出、Token 管理等。

### ApiService
封装通用 HTTP 请求，提供统一的 API 调用接口。

### WebSocketService
处理实时通信，支持多人协作勘校、实时批注等功能。

### TokenInterceptor
自动为 HTTP 请求添加认证 Token，并处理 Token 过期自动刷新。

## 开发规范

- 所有组件使用 Standalone Components 模式
- 使用 TypeScript 严格模式
- 注释使用中文
- 遵循 Angular 官方风格指南
- 使用 Signals 进行状态管理

## 浏览器支持

- Chrome (最新版)
- Firefox (最新版)
- Edge (最新版)
- Safari (最新版)
