# 工业嵌入式固件批量编译与版本管控系统

一个跨平台的工业嵌入式固件批量编译与版本管控桌面应用，支持多固件工程批量编译、版本差异对比、固件云端归档、编译日志拉取等功能。

## 系统架构

### 桌面应用模块

| 模块 | 功能描述 |
|------|----------|
| **工程管理模块** | 固件工程的导入、列表展示、配置编辑、批量导入、导出 |
| **批量编译模块** | 多工程选择、并行/串行编译、实时进度监控、日志输出、编译历史 |
| **版本对比模块** | 版本差异分析、版本树展示、段大小对比、文件级差异 |
| **远程服务调用模块** | 网络通信封装、API 接口调用、服务状态监控 |

### 后端服务模块

| 模块 | 功能描述 |
|------|----------|
| **固件存储模块** | 文件上传、归档、下载、搜索、标签管理 |
| **版本校验模块** | 版本格式验证、MD5 完整性校验、版本冲突检测、版本树 |
| **日志收集模块** | 日志存储、查询、导出、清理、统计分析 |

## 技术栈

### 桌面应用
- **框架**: Electron (跨平台桌面应用)
- **前端**: Vue 3 + TypeScript
- **UI 组件**: Element Plus
- **状态管理**: Pinia
- **路由**: Vue Router
- **构建工具**: Vite
- **HTTP 客户端**: Axios

### 后端服务
- **运行时**: Node.js
- **Web 框架**: Express
- **ORM**: TypeORM
- **数据库**: SQLite
- **文件上传**: Multer
- **日志**: Winston
- **安全**: Helmet, CORS, API Key 认证

## 项目结构

```
36/
├── desktop/                      # 桌面端应用
│   ├── electron/                 # Electron 主进程
│   │   ├── main.ts              # 主进程入口
│   │   └── preload.ts           # 预加载脚本
│   ├── src/                      # Vue 渲染进程
│   │   ├── views/               # 页面组件
│   │   │   ├── ProjectManager.vue  # 工程管理
│   │   │   ├── BatchBuilder.vue    # 批量编译
│   │   │   ├── VersionDiff.vue     # 版本对比
│   │   │   ├── RemoteService.vue   # 远程服务
│   │   │   └── Settings.vue        # 设置
│   │   ├── stores/              # Pinia 状态管理
│   │   ├── api/                 # API 接口
│   │   ├── router/              # 路由配置
│   │   └── styles/              # 全局样式
│   ├── package.json
│   └── vite.config.ts
├── backend/                      # 后端服务
│   ├── src/
│   │   ├── controllers/         # API 控制器
│   │   ├── services/            # 业务逻辑
│   │   ├── entities/            # 数据实体
│   │   ├── middleware/          # 中间件
│   │   ├── routes/              # 路由配置
│   │   ├── config/              # 配置
│   │   ├── database/            # 数据库
│   │   ├── utils/               # 工具函数
│   │   └── index.ts             # 服务入口
│   ├── package.json
│   ├── .env                     # 环境变量
│   └── .env.example             # 环境变量模板
├── shared/                       # 共享代码
│   ├── types.ts                 # 类型定义
│   └── utils.ts                 # 工具函数
├── scripts/                      # 编译脚本
│   ├── build.bat                # Windows 通用编译脚本
│   ├── build.sh                 # Linux/macOS 通用编译脚本
│   ├── build_stm32.bat          # STM32 Windows 编译脚本
│   ├── build_stm32.sh           # STM32 Linux/macOS 编译脚本
│   ├── build_esp32.bat          # ESP32 Windows 编译脚本
│   └── build_esp32.sh           # ESP32 Linux/macOS 编译脚本
├── package.json                 # Monorepo 根配置
└── README.md
```

## 快速开始

### 环境要求

- Node.js >= 16.0.0
- npm >= 8.0.0
- 编译工具链（根据目标平台选择）：
  - **STM32**: ARM GCC、Keil MDK
  - **ESP32**: ESP-IDF、Xtensa GCC
  - **通用**: Make、CMake

### 安装依赖

```bash
npm install
```

### 启动后端服务

```bash
# 进入后端目录
cd backend

# 复制环境变量模板
cp .env.example .env

# 编辑 .env 配置（API_KEY, 端口等）

# 启动服务
npm run dev
```

服务启动后访问：`http://localhost:3000/health` 验证服务状态

### 启动桌面应用

```bash
# 返回根目录
cd ..

# 启动桌面应用
npm run dev:desktop
```

### 同时启动所有服务

```bash
npm run dev
```

## API 接口文档

### 固件管理接口

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/firmware/upload` | 上传固件 |
| GET | `/api/firmware` | 获取固件列表 |
| GET | `/api/firmware/:id` | 获取固件详情 |
| GET | `/api/firmware/:id/download` | 下载固件 |
| DELETE | `/api/firmware/:id` | 删除固件 |
| POST | `/api/firmware/:id/validate` | 校验固件完整性 |
| PUT | `/api/firmware/:id/tags` | 更新固件标签 |
| GET | `/api/firmware/compare/:leftId/:rightId` | 对比两个版本 |
| GET | `/api/firmware/project/:projectId/versions` | 获取项目所有版本 |
| GET | `/api/firmware/search` | 搜索固件 |
| GET | `/api/firmware/stats` | 获取统计信息 |

### 版本管理接口

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/version/validate` | 验证版本格式 |
| GET | `/api/version/exists` | 检查版本是否存在 |
| GET | `/api/version/next/:projectId` | 获取下一个版本号 |
| GET | `/api/version/compare` | 比较版本号 |
| GET | `/api/version/integrity/:id` | 验证完整性 |
| POST | `/api/version/batch-validate` | 批量校验 |
| GET | `/api/version/tree/:projectId` | 获取版本树 |

### 日志管理接口

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/logs` | 获取日志列表 |
| GET | `/api/logs/:id` | 获取日志详情 |
| POST | `/api/logs` | 添加日志 |
| DELETE | `/api/logs` | 删除日志 |
| GET | `/api/logs/export` | 导出日志 |
| POST | `/api/logs/clear-old` | 清理旧日志 |
| GET | `/api/logs/stats` | 获取日志统计 |
| GET | `/api/logs/project/:projectId` | 获取项目日志 |
| GET | `/api/logs/build/:buildId` | 获取编译日志内容 |
| GET | `/api/logs/build/:buildId/entries` | 获取编译日志条目 |
| POST | `/api/logs/build` | 上传编译日志 |

### 认证

所有 `/api/*` 接口需要在请求头中携带 API Key：

```
X-API-Key: your-secret-api-key
```

## 支持的编译工具链

| 工具链 | 目标平台 | 检测方式 |
|--------|----------|----------|
| ARM GCC | STM32, ARM Cortex-M | `arm-none-eabi-gcc` |
| Xtensa GCC | ESP32 | `xtensa-esp32-elf-gcc` |
| Keil MDK | STM32, ARM | `UV4.exe` |
| IAR EWARM | STM32, ARM | `iarbuild` |
| ESP-IDF | ESP32 | `idf.py` |
| Make | 通用 | `make` |
| CMake | 通用 | `cmake` |

## 支持的工程类型

- **STM32**: 识别 `.ioc` 文件 (STM32CubeMX)
- **ESP32**: 识别 `CMakeLists.txt` 包含 `esp32` 或 `sdkconfig` 文件
- **Keil**: 识别 `.uvprojx` 文件
- **IAR**: 识别 `.ewp` 文件
- **通用 Makefile**: 识别 `Makefile` 文件

## 构建和打包

### 桌面应用打包

```bash
# Windows
npm run build:desktop

# macOS
npm run build:desktop:mac

# Linux
npm run build:desktop:linux
```

### 后端服务打包

```bash
cd backend
npm run build
```

## 配置说明

### 后端环境变量 (.env)

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | 3000 |
| `HOST` | 监听地址 | 0.0.0.0 |
| `API_KEY` | API 密钥 | （必须设置） |
| `STORAGE_PATH` | 固件存储路径 | ./storage |
| `DATABASE_PATH` | 数据库路径 | ./data/firmware.db |
| `MAX_FILE_SIZE` | 最大文件大小 | 100MB |
| `ALLOWED_EXTENSIONS` | 允许的扩展名 | .bin,.hex,.elf,.axf,.uf2 |
| `LOG_LEVEL` | 日志级别 | info |
| `LOG_RETENTION_DAYS` | 日志保留天数 | 30 |

## 安全建议

1. **生产环境必须设置强 API_KEY**
2. 使用 HTTPS 传输固件文件
3. 定期备份数据库和固件存储目录
4. 配置防火墙限制 API 访问来源
5. 定期清理旧日志和过期固件版本

## 故障排查

### 编译失败

1. 检查编译工具链是否正确安装并在 PATH 中
2. 查看编译日志中的具体错误信息
3. 确认工程目录结构和构建文件是否完整

### 后端服务无法启动

1. 检查端口是否被占用
2. 检查 .env 配置是否正确
3. 查看日志文件中的错误信息

### 桌面应用无法连接后端

1. 确认后端服务已启动
2. 检查设置中的服务地址和端口
3. 确认 API Key 配置正确
4. 检查网络连接和防火墙设置

## License

MIT
