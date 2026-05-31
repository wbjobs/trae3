# 文书手写字迹识别与内容结构化 AI 应用

## 项目概述

基于前后端分离架构的文书手写体识别系统，支持图片上传、图像预处理、OCR 文字识别、内容结构化提取和文档数据库存储。

## 技术栈

### 前端
- Vue 3 + TypeScript + Vite
- Element Plus UI 组件库
- Axios HTTP 客户端

### 后端
- FastAPI (Python) - 高性能异步 Web 框架
- PaddleOCR - 中文手写体识别引擎
- OpenCV + Pillow - 图像处理
- MongoDB - 文档数据库存储结构化结果

## 项目结构

```
├── frontend/           # 前端 Vue 3 应用
│   ├── src/
│   │   ├── components/ # 组件（上传、结果展示、历史记录）
│   │   ├── api/        # API 接口封装
│   │   └── types/      # TypeScript 类型定义
│   └── package.json
├── backend/            # 后端 FastAPI 应用
│   ├── app/
│   │   ├── api/        # API 路由
│   │   ├── services/   # 核心服务（预处理、OCR、结构化）
│   │   ├── db/         # 数据库操作
│   │   ├── schemas/    # Pydantic 数据模型
│   │   └── main.py     # 应用入口
│   └── requirements.txt
└── docker-compose.yml  # MongoDB 容器配置
```

## 快速开始

### 1. 启动 MongoDB

```bash
docker-compose up -d
```

### 2. 启动后端服务

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. 启动前端应用

```bash
cd frontend
npm install
npm run dev
```

## API 文档

启动后端后访问：http://localhost:8000/docs

## 核心功能

1. **图像预处理**：去噪、二值化、对比度增强、倾斜校正
2. **文字识别**：基于 PaddleOCR 的中英文手写体识别
3. **结构化提取**：自动提取文书中的关键字段（日期、标题、正文、签名等）
4. **数据存储**：结构化结果持久化到 MongoDB 文档数据库
5. **历史查询**：支持按时间、关键字检索历史识别记录
