# 科研论文图表智能解析 AI 私有化应用

基于 FastAPI + Vue3 + LangChain 开发的科研论文图表智能解析系统，支持内网私有化部署。

## 功能模块

- **论文文件解析模块**：解析 PDF 科研论文，提取文本内容、结构信息
- **图表提取模块**：从 PDF 论文中自动检测和提取图表
- **图像识别 AI 模块**：识别图表内容，提取数据表格、趋势信息
- **向量存储模块**：使用向量数据库存储论文内容和图表信息
- **检索问答模块**：基于 RAG 的语义检索和智能问答
- **内网权限模块**：用户认证、权限控制、内网安全管理

## 技术栈

### 后端
- FastAPI - Web 框架
- LangChain - LLM 应用框架
- PyPDF2 / pdfplumber - PDF 解析
- PyMuPDF (fitz) - PDF 图像处理
- OpenCV - 图像识别
- Milvus / FAISS - 向量数据库
- SQLAlchemy - ORM
- Pydantic - 数据验证
- JWT - 身份认证
- PostgreSQL - 关系数据库

### 前端
- Vue 3 + TypeScript
- Element Plus - UI 组件库
- Pinia - 状态管理
- Vue Router - 路由管理
- Axios - HTTP 客户端
- ECharts - 图表展示

### 部署
- Docker + Docker Compose
- Nginx - 反向代理
- 支持完全内网私有化部署

## 快速开始

### 方式一：Docker 部署（推荐）

```bash
docker-compose up -d
```

访问：http://localhost:8080

### 方式二：本地开发

#### 后端启动
```bash
cd backend
pip install -r requirements.txt
python main.py
```

#### 前端启动
```bash
cd frontend
npm install
npm run dev
```

## 项目结构

```
.
├── backend/                 # 后端服务
│   ├── app/
│   │   ├── api/            # API 路由
│   │   ├── core/           # 核心配置
│   │   ├── models/         # 数据模型
│   │   ├── schemas/        # Pydantic 模式
│   │   ├── services/       # 业务逻辑
│   │   └── modules/        # 功能模块
│   ├── main.py
│   └── requirements.txt
├── frontend/               # 前端应用
│   ├── src/
│   │   ├── api/            # API 接口
│   │   ├── components/     # 组件
│   │   ├── views/          # 页面
│   │   ├── store/          # 状态管理
│   │   └── router/         # 路由
│   └── package.json
├── docker/                 # Docker 配置
├── docker-compose.yml
└── README.md
```
