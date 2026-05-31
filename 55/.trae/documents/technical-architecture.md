## 1. 架构设计

```mermaid
graph TB
    subgraph "客户端 (React + Vite)"
        A["沙盘大厅页"] --> B["对局列表组件"]
        A --> C["创建对局组件"]
        D["沙盘对局页"] --> E["Canvas地图引擎"]
        D --> F["单位操控面板"]
        D --> G["战情时间轴"]
        D --> H["实时通讯"]
        I["战报复盘页"] --> J["回放引擎"]
        I --> K["数据统计图表"]
        L["剧本管理页"] --> M["剧本编辑器"]
        L --> N["地图编辑器"]
    end

    subgraph "服务端 (Express + Socket.IO)"
        O["WebSocket网关"] --> P["房间管理器"]
        O --> Q["指令解析器"]
        Q --> R["战情演算引擎"]
        R --> S["地形系统"]
        R --> T["战斗计算器"]
        R --> U["移动验证器"]
        P --> V["数据同步模块"]
        V --> W["事件广播器"]
        R --> X["回放记录器"]
    end

    subgraph "数据层"
        Y["SQLite 数据库"]
        Z["对局存档存储"]
    end

    E -- "WebSocket" --> O
    F -- "WebSocket" --> O
    H -- "WebSocket" --> O
    V -- "推送" --> E
    V -- "推送" --> F
    V -- "推送" --> H
    X --> Z
    Z --> Y
    P --> Y
```

## 2. 技术说明

- **前端**：React@18 + TypeScript + TailwindCSS@3 + Vite
- **地图渲染**：HTML5 Canvas（自定义六角格引擎）
- **初始化工具**：Vite
- **后端**：Express@4 + TypeScript + Socket.IO
- **数据库**：SQLite（better-sqlite3），无需额外数据库服务
- **实时通信**：Socket.IO（双向 WebSocket）
- **图表**：Recharts
- **项目结构**：Monorepo（client + server 共享类型定义）

## 3. 路由定义

| 路由 | 用途 |
|------|------|
| `/` | 沙盘大厅页，对局列表与入口 |
| `/game/:id` | 沙盘对局页，地图画布与操控面板 |
| `/replay/:id` | 战报复盘页，回放与统计 |
| `/scenario` | 剧本管理页，剧本/地图编辑 |

## 4. API 定义

### 4.1 REST API

```typescript
interface CreateGameRequest {
  scenarioId: string;
  maxTurns: number;
  invitedPlayerId?: string;
}

interface CreateGameResponse {
  gameId: string;
  joinCode: string;
}

interface GameListItem {
  id: string;
  scenarioName: string;
  playerCount: number;
  status: "waiting" | "playing" | "finished";
  currentTurn: number;
  createdAt: string;
}

interface Scenario {
  id: string;
  name: string;
  description: string;
  mapWidth: number;
  mapHeight: number;
  factions: Faction[];
  victoryConditions: VictoryCondition[];
}

interface Unit {
  id: string;
  type: string;
  faction: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  movement: number;
  position: HexCoord;
  status: "active" | "damaged" | "destroyed";
}

interface HexCoord {
  q: number;
  r: number;
}

interface BattleResult {
  attackerId: string;
  defenderId: string;
  damageDealt: number;
  damageReceived: number;
  attackerHp: number;
  defenderHp: number;
  defenderDestroyed: boolean;
}

interface TurnResult {
  turn: number;
  phase: "deploy" | "move" | "combat" | "settle";
  movements: MovementAction[];
  battles: BattleResult[];
  events: GameEvent[];
}

interface GameEvent {
  type: "unit_destroyed" | "objective_captured" | "reinforcement_arrived" | "turn_end";
  description: string;
  timestamp: number;
  data?: Record<string, unknown>;
}
```

### 4.2 Socket.IO 事件

```typescript
interface ClientToServerEvents {
  "game:join": (gameId: string) => void;
  "game:leave": (gameId: string) => void;
  "game:command": (command: GameCommand) => void;
  "game:ready": (gameId: string) => void;
  "chat:message": (gameId: string, message: string) => void;
}

interface ServerToClientEvents {
  "game:state": (state: GameState) => void;
  "game:turnResult": (result: TurnResult) => void;
  "game:phaseChange": (phase: string) => void;
  "game:playerJoined": (playerId: string) => void;
  "game:playerLeft": (playerId: string) => void;
  "chat:message": (senderId: string, message: string) => void;
  "game:error": (error: { code: string; message: string }) => void;
}

interface GameCommand {
  type: "move" | "attack" | "wait" | "deploy";
  unitId: string;
  target?: HexCoord;
  targetUnitId?: string;
}
```

## 5. 服务端架构图

```mermaid
graph LR
    A["Socket.IO Controller"] --> B["Game Service"]
    B --> C["Simulation Engine"]
    C --> D["Terrain System"]
    C --> E["Combat Calculator"]
    C --> F["Movement Validator"]
    B --> G["Game Repository"]
    B --> H["Replay Recorder"]
    G --> I["SQLite DB"]
    H --> I
    A --> J["Chat Service"]
    A --> K["Room Manager"]
```

## 6. 数据模型

### 6.1 数据模型定义

```mermaid
erDiagram
    "Game" ||--o{ "Player" : "has"
    "Game" }o--|| "Scenario" : "uses"
    "Game" ||--o{ "Turn" : "contains"
    "Game" ||--o{ "Unit" : "has"
    "Player" ||--o{ "Command" : "issues"
    "Turn" ||--o{ "TurnEvent" : "records"
    "Scenario" ||--o{ "ScenarioUnit" : "defines"
    "Scenario" ||--o{ "HexTile" : "contains"

    "Game" {
        string id PK
        string scenarioId FK
        string status
        int currentTurn
        int maxTurns
        string joinCode
        datetime createdAt
        datetime updatedAt
    }

    "Player" {
        string id PK
        string gameId FK
        string name
        string faction
        boolean isReady
    }

    "Unit" {
        string id PK
        string gameId FK
        string type
        string faction
        int hp
        int maxHp
        int attack
        int defense
        int movement
        int q
        int r
        string status
    }

    "Turn" {
        string id PK
        string gameId FK
        int turnNumber
        string phase
        datetime startedAt
        datetime endedAt
    }

    "TurnEvent" {
        string id PK
        string turnId FK
        string type
        string description
        int timestamp
        string data
    }

    "Scenario" {
        string id PK
        string name
        string description
        int mapWidth
        int mapHeight
    }

    "ScenarioUnit" {
        string id PK
        string scenarioId FK
        string type
        string faction
        int q
        int r
    }

    "HexTile" {
        string id PK
        string scenarioId FK
        int q
        int r
        string terrain
    }
```

### 6.2 数据定义语言

```sql
CREATE TABLE games (
  id TEXT PRIMARY KEY,
  scenario_id TEXT NOT NULL REFERENCES scenarios(id),
  status TEXT NOT NULL DEFAULT 'waiting',
  current_turn INTEGER NOT NULL DEFAULT 0,
  max_turns INTEGER NOT NULL DEFAULT 20,
  join_code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE players (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  faction TEXT NOT NULL,
  is_ready INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE units (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  faction TEXT NOT NULL,
  hp INTEGER NOT NULL,
  max_hp INTEGER NOT NULL,
  attack INTEGER NOT NULL,
  defense INTEGER NOT NULL,
  movement INTEGER NOT NULL,
  q INTEGER NOT NULL,
  r INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE turns (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL,
  phase TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT
);

CREATE TABLE turn_events (
  id TEXT PRIMARY KEY,
  turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  data TEXT
);

CREATE TABLE scenarios (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  map_width INTEGER NOT NULL,
  map_height INTEGER NOT NULL
);

CREATE TABLE scenario_units (
  id TEXT PRIMARY KEY,
  scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  faction TEXT NOT NULL,
  q INTEGER NOT NULL,
  r INTEGER NOT NULL
);

CREATE TABLE hex_tiles (
  id TEXT PRIMARY KEY,
  scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  q INTEGER NOT NULL,
  r INTEGER NOT NULL,
  terrain TEXT NOT NULL DEFAULT 'plain'
);

CREATE INDEX idx_games_status ON games(status);
CREATE INDEX idx_units_game ON units(game_id);
CREATE INDEX idx_turns_game ON turns(game_id);
CREATE INDEX idx_players_game ON players(game_id);
CREATE INDEX idx_hex_tiles_scenario ON hex_tiles(scenario_id);
```
