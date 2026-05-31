# Script Workstation

跨平台桌面多文件项目，包含脚本解析、语法检测、远程同步、本地管理模块，对接云端脚本库与版本数据库。

## 技术栈

### 前端
- **React 18** + **TypeScript** - UI框架
- **Vite** - 构建工具
- **Ant Design** - UI组件库
- **Zustand** - 状态管理
- **Monaco Editor** - 代码编辑器
- **React Router** - 路由管理

### 后端 (Tauri)
- **Rust** - 后端编程语言
- **Tauri 2.0** - 跨平台桌面应用框架
- **SQLite (rusqlite)** - 本地版本数据库
- **Tokio** - 异步运行时
- **Reqwest** - HTTP客户端
- **Walkdir** - 文件遍历

## 功能模块

### 1. 脚本解析模块
- 支持 10+ 种脚本语言：JavaScript、TypeScript、Python、Rust、Go、Bash、PowerShell、SQL、JSON、YAML
- 完整的词法分析和语法分析
- Token 可视化
- AST 语法树展示

### 2. 语法检测模块
- 10+ 条代码检查规则
- 安全漏洞检测：硬编码密钥、SQL注入风险、eval禁止使用
- 代码质量分析：未使用变量、圈复杂度计算、代码重复率
- 可配置规则引擎

### 3. 远程同步模块
- 云端脚本库对接
- REST API 客户端
- 自动同步（可配置间隔）
- 手动同步
- 冲突解决
- 连接测试

### 4. 本地管理模块
- 项目管理（新建、打开、删除）
- 文件树浏览
- 多标签编辑
- SQLite 版本数据库
- 版本历史记录
- 版本一键回滚

## 项目结构

```
script-workstation/
├── src/                            # 前端源码
│   ├── components/                 # React组件
│   │   ├── AppHeader.tsx          # 应用头部
│   │   ├── Toolbar.tsx            # 工具栏
│   │   ├── Sidebar.tsx            # 侧边栏
│   │   ├── EditorArea.tsx         # 编辑器区域
│   │   ├── TabBar.tsx             # 标签栏
│   │   ├── ASTViewer.tsx          # AST查看器
│   │   ├── ProblemPanel.tsx       # 问题面板
│   │   ├── StatusBar.tsx          # 状态栏
│   │   ├── WelcomeModal.tsx       # 欢迎弹窗
│   │   └── SettingsModal.tsx      # 设置弹窗
│   ├── store/                      # 状态管理
│   │   └── index.ts               # Zustand store
│   ├── api/                        # API层
│   │   ├── client.ts              # 云端API客户端
│   │   └── invoke.ts              # Tauri调用封装
│   ├── parser/                     # 解析器
│   │   ├── types.ts               # 解析器类型
│   │   ├── javascript.ts          # JS/TS解析器
│   │   ├── python.ts              # Python解析器
│   │   └── index.ts               # 解析器入口
│   ├── syntax/                     # 语法检测
│   │   ├── types.ts               # 语法检测类型
│   │   ├── rules.ts               # 检查规则
│   │   ├── javascript.ts          # JS语法检查
│   │   ├── python.ts              # Python语法检查
│   │   └── index.ts               # 语法检测入口
│   ├── types/                      # TypeScript类型定义
│   │   └── index.ts
│   ├── utils/                      # 工具函数
│   │   └── index.ts
│   ├── styles/                     # 样式
│   │   └── global.css
│   ├── App.tsx                     # 主应用组件
│   └── main.tsx                    # 应用入口
├── src-tauri/                      # Tauri后端
│   ├── src/
│   │   ├── main.rs                # 主程序
│   │   ├── models.rs              # 数据模型
│   │   ├── database.rs            # SQLite数据库
│   │   ├── parser.rs              # Rust解析器
│   │   ├── syntax.rs              # Rust语法检测
│   │   ├── sync.rs                # 同步模块
│   │   └── file_manager.rs        # 文件管理
│   ├── Cargo.toml                 # Rust依赖
│   ├── tauri.conf.json            # Tauri配置
│   └── build.rs                   # 构建脚本
├── package.json                    # 前端依赖
├── tsconfig.json                   # TypeScript配置
├── vite.config.ts                  # Vite配置
└── index.html                      # HTML入口
```

## 快速开始

### 前置要求
- Node.js >= 18
- Rust >= 1.70
- 系统依赖（根据平台）
  - Windows: WebView2
  - macOS: Xcode Command Line Tools
  - Linux: webkit2gtk, libayatana-appindicator3-dev

### 安装依赖

```bash
# 安装前端依赖
npm install

# 安装Rust依赖（自动处理）
cd src-tauri
cargo build
```

### 开发模式

```bash
# 启动开发服务器
npm run tauri dev
```

### 构建生产版本

```bash
# 构建桌面应用
npm run tauri build
```

### 其他命令

```bash
# 仅启动前端开发服务器
npm run dev

# 仅构建前端
npm run build

# TypeScript类型检查
npm run typecheck

# 代码检查
npm run lint
```

## 核心类型定义

### ScriptFile
```typescript
interface ScriptFile {
  id: string;
  name: string;
  path: string;
  content: string;
  language: ScriptLanguage;
  size: number;
  createdAt: string;
  updatedAt: string;
  isSynced: boolean;
  remoteId?: string;
  version: number;
  tags?: string[];
}
```

### ParseResult
```typescript
interface ParseResult {
  language: string;
  tokens: Token[];
  ast?: ASTNode;
  errors: ParseError[];
  parseTime: number;
}
```

### SyntaxCheckResult
```typescript
interface SyntaxCheckResult {
  issues: SyntaxIssue[];
  metrics: SyntaxMetrics;
  checkTime: number;
}
```

### SyncConfig
```typescript
interface SyncConfig {
  serverUrl: string;
  apiKey: string;
  username?: string;
  autoSync: boolean;
  syncInterval: number;
}
```

## 云端API对接

### 认证
所有API请求需在Header中携带：
```
Authorization: Bearer {apiKey}
```

### 主要接口

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/v1/scripts` | 获取脚本列表 |
| GET | `/api/v1/scripts/:id` | 获取脚本详情 |
| POST | `/api/v1/scripts` | 创建脚本 |
| PUT | `/api/v1/scripts/:id` | 更新脚本 |
| DELETE | `/api/v1/scripts/:id` | 删除脚本 |
| POST | `/api/v1/sync` | 批量同步 |
| GET | `/api/v1/scripts/:id/versions` | 获取版本历史 |

## 配置说明

### 同步配置
在设置中配置以下参数：
- **服务器地址**：云端API地址
- **API密钥**：用于身份认证
- **自动同步**：是否开启自动同步
- **同步间隔**：自动同步间隔（秒）

## 开发指南

### 添加新的语言支持

1. 在 `src/types/index.ts` 中添加语言类型
2. 在 `src/parser/` 中创建解析器文件
3. 在 `src/syntax/` 中创建语法检查器
4. 在 `src/parser/index.ts` 和 `src/syntax/index.ts` 中注册

### 添加新的检查规则

1. 在 `src/syntax/rules.ts` 中定义规则
2. 在对应语言的检查器中实现检查逻辑
3. 在问题面板中会自动显示

### 添加新的Tauri命令

1. 在 `src-tauri/src/main.rs` 中添加 `#[tauri::command]` 函数
2. 在 `src/api/invoke.ts` 中添加对应的invoke函数
3. 在组件中使用

## 许可证

MIT License
