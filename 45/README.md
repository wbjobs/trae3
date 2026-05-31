# Tactical Game - 多人战术对局系统

## 项目简介

这是一个基于 Web 的多人战术对战游戏，采用回合制策略玩法。玩家可以在战场上指挥不同类型的单位，通过策略配合击败对手。系统支持实时状态同步，确保所有玩家看到的游戏状态保持一致。

## 架构说明

本项目采用经典的客户端-服务端架构：

### 服务端 (server/)
- **index.ts** - 服务端入口，初始化 Express 和 Socket.IO
- **gameManager.ts** - 游戏逻辑管理器，处理对局创建、玩家加入等
- **tacticalEngine.ts** - 战术引擎，处理单位移动、攻击计算、战斗判定
- **stateSync.ts** - 状态同步模块，确保所有客户端状态一致
- **socketHandler.ts** - Socket.IO 事件处理器
- **database.ts** - 数据库管理，使用 SQLite 持久化游戏数据
- **logger.ts** - 日志模块

### 客户端 (client/)
- **index.ts** - 客户端入口
- **gameClient.ts** - 游戏客户端核心逻辑
- **network.ts** - 网络通信模块，与服务端交互
- **renderer.ts** - 游戏渲染模块
- **inputHandler.ts** - 用户输入处理
- **ui.ts** - 用户界面组件
- **index.html** - 页面入口

### 共享模块 (shared/)
- **types.ts** - TypeScript 类型定义
- **constants.ts** - 常量定义
- **config.ts** - 配置管理
- **utils.ts** - 工具函数

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 初始化数据库

```bash
# 初始化数据库结构
npx ts-node scripts/initDb.ts

# 生成示例数据（可选）
npx ts-node scripts/initData.ts
```

### 3. 启动服务

```bash
# 同时启动服务端和客户端
npm start

# 或单独启动
npm run server
npm run client
```

### 4. 访问客户端

打开浏览器访问 `http://localhost:3000` 即可开始游戏。

## 功能特性

- **多人对战** - 支持 2 名玩家进行实时对战
- **6种单位类型** - 士兵、弓箭手、骑兵、法师、治疗师、坦克，各有特色
- **回合制玩法** - 每回合有时间限制，增加紧张感
- **多种地图** - 经典战场、迷雾森林等不同地形
- **实时同步** - 基于 Socket.IO 的实时状态同步
- **战斗日志** - 记录每一步操作，支持回放
- **数据持久化** - 使用 SQLite 保存对局记录
- **配置化设计** - YAML 配置文件，易于扩展

## 单位介绍

| 单位 | 生命 | 攻击 | 防御 | 移动 | 射程 | 费用 | 特点 |
|------|------|------|------|------|------|------|------|
| 士兵 | 100 | 20 | 15 | 3 | 1 | 10 | 均衡型近战单位 |
| 弓箭手 | 70 | 25 | 8 | 2 | 4 | 15 | 远程物理输出 |
| 骑兵 | 120 | 30 | 12 | 5 | 1 | 25 | 高机动性突击 |
| 法师 | 60 | 35 | 5 | 2 | 3 | 30 | 高伤害法术输出 |
| 治疗师 | 80 | 10 | 10 | 2 | 2 | 20 | 支援治疗单位 |
| 坦克 | 150 | 15 | 25 | 2 | 1 | 20 | 高防御前排 |

## 目录结构说明

```
├── client/                 # 客户端代码
│   ├── gameClient.ts       # 游戏客户端核心
│   ├── network.ts          # 网络通信
│   ├── renderer.ts         # 渲染引擎
│   ├── inputHandler.ts     # 输入处理
│   ├── ui.ts               # UI组件
│   ├── index.html          # 页面入口
│   ├── style.css           # 样式文件
│   └── tsconfig.json
├── server/                 # 服务端代码
│   ├── index.ts            # 服务端入口
│   ├── gameManager.ts      # 游戏管理
│   ├── tacticalEngine.ts   # 战术引擎
│   ├── stateSync.ts        # 状态同步
│   ├── socketHandler.ts    # Socket处理
│   ├── database.ts         # 数据库管理
│   ├── logger.ts           # 日志模块
│   └── tsconfig.json
├── shared/                 # 共享代码
│   ├── types.ts            # 类型定义
│   ├── constants.ts        # 常量
│   ├── config.ts           # 配置
│   └── utils.ts            # 工具函数
├── config/                 # 配置文件
│   ├── game.yaml           # 游戏主配置
│   └── maps/               # 地图配置
│       ├── default.yaml    # 经典战场
│       └── forest.yaml     # 迷雾森林
├── scripts/                # 脚本工具
│   ├── initDb.ts           # 数据库初始化
│   └── initData.ts         # 示例数据生成
├── data/                   # 数据目录
│   └── game.db             # SQLite数据库
├── package.json
├── tsconfig.json
└── README.md
```

## 技术栈

- **TypeScript** - 类型安全的 JavaScript 超集
- **Node.js** - 服务端运行环境
- **Express** - Web 应用框架
- **Socket.IO** - 实时双向通信
- **SQLite** - 轻量级关系型数据库
- **better-sqlite3** - SQLite 驱动
- **YAML** - 配置文件格式
- **UUID** - 唯一标识符生成

## 配置说明

### 游戏配置 (config/game.yaml)

- `server.port` - 服务端口，默认 3000
- `server.host` - 服务主机，默认 localhost
- `game.maxPlayers` - 最大玩家数，默认 2
- `game.turnTimeLimit` - 回合时间限制（秒），默认 60
- `game.startingGold` - 起始金币，默认 100
- `game.defaultMap` - 默认地图，默认 'default'
- `database.path` - 数据库路径，默认 'data/game.db'

### 地图配置 (config/maps/*.yaml)

每张地图包含：
- `id` - 地图唯一标识
- `name` - 地图名称
- `width` / `height` - 地图尺寸
- `obstacles` - 障碍物位置数组
- `spawnPoints` - 各队伍出生点

## 开发说明

### 编译项目

```bash
npm run build
```

### 数据库脚本

```bash
# 重新初始化数据库（会删除现有数据）
npx ts-node scripts/initDb.ts

# 生成更多示例数据
npx ts-node scripts/initData.ts
```

## License

MIT
