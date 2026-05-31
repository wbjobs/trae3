# 行业知识图谱构建平台

多文件、跨模块的行业专业文档多模态语义抽取与知识图谱构建 AI 应用。

## 项目架构

### 后端 (FastAPI + Python)

```
backend/
├── app/
│   ├── api/
│   │   └── routes.py          # API 路由
│   ├── services/
│   │   ├── ai_model.py        # AI 模型调用模块
│   │   ├── parser.py          # 多模态文档解析模块 (PDF/图片/Word)
│   │   ├── kg_builder.py      # 知识图谱构建模块
│   │   ├── vector_store.py    # 向量数据库存储 (ChromaDB)
│   │   └── graph_store.py     # 图数据库存储 (Neo4j)
│   ├── models/
│   │   └── schemas.py         # Pydantic 数据模型
│   ├── config.py              # 配置
│   └── main.py                # FastAPI 入口
├── scripts/
│   └── inference.py           # 模型推理脚本 (命令行)
├── requirements.txt           # Python 依赖
└── .env.example               # 环境变量示例
```

### 前端 (React + Vite + TypeScript)

```
frontend/
├── src/
│   ├── components/
│   │   ├── DocumentUpload.tsx   # 文档上传模块 (批量上传/拖拽/进度)
│   │   ├── GraphPreview.tsx     # 图谱预览模块 (D3.js 力导向图)
│   │   └── ResultEditor.tsx     # 结果编辑模块
│   ├── services/
│   │   └── api.ts               # API 客户端
│   ├── App.tsx                  # 主应用布局
│   └── main.tsx                 # 入口文件
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## 功能特性

### 后端

- ✅ **AI 模型调用模块**: OpenAI API 封装，支持实体/关系抽取、图像分析、向量生成
- ✅ **多模态解析模块**: 支持 PDF、图片 (PNG/JPG)、Word、文本文件，提取文本和图片
- ✅ **知识图谱构建模块**: 实体与关系抽取，批量处理，结果合并
- ✅ **向量数据库**: ChromaDB 向量存储与语义搜索
- ✅ **图数据库**: Neo4j 图数据库存储与查询 (内存 fallback)
- ✅ **任务管理**: 异步任务状态跟踪
- ✅ **批量处理**: 支持批量解析和批量抽取

### 前端

- ✅ **文档上传模块**: 拖拽上传、批量上传、进度显示、状态统计
- ✅ **图谱预览模块**: D3.js 力导向图、缩放拖拽、实体类型筛选、节点详情
- ✅ **结果编辑模块**: 实体管理表格、关系管理表格、搜索筛选、编辑删除
- ✅ **响应式布局**: Ant Design 组件库，中文本地化

## 快速开始

### 后端启动

```bash
cd backend

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env 设置 OPENAI_API_KEY 等

# 启动服务
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API 文档: http://localhost:8000/docs

### 前端启动

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

访问: http://localhost:5173

### 命令行推理脚本

```bash
cd backend
python scripts/inference.py docs/document.pdf docs/image.png --domain 医疗 --output output/
```

## 支持的文件格式

- 文档: `.pdf`, `.docx`, `.txt`, `.md`
- 图片: `.png`, `.jpg`, `.jpeg`, `.bmp`, `.tiff`

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/upload` | 单文件上传 |
| POST | `/api/upload/batch` | 批量文件上传 |
| POST | `/api/extract/{doc_id}` | 单文档知识抽取 |
| POST | `/api/extract/batch` | 批量知识抽取 |
| GET | `/api/task/{task_id}` | 查询任务状态 |
| GET | `/api/graph` | 获取全量图谱 |
| GET | `/api/graph/{doc_id}` | 获取单文档图谱 |
| GET | `/api/parsed/{doc_id}` | 获取解析内容 |
| GET | `/api/extraction/{doc_id}` | 获取抽取结果 |
| PUT | `/api/entity/{entity_id}` | 更新实体 |
| PUT | `/api/relation/{relation_id}` | 更新关系 |
| DELETE | `/api/entity/{entity_id}` | 删除实体 |
| DELETE | `/api/relation/{relation_id}` | 删除关系 |
| POST | `/api/search` | 语义搜索 |

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `OPENAI_API_KEY` | OpenAI API 密钥 | 必填 |
| `OPENAI_BASE_URL` | API 基础地址 | https://api.openai.com/v1 |
| `OPENAI_MODEL` | 模型名称 | gpt-4o |
| `NEO4J_URI` | Neo4j 连接地址 | bolt://localhost:7687 |
| `NEO4J_USER` | Neo4j 用户名 | neo4j |
| `NEO4J_PASSWORD` | Neo4j 密码 | password |

## 使用流程

1. **上传文档**: 拖拽或选择文件上传，支持批量上传
2. **知识抽取**: 选择行业领域，触发实体与关系抽取
3. **图谱预览**: 查看生成的知识图谱，支持交互探索
4. **结果编辑**: 手动调整实体和关系，修正 AI 抽取结果
5. **数据存储**: 向量与图数据持久化存储

## 技术栈

**后端:**
- FastAPI
- PyMuPDF + pdfplumber (PDF 解析)
- python-docx (Word 解析)
- OpenAI SDK
- ChromaDB (向量数据库)
- Neo4j (图数据库)

**前端:**
- React 18 + TypeScript
- Vite
- Ant Design
- D3.js (图可视化)
- Axios
