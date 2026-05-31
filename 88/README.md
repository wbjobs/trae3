# 铭牌OCR识别系统

前后端分离的工业铭牌图像识别与信息提取系统，支持铭牌图像上传、OCR字符识别、信息提取和工业档案数据库管理。

## 系统架构

```
┌─────────────────┐      HTTP/REST      ┌─────────────────┐
│   前端 (React)   │ ──────────────────> │   后端 (FastAPI) │
│  - 图像上传      │                     │  - 图像预处理    │
│  - 结果展示      │                     │  - OCR识别      │
│  - 档案管理      │                     │  - 信息提取      │
└─────────────────┘                     │  - 数据存储      │
          │                             └────────┬────────┘
          │                                      │
          │                                      ▼
          │                              SQLite 数据库
          │                              (工业档案)
          │
          └──────────────────────────────────┘
```

## 技术栈

### 后端
- **框架**: FastAPI 0.109.0
- **数据库**: SQLAlchemy 2.0 + SQLite
- **图像处理**: OpenCV 4.8 + NumPy
- **OCR引擎**: PaddleOCR 2.7 (百度飞桨)
- **其他**: Python 3.9+, Pydantic v2, aiofiles

### 前端
- **框架**: React 18 + TypeScript
- **UI组件**: Ant Design 5.x
- **构建工具**: Vite 5.x
- **HTTP客户端**: Axios
- **路由**: React Router v6

## 功能特性

### 图像处理模块
- ✅ 图像尺寸归一化
- ✅ 自适应去噪 (Non-Local Means)
- ✅ 对比度增强 (CLAHE)
- ✅ 自适应二值化
- ✅ 形态学操作

### OCR识别模块
- ✅ PaddleOCR中文识别
- ✅ 文本检测 + 识别 + 角度分类
- ✅ 置信度评估
- ✅ 降级模式（无Paddle环境时使用模拟数据）

### 信息提取模块
- ✅ 正则表达式模式匹配
- ✅ 支持字段：设备名称、型号、出厂编号、厂家、日期、功率、电压、电流、重量、尺寸、检验周期
- ✅ 回退匹配策略

### 数据管理模块
- ✅ SQLite工业档案数据库
- ✅ 记录CRUD操作
- ✅ 关键词搜索
- ✅ 统计概览
- ✅ 数据导出（可扩展）

### 前端功能
- ✅ 拖拽/点击上传图像
- ✅ 实时预览
- ✅ 识别进度展示
- ✅ 结构化信息展示
- ✅ OCR详情列表
- ✅ 人工编辑修正
- ✅ 重新识别
- ✅ 档案列表管理
- ✅ 数据统计面板

## 快速开始

### 环境要求
- Python >= 3.9
- Node.js >= 16
- Windows 10/11

### 一键启动（推荐）

1. 双击运行 `start-all.bat`
2. 等待前后端服务启动完成
3. 浏览器访问 `http://localhost:3000`

### 手动启动

#### 后端服务
```bash
# 进入后端目录
cd backend

# 创建虚拟环境
python -m venv .venv
.venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 启动服务
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### 前端服务
```bash
# 进入前端目录
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

## API 接口

### OCR 识别接口
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/ocr/upload` | 上传图像文件 |
| POST | `/api/v1/ocr/recognize` | 上传并识别图像 |
| POST | `/api/v1/ocr/recognize/{id}` | 重新识别指定记录 |

### 档案记录接口
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/records` | 获取记录列表（支持分页、搜索） |
| GET | `/api/v1/records/{id}` | 获取单条记录详情 |
| PUT | `/api/v1/records/{id}` | 更新记录信息 |
| DELETE | `/api/v1/records/{id}` | 删除记录 |
| GET | `/api/v1/records/statistics/summary` | 获取统计数据 |

### 其他接口
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 健康检查 |
| GET | `/health` | 健康状态 |
| GET | `/docs` | Swagger API文档 |
| GET | `/redoc` | ReDoc API文档 |

## 项目结构

```
项目根目录/
├── backend/                          # 后端服务
│   ├── app/
│   │   ├── api/v1/                   # API路由
│   │   │   ├── ocr.py               # OCR接口
│   │   │   └── records.py           # 档案接口
│   │   ├── core/                    # 核心配置
│   │   │   ├── config.py            # 配置管理
│   │   │   └── database.py          # 数据库连接
│   │   ├── models/                  # 数据模型
│   │   │   └── record.py            # 档案模型
│   │   ├── schemas/                 # Pydantic模式
│   │   │   └── record.py            # 请求/响应模式
│   │   ├── services/                # 业务服务
│   │   │   ├── preprocessing.py     # 图像预处理
│   │   │   ├── ocr_service.py       # OCR识别
│   │   │   └── information_extraction.py  # 信息提取
│   │   ├── utils/                   # 工具函数
│   │   │   └── file_handler.py      # 文件处理
│   │   └── main.py                  # 应用入口
│   ├── requirements.txt
│   └── .env
├── frontend/                         # 前端应用
│   ├── src/
│   │   ├── components/              # 组件
│   │   │   ├── ImageUploader.tsx    # 上传组件
│   │   │   ├── ResultDisplay.tsx    # 结果展示
│   │   │   └── RecordList.tsx       # 记录列表
│   │   ├── services/                # API服务
│   │   │   └── api.ts               # 接口封装
│   │   ├── types/                   # 类型定义
│   │   │   └── index.ts
│   │   ├── App.tsx                  # 主应用
│   │   ├── main.tsx                 # 入口文件
│   │   └── index.css                # 全局样式
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── uploads/                          # 上传文件存储
├── database/                         # 数据库文件
├── start-backend.bat                 # 后端启动脚本
├── start-frontend.bat                # 前端启动脚本
└── start-all.bat                     # 一键启动脚本
```

## 数据库表结构

### nameplate_records 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| filename | VARCHAR(255) | 原始文件名 |
| original_path | VARCHAR(500) | 原图路径 |
| processed_path | VARCHAR(500) | 处理后图像路径 |
| equipment_name | VARCHAR(200) | 设备名称 |
| equipment_model | VARCHAR(200) | 型号规格 |
| serial_number | VARCHAR(200) | 出厂编号 |
| manufacturer | VARCHAR(200) | 制造厂家 |
| production_date | VARCHAR(50) | 生产日期 |
| rated_power | VARCHAR(100) | 额定功率 |
| rated_voltage | VARCHAR(100) | 额定电压 |
| rated_current | VARCHAR(100) | 额定电流 |
| weight | VARCHAR(100) | 重量 |
| dimensions | VARCHAR(200) | 外形尺寸 |
| inspection_cycle | VARCHAR(100) | 检验周期 |
| raw_text | TEXT | OCR原始文本 |
| confidence | FLOAT | 平均置信度 |
| ocr_result | TEXT | OCR结果JSON |
| status | VARCHAR(20) | 状态 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

## 使用说明

1. **上传识别**
   - 进入"铭牌识别"页面
   - 点击或拖拽上传铭牌图像
   - 点击"开始识别"按钮
   - 查看识别结果和提取的信息

2. **编辑修正**
   - 识别完成后点击"编辑信息"
   - 修改需要修正的字段
   - 点击保存更新数据库

3. **档案管理**
   - 进入"档案记录"页面
   - 查看所有识别记录
   - 使用搜索框筛选记录
   - 点击"查看"查看详情
   - 点击"删除"移除记录

4. **统计数据**
   - 档案记录页面顶部显示统计卡片
   - 包括总记录数、完成数、待处理数、平均置信度

## 配置说明

后端配置文件：`backend/.env`

```env
DATABASE_URL=sqlite:///./database/nameplate.db  # 数据库连接
UPLOAD_DIR=./uploads                            # 上传目录
MAX_FILE_SIZE=10485760                          # 最大文件大小(10MB)
ALLOWED_EXTENSIONS=.jpg,.jpeg,.png,.bmp         # 允许的格式
OCR_LANG=ch                                     # OCR语言
OCR_USE_ANGLE_CLS=true                          # 启用角度分类
```

## 常见问题

**Q: PaddleOCR安装失败怎么办？**
A: 系统会自动降级到模拟OCR模式，返回预设的模拟数据，不影响功能测试。生产环境建议安装PaddleOCR以获得真实识别能力。

**Q: 如何更换OCR引擎？**
A: 修改 `backend/app/services/ocr_service.py` 中的 `_paddle_ocr_recognize` 方法，替换为其他OCR引擎的调用代码。

**Q: 如何扩展识别字段？**
A: 在 `backend/app/services/information_extraction.py` 的 `patterns` 字典中添加新的字段和正则表达式，同时在数据库模型和前端类型定义中添加对应字段。

**Q: 如何更换数据库？**
A: 修改 `.env` 中的 `DATABASE_URL`，支持 PostgreSQL、MySQL 等SQLAlchemy支持的数据库。

## 许可证

MIT License
