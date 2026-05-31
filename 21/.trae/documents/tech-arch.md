
## 1. 架构设计

```mermaid
graph TB
    subgraph "前端层"
        A["Vue3 + TypeScript"]
        B["舱室可视化组件"]
        C["数据仪表盘组件"]
        D["告警通知组件"]
        E["设备控制组件"]
    end
    
    subgraph "后端服务层"
        F["Express + Node.js"]
        G["数据接收网关 API"]
        H["设备控制服务"]
        I["告警引擎服务"]
        J["WebSocket服务"]
    end
    
    subgraph "数据层"
        K["InfluxDB 时序数据库"]
        L["SQLite 配置数据库"]
        M["Redis 缓存/消息队列"]
    end
    
    subgraph "设备层"
        N["温湿度传感器"]
        O["液位传感器"]
        P["压力传感器"]
        Q["辅助控制设备"]
    end
    
    A --> B & C & D & E
    F --> G & H & I & J
    G --> K
    H --> Q
    I --> L
    J <--> A
    N & O & P --> G
    K --> F
    L --> F
    M --> F
```

## 2. 技术描述

### 2.1 技术栈
- **前端**: Vue 3 + TypeScript + Vite + Tailwind CSS 3 + Vue Router + Pinia
- **后端**: Express 4 + Node.js + TypeScript
- **数据库**: 
  - InfluxDB 2.x (时序数据存储)
  - SQLite (配置数据存储)
  - Redis (消息队列/缓存)
- **可视化**: ECharts 5.x
- **实时通信**: Socket.io
- **部署**: Docker Compose

### 2.2 目录结构
```
project/
├── src/                          # 前端源码
│   ├── components/              # 通用组件
│   │   ├── cabin/              # 舱室可视化组件
│   │   ├── dashboard/          # 仪表盘组件
│   │   ├── alarm/              # 告警组件
│   │   └── control/            # 控制组件
│   ├── composables/            # Vue组合式函数
│   ├── pages/                  # 页面组件
│   ├── stores/                 # Pinia状态管理
│   ├── utils/                  # 工具函数
│   ├── api/                    # API请求封装
│   ├── types/                  # TypeScript类型定义
│   └── router/                 # 路由配置
├── api/                         # 后端源码
│   ├── src/
│   │   ├── controllers/        # 控制器
│   │   ├── services/           # 业务服务
│   │   ├── models/             # 数据模型
│   │   ├── routes/             # 路由定义
│   │   ├── middleware/         # 中间件
│   │   ├── gateways/           # 数据接收网关
│   │   └── utils/              # 工具函数
│   └── config/                 # 环境配置
│       ├── nearshore/          # 近海环境配置
│       └── offshore/           # 远海环境配置
├── shared/                      # 前后端共享类型
├── docker/                      # Docker配置
└── .trae/documents/            # 项目文档
```

## 3. 路由定义

| 路由路径 | 页面名称 | 功能描述 |
|---------|---------|----------|
| / | 监控大屏 | 舱室可视化总览、实时数据展示 |
| /dashboard | 数据仪表盘 | 多维度数据分析、历史趋势 |
| /control | 设备控制 | 设备列表、远程控制、规则配置 |
| /alarm | 告警中心 | 告警列表、告警处理 |
| /settings | 系统配置 | 环境切换、用户管理 |

## 4. API 定义

### 4.1 数据接收网关 API

```typescript
// 传感数据类型
interface SensorData {
  cabinId: string;
  sensorId: string;
  sensorType: 'temperature' | 'humidity' | 'level' | 'pressure';
  value: number;
  unit: string;
  timestamp: Date;
}

// 批量数据接收
POST /api/gateway/sensor/batch
Request: { data: SensorData[] }
Response: { success: boolean, received: number }

// 单条数据接收
POST /api/gateway/sensor
Request: SensorData
Response: { success: boolean }
```

### 4.2 设备控制 API

```typescript
interface DeviceControlCommand {
  deviceId: string;
  action: 'turnOn' | 'turnOff' | 'setLevel';
  value?: number;
  operatorId: string;
}

POST /api/control/device
Request: DeviceControlCommand
Response: { success: boolean, message: string }

GET /api/control/devices
Response: { devices: Device[] }
```

### 4.3 数据查询 API

```typescript
// 实时数据
GET /api/data/realtime/:cabinId
Response: { cabinId: string, sensors: SensorData[] }

// 历史数据
GET /api/data/history
Query: { sensorId, startTime, endTime, interval }
Response: { data: Array<{time: Date, value: number}> }
```

## 5. 服务架构图

```mermaid
graph LR
    subgraph "Controller 控制层"
        A1["GatewayController"]
        A2["DataController"]
        A3["ControlController"]
        A4["AlarmController"]
        A5["ConfigController"]
    end
    
    subgraph "Service 服务层"
        B1["SensorDataService"]
        B2["DeviceControlService"]
        B3["AlarmEngineService"]
        B4["LinkageRuleService"]
        B5["WebSocketService"]
    end
    
    subgraph "Repository 数据层"
        C1["InfluxDBRepository"]
        C2["SQLiteRepository"]
        C3["RedisRepository"]
    end
    
    subgraph "Database 数据库"
        D1["InfluxDB"]
        D2["SQLite"]
        D3["Redis"]
    end
    
    A1 --> B1
    A2 --> B1
    A3 --> B2 & B4
    A4 --> B3
    B1 --> C1
    B2 --> C2
    B3 --> C2 & C3
    B4 --> C2
    B5 --> C3
    C1 --> D1
    C2 --> D2
    C3 --> D3
```

## 6. 数据模型

### 6.1 数据模型定义

```mermaid
erDiagram
    CABIN ||--o{ SENSOR : contains
    CABIN ||--o{ DEVICE : contains
    SENSOR ||--o{ SENSOR_DATA : generates
    DEVICE ||--o{ CONTROL_LOG : generates
    ALARM_RULE ||--o{ ALARM_LOG : triggers
    
    CABIN {
        string id PK
        string name
        string description
        string position
        boolean status
    }
    
    SENSOR {
        string id PK
        string cabinId FK
        string type
        string name
        string unit
        float minValue
        float maxValue
        float warnThreshold
        float alarmThreshold
    }
    
    DEVICE {
        string id PK
        string cabinId FK
        string type
        string name
        boolean status
        float currentValue
    }
    
    ALARM_RULE {
        string id PK
        string sensorId FK
        string condition
        float threshold
        string level
        boolean enabled
    }
    
    ALARM_LOG {
        string id PK
        string ruleId FK
        string sensorId
        float triggerValue
        string level
        datetime timestamp
        string status
        string handlerId
    }
    
    CONTROL_LOG {
        string id PK
        string deviceId FK
        string action
        float value
        string operatorId
        datetime timestamp
        boolean success
    }
```

### 6.2 InfluxDB 数据结构

- **Bucket**: `sensor_data`
- **Measurement**: `sensor_reading`
- **Tags**: `cabinId`, `sensorId`, `sensorType`
- **Fields**: `value` (float)
- **Timestamp**: 数据采集时间戳
