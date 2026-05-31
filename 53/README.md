# 档案管理系统

## 项目概述

全栈档案管理系统，采用双库存储架构，分别存储元数据与附件文件。

## 技术架构

### 后端技术栈
- Node.js + Express
- SQLite3（元数据数据库）
- Joi（数据校验）
- Multer（文件上传）

### 前端技术栈
- React 18
- React Router
- Ant Design
- Axios
- Vite

## 功能模块

### 前端页面
1. **档案录入** - 档案元数据录入，支持自动生成档案编号，附件上传
2. **编目检索** - 多条件检索，支持关键词、类别、日期范围筛选
3. **预览页面** - 档案详情展示，支持图片、PDF、文本在线预览

### 后端模块
1. **数据校验模块** - 使用Joi进行表单数据校验
2. **文件存储模块** - 本地文件系统存储，支持多格式文件上传下载
3. **编目规则模块** - 档案编号生成、规则校验、关键词提取

### 双库设计
- **元数据库** - SQLite存储档案元数据信息
- **文件库** - 本地文件系统存储附件文件

## 快速开始

### 1. 安装依赖
```bash
npm run install:all
```

### 2. 启动后端服务
```bash
npm run dev:backend
```
后端运行在 http://localhost:3001

### 3. 启动前端服务
```bash
npm run dev:frontend
```
前端运行在 http://localhost:3000

## 目录结构

```
.
├── backend/                 # 后端项目
│   ├── config/             # 配置文件
│   │   └── database.js     # 数据库配置
│   ├── validators/         # 数据校验
│   │   └── archiveValidator.js
│   ├── utils/              # 工具函数
│   │   └── fileStorage.js  # 文件存储
│   ├── rules/              # 编目规则
│   │   └── catalogRules.js
│   ├── routes/             # API路由
│   │   ├── archiveRoutes.js
│   │   └── fileRoutes.js
│   ├── data/               # 数据库文件
│   ├── uploads/            # 上传文件
│   └── server.js           # 服务入口
│
├── frontend/               # 前端项目
│   ├── src/
│   │   ├── pages/          # 页面组件
│   │   │   ├── ArchiveInput.jsx
│   │   │   ├── ArchiveSearch.jsx
│   │   │   └── ArchivePreview.jsx
│   │   ├── services/       # API服务
│   │   ├── App.jsx
│   │   └── main.jsx
│   └── index.html
│
└── package.json            # 根配置
```

## API接口

### 档案管理
- `POST /api/archives` - 创建档案
- `GET /api/archives` - 查询档案列表
- `GET /api/archives/:id` - 获取档案详情
- `PUT /api/archives/:id` - 更新档案
- `DELETE /api/archives/:id` - 删除档案
- `GET /api/archives/number/generate` - 生成档案编号

### 文件管理
- `POST /api/files/:archiveId` - 上传文件
- `GET /api/files/:archiveId/download` - 下载文件
- `GET /api/files/:archiveId/preview` - 预览文件
- `DELETE /api/files/:archiveId` - 删除文件

## 支持的文件格式

- 文档：PDF, DOC, DOCX, XLS, XLSX
- 图片：JPG, PNG, GIF
- 文本：TXT

## 编目规则

档案编号格式：`类别代码-年份-序号`

类别代码对应：
- WS - 文书档案
- KJ - 科技档案/会计档案
- RS - 人事档案
- SX - 声像档案
- DZ - 电子档案
