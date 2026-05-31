## 1. 架构设计

```mermaid
graph TB
    subgraph "前端 React + Three.js"
        A["3D场景渲染层"] --> A1["@react-three/fiber"]
        A --> A2["@react-three/drei"]
        A --> A3["@react-three/postprocessing"]
        B["UI交互层"] --> B1["React组件"]
        B --> B2["Zustand状态管理"]
        B --> B3["TailwindCSS样式"]
        C["协同通信层"] --> C1["WebSocket客户端"]
        C --> C2["光标同步"]
        C --> C3["标注广播"]
    end

    subgraph "后端 Express + WebSocket"
        D["API网关层"] --> D1["REST API"]
        D --> D2["WebSocket服务"]
        D --> D3["数据网关适配器"]
        E["业务逻辑层"] --> E1["管道数据服务"]
        E --> E2["告警处理服务"]
        E --> E3["协同会话管理"]
        F["数据访问层"] --> F1["SQLite存储"]
        F --> F2["实时数据缓存"]
    end

    subgraph "外部数据源"
        G["数据网关"] --> G1["SCADA系统"]
        G --> G2["传感器数据"]
        H["实时数据库"] --> H1["压力传感器"]
        H --> H2["流量计"]
        H --> H3["温度传感器"]
    end

    A1 --> D1
    C1 --> D2
    D3 --> G
    D3 --> H
    E1 --> F1
    E1 --> F2
```

## 2. 技术说明

- **前端**：React@18 + TypeScript + Vite + TailwindCSS@3 + Zustand
- **3D渲染**：three.js + @react-three/fiber + @react-three/drei + @react-three/postprocessing
- **图表**：Recharts（历史趋势曲线）
- **初始化工具**：vite-init
- **后端**：Express@4 + TypeScript + ws（WebSocket）
- **数据库**：SQLite（better-sqlite3）存储管道元数据与配置，内存缓存实时运行数据
- **数据网关适配**：后端通过定时轮询模拟对接SCADA/传感器数据网关，提供标准化数据接口

## 3. 路由定义

| 路由 | 用途 |
|------|------|
| / | 3D管网主场景页（场景加载+漫游+层级树） |
| /inspect | 交互巡检页（管道选中+数据面板+路径巡检） |
| /collab | 协同工作页（在线用户+光标同步+标注共享） |
| /monitor | 实时监控仪表盘（动态标注+告警+趋势） |

## 4. API定义

### 4.1 数据类型定义

```typescript
interface PipeSegment {
  id: string;
  name: string;
  area: string;
  material: string;
  diameter: number;
  length: number;
  installDate: string;
  status: 'normal' | 'warning' | 'alarm';
  position: { x: number; y: number; z: number };
  endpoints: [string, string];
}

interface RealtimeData {
  pipeId: string;
  pressure: number;
  flow: number;
  temperature: number;
  timestamp: number;
  status: 'normal' | 'warning' | 'alarm';
}

interface AlarmRecord {
  id: string;
  pipeId: string;
  type: 'pressure_high' | 'pressure_low' | 'flow_abnormal' | 'temperature_high';
  level: 'info' | 'warning' | 'critical';
  value: number;
  threshold: number;
  message: string;
  timestamp: number;
  acknowledged: boolean;
  acknowledgedBy?: string;
}

interface CollaborationUser {
  id: string;
  name: string;
  role: 'engineer' | 'operator' | 'manager';
  color: string;
  cursor?: { x: number; y: number; z: number };
  cameraPosition?: { x: number; y: number; z: number };
  cameraTarget?: { x: number; y: number; z: number };
}

interface Annotation {
  id: string;
  pipeId: string;
  userId: string;
  userName: string;
  content: string;
  position: { x: number; y: number; z: number };
  timestamp: number;
}

interface InspectionPath {
  id: string;
  name: string;
  waypoints: {
    pipeId: string;
    position: { x: number; y: number; z: number };
    stayDuration: number;
  }[];
  createdBy: string;
}
```

### 4.2 REST API

| 方法 | 路径 | 请求体 | 响应 | 说明 |
|------|------|--------|------|------|
| GET | /api/pipes | - | PipeSegment[] | 获取所有管道段元数据 |
| GET | /api/pipes/:id | - | PipeSegment | 获取单个管道段详情 |
| GET | /api/pipes/:id/realtime | - | RealtimeData | 获取管道实时运行数据 |
| GET | /api/pipes/:id/history | ?range=24h\|7d | {timestamps:number[],pressure:number[],flow:number[]} | 获取管道历史数据 |
| GET | /api/alarms | ?acknowledged=false | AlarmRecord[] | 获取告警记录 |
| PUT | /api/alarms/:id/acknowledge | {userId:string} | AlarmRecord | 确认告警 |
| GET | /api/inspections | - | InspectionPath[] | 获取巡检路径列表 |
| POST | /api/inspections | InspectionPath | InspectionPath | 创建巡检路径 |
| GET | /api/annotations | ?pipeId= | Annotation[] | 获取标注列表 |
| POST | /api/annotations | Annotation | Annotation | 创建标注 |
| GET | /api/collab/users | - | CollaborationUser[] | 获取在线用户 |

### 4.3 WebSocket事件

| 事件名 | 方向 | 数据 | 说明 |
|--------|------|------|------|
| realtime:update | 服务端→客户端 | RealtimeData | 实时数据推送(1秒间隔) |
| alarm:new | 服务端→客户端 | AlarmRecord | 新告警推送 |
| collab:join | 服务端→客户端 | CollaborationUser | 用户上线通知 |
| collab:leave | 服务端→客户端 | {userId:string} | 用户下线通知 |
| collab:cursor | 双向 | {userId:string,cursor:{x,y,z}} | 光标位置同步 |
| collab:camera | 双向 | {userId:string,position:{x,y,z},target:{x,y,z}} | 摄像机视角同步 |
| collab:annotation | 双向 | Annotation | 标注实时同步 |

## 5. 服务端架构图

```mermaid
graph LR
    A["Express路由控制器"] --> B["管道数据服务"]
    A --> C["告警处理服务"]
    A --> D["协同会话服务"]
    A --> E["巡检路径服务"]
    B --> F["SQLite数据访问层"]
    C --> F
    D --> G["WebSocket连接管理"]
    E --> F
    B --> H["实时数据缓存(内存)"]
    C --> H
    D --> H
    I["数据网关适配器"] --> H
    I --> J["模拟SCADA数据源"]
    G --> K["WebSocket客户端群"]
```

## 6. 数据模型

### 6.1 数据模型定义

```mermaid
erDiagram
    "Area" {
        string id PK
        string name
        string description
    }
    "PipeSegment" {
        string id PK
        string name
        string areaId FK
        string material
        float diameter
        float length
        string installDate
        string status
        float posX
        float posY
        float posZ
        string endpointAId FK
        string endpointBId FK
    }
    "PipeNode" {
        string id PK
        string name
        string areaId FK
        string type
        float posX
        float posY
        float posZ
    }
    "RealtimeCache" {
        string pipeId PK
        float pressure
        float flow
        float temperature
        int timestamp
        string status
    }
    "AlarmRecord" {
        string id PK
        string pipeId FK
        string type
        string level
        float value
        float threshold
        string message
        int timestamp
        boolean acknowledged
        string acknowledgedBy
    }
    "Annotation" {
        string id PK
        string pipeId FK
        string userId
        string userName
        string content
        float posX
        float posY
        float posZ
        int timestamp
    }
    "InspectionPath" {
        string id PK
        string name
        string createdBy
    }
    "InspectionWaypoint" {
        string id PK
        string pathId FK
        string pipeId FK
        float posX
        float posY
        float posZ
        int stayDuration
        int sortOrder
    }
    "Area" ||--o{ "PipeSegment" : "contains"
    "Area" ||--o{ "PipeNode" : "contains"
    "PipeNode" ||--o{ "PipeSegment" : "endpointA"
    "PipeNode" ||--o{ "PipeSegment" : "endpointB"
    "PipeSegment" ||--o{ "RealtimeCache" : "has"
    "PipeSegment" ||--o{ "AlarmRecord" : "triggers"
    "PipeSegment" ||--o{ "Annotation" : "annotated"
    "InspectionPath" ||--o{ "InspectionWaypoint" : "has"
    "PipeSegment" ||--o{ "InspectionWaypoint" : "visits"
```

### 6.2 数据定义语言

```sql
CREATE TABLE area (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT
);

CREATE TABLE pipe_node (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    area_id TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'junction',
    pos_x REAL NOT NULL,
    pos_y REAL NOT NULL,
    pos_z REAL NOT NULL,
    FOREIGN KEY (area_id) REFERENCES area(id)
);

CREATE TABLE pipe_segment (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    area_id TEXT NOT NULL,
    material TEXT NOT NULL DEFAULT 'steel',
    diameter REAL NOT NULL,
    length REAL NOT NULL,
    install_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'normal',
    pos_x REAL NOT NULL,
    pos_y REAL NOT NULL,
    pos_z REAL NOT NULL,
    endpoint_a_id TEXT NOT NULL,
    endpoint_b_id TEXT NOT NULL,
    FOREIGN KEY (area_id) REFERENCES area(id),
    FOREIGN KEY (endpoint_a_id) REFERENCES pipe_node(id),
    FOREIGN KEY (endpoint_b_id) REFERENCES pipe_node(id)
);

CREATE TABLE alarm_record (
    id TEXT PRIMARY KEY,
    pipe_id TEXT NOT NULL,
    type TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'info',
    value REAL NOT NULL,
    threshold REAL NOT NULL,
    message TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    acknowledged INTEGER NOT NULL DEFAULT 0,
    acknowledged_by TEXT,
    FOREIGN KEY (pipe_id) REFERENCES pipe_segment(id)
);

CREATE TABLE annotation (
    id TEXT PRIMARY KEY,
    pipe_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    content TEXT NOT NULL,
    pos_x REAL NOT NULL,
    pos_y REAL NOT NULL,
    pos_z REAL NOT NULL,
    timestamp INTEGER NOT NULL,
    FOREIGN KEY (pipe_id) REFERENCES pipe_segment(id)
);

CREATE TABLE inspection_path (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_by TEXT NOT NULL
);

CREATE TABLE inspection_waypoint (
    id TEXT PRIMARY KEY,
    path_id TEXT NOT NULL,
    pipe_id TEXT NOT NULL,
    pos_x REAL NOT NULL,
    pos_y REAL NOT NULL,
    pos_z REAL NOT NULL,
    stay_duration INTEGER NOT NULL DEFAULT 2000,
    sort_order INTEGER NOT NULL,
    FOREIGN KEY (path_id) REFERENCES inspection_path(id),
    FOREIGN KEY (pipe_id) REFERENCES pipe_segment(id)
);

CREATE INDEX idx_pipe_segment_area ON pipe_segment(area_id);
CREATE INDEX idx_alarm_record_pipe ON alarm_record(pipe_id);
CREATE INDEX idx_alarm_record_ack ON alarm_record(acknowledged);
CREATE INDEX idx_annotation_pipe ON annotation(pipe_id);
CREATE INDEX idx_waypoint_path ON inspection_waypoint(path_id);
```
