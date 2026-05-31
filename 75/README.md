# 卡牌对战游戏 - Card Battle Game

客户端+服务端架构的多人在线卡牌对战游戏。

## 项目结构

```
.
├── client/                 # 前端客户端 (React + Vite)
│   ├── src/
│   │   ├── components/     # React组件
│   │   ├── App.jsx         # 主应用组件
│   │   ├── main.jsx        # 入口文件
│   │   └── styles.css      # 样式文件
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── server/                 # 后端服务 (Node.js + Express + Socket.IO)
│   ├── game/               # 游戏引擎模块
│   │   ├── GameEngine.js   # 核心对战引擎
│   │   └── CardData.js     # 卡牌数据
│   ├── db/                 # 数据库模块
│   │   └── Database.js     # SQLite数据库操作
│   ├── sync/               # 跨服同步模块
│   │   └── CrossServerSync.js
│   ├── index.js            # 服务入口
│   └── package.json
├── data/                   # 数据库文件目录
└── package.json            # 根目录配置
```

## 功能特性

### 服务端 (Server)
- ✅ **对战演算引擎** - 完整的卡牌游戏规则实现
  - 随从召唤、攻击
  - 法术释放
  - 战吼效果
  - 嘲讽机制
  - 冲锋机制
  - 回合管理
- ✅ **实时通信** - Socket.IO 实现实时对战
- ✅ **数据存档** - SQLite 数据库持久化存储
  - 玩家信息
  - 对战记录
  - 排行榜
- ✅ **跨服同步** - 服务器间状态同步机制

### 客户端 (Client)
- ✅ **卡牌展示** - 精美的卡牌UI和动画效果
- ✅ **玩家操作** - 直观的对战界面
  - 手牌选择
  - 随从攻击
  - 目标选择
- ✅ **实时同步** - 对战状态实时更新

## 快速开始

### 1. 安装依赖

```bash
# 安装服务端依赖
cd server
npm install

# 安装客户端依赖
cd ../client
npm install
```

### 2. 启动服务

```bash
# 启动服务端 (端口 3000)
cd server
npm start

# 启动客户端开发服务器 (端口 5173)
cd ../client
npm run dev
```

### 3. 访问游戏

打开浏览器访问 `http://localhost:5173`

## 游戏规则

1. 每位玩家初始拥有 30 点生命值
2. 每回合获得递增的法力值 (最高10点)
3. 每回合自动抽一张牌
4. 消耗法力值打出卡牌
5. 随从可以在召唤的下回合进行攻击
6. 将对手生命值降为0即获胜

## 卡牌类型

### 随从卡 (Minion)
- 具有攻击力和生命值
- 召唤到战场参与战斗
- 特殊效果：冲锋、嘲讽、战吼

### 法术卡 (Spell)
- 直接产生效果
- 效果类型：伤害、治疗、抽牌、AOE、增益

## API 接口

### HTTP API
- `GET /api/leaderboard` - 获取排行榜
- `GET /api/battle-history/:playerId` - 获取玩家对战历史

### Socket.IO 事件

#### 客户端发送
- `player_login` - 玩家登录
- `matchmaking` - 开始匹配
- `play_card` - 打出卡牌
- `attack_minion` - 随从攻击
- `end_turn` - 结束回合

#### 服务端推送
- `login_success` - 登录成功
- `waiting_opponent` - 等待对手
- `game_start` - 游戏开始
- `card_played` - 卡牌打出
- `minion_attacked` - 随从攻击
- `turn_changed` - 回合变更
- `game_over` - 游戏结束

## 技术栈

**服务端:**
- Node.js
- Express
- Socket.IO
- SQLite3

**客户端:**
- React 18
- Vite
- Socket.IO Client

## 开发说明

### 添加新卡牌
编辑 `server/game/CardData.js` 文件，在 `getAllCards()` 方法中添加新卡牌定义。

### 扩展游戏规则
修改 `server/game/GameEngine.js` 中的相关方法。

## License

MIT