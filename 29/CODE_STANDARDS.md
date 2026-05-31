# 代码规范与数据格式标准

## 目录
- [项目结构规范](#项目结构规范)
- [前端代码规范](#前端代码规范)
- [后端代码规范](#后端代码规范)
- [数据格式标准](#数据格式标准)
- [性能优化指南](#性能优化指南)

---

## 项目结构规范

### 后端项目结构
```
backend/src/main/java/com/mine/ventilation/
├── common/              # 公共类
│   └── Result.java     # 统一返回结果
├── config/              # 配置类
│   ├── CorsConfig.java
│   └── DataInitializer.java
├── controller/          # 控制器层
├── entity/              # 实体类
├── repository/          # 数据访问层
└── service/             # 业务逻辑层
```

### 前端项目结构
```
frontend/src/
├── api/                 # API 接口层
│   └── index.js
├── components/          # Vue 组件
├── composables/         # 组合式函数
├── core/                # 核心模块 (Three.js)
├── utils/               # 工具函数
├── workers/             # Web Worker
└── assets/              # 静态资源
```

---

## 前端代码规范

### 1. 模块导入规范
```javascript
// 优先顺序：第三方库 → 内部模块 → 样式
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as TWEEN from '@tweenjs/tween.js';

import { SceneManager } from './core/SceneManager.js';
```

### 2. 类命名规范
- 类名使用 **PascalCase**：`SceneManager`, `ObjectFactory`
- 实例使用 **camelCase**：`sceneManager`, `cameraController`
- 常量使用 **UPPER_SNAKE_CASE**：`MAX_DISTANCE`, `DEFAULT_COLOR`

### 3. 注释规范
```javascript
/**
 * 创建管道模型
 * @param {Array<THREE.Vector3|Object>} points - 管道节点坐标
 * @param {number} [diameter=5] - 管道直径
 * @param {number} [color=0x4a90d9] - 管道颜色
 * @returns {THREE.Group} 管道模型组
 */
static createPipe(points, diameter = 5, color = 0x4a90d9) {
  // ...
}
```

### 4. Three.js 资源管理
```javascript
// 必须正确释放资源
dispose() {
  // 几何体
  if (this.geometry) this.geometry.dispose();
  // 材质
  if (this.material) {
    if (Array.isArray(this.material)) {
      this.material.forEach(m => m.dispose());
    } else {
      this.material.dispose();
    }
  }
  // 纹理
  if (this.material?.map) this.material.map.dispose();
}
```

---

## 后端代码规范

### 1. 实体类规范
```java
@Data
@Document(collection = "tunnels")
@JsonInclude(JsonInclude.Include.NON_NULL)
public class Tunnel {
    @Id
    private String id;
    
    // 坐标使用 Point3D
    private Point3D startPoint;
    private Point3D endPoint;
    private List<Point3D> pathPoints;
    
    // 时间字段统一命名
    @JsonProperty("createTime")
    private LocalDateTime createTime;
    
    @JsonProperty("updateTime")
    private LocalDateTime updateTime;
}
```

### 2. Controller 规范
```java
@RestController
@RequestMapping("/api/tunnels")
@CrossOrigin(origins = "*")
public class TunnelController {

    @Autowired
    private TunnelService tunnelService;

    // 统一返回 Result
    @GetMapping
    public Result<List<Tunnel>> getAll() {
        return Result.success(tunnelService.findAll());
    }

    @GetMapping("/{id}")
    public Result<Tunnel> getById(@PathVariable String id) {
        return tunnelService.findById(id)
                .map(Result::success)
                .orElse(Result.error("数据不存在"));
    }
}
```

### 3. Service 规范
```java
@Service
public class TunnelService {

    @Autowired
    private TunnelRepository tunnelRepository;

    // 自动维护时间戳
    public Tunnel save(Tunnel tunnel) {
        LocalDateTime now = LocalDateTime.now();
        if (tunnel.getCreateTime() == null) {
            tunnel.setCreateTime(now);
        }
        tunnel.setUpdateTime(now);
        return tunnelRepository.save(tunnel);
    }
}
```

---

## 数据格式标准

### 1. 三维坐标 (Point3D)
**标准格式（推荐）**：
```json
{ "x": 100.0, "y": 200.0, "z": -100.0 }
```

**兼容格式（自动转换）**：
```json
[100.0, 200.0, -100.0]
```

**Java 实体**：
```java
@Data
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class Point3D {
    private Double x;
    private Double y;
    private Double z;
    
    // 辅助方法
    public static Point3D fromArray(double[] arr) {
        return new Point3D(arr[0], arr[1], arr[2]);
    }
    
    public double[] toArray() {
        return new double[]{x, y, z};
    }
}
```

**前端转换**：
```javascript
function normalizePoint3D(point) {
    if (Array.isArray(point)) {
        return { x: point[0], y: point[1], z: point[2] };
    }
    return point || { x: 0, y: 0, z: 0 };
}
```

### 2. 巷道数据 (Tunnel)
```json
{
  "id": "tunnel-001",
  "name": "-100m主运输巷",
  "level": -100,
  "type": "main_transport",
  "width": 4.5,
  "height": 3.8,
  "length": 850.0,
  "crossSectionArea": 17.1,
  "airflowDirection": "positive",
  "designAirVolume": 25.0,
  "actualAirVolume": 23.5,
  "windSpeed": 1.37,
  "airResistance": 0.015,
  "status": "normal",
  "description": "巷道描述",
  "pathPoints": [
    { "x": 100, "y": 200, "z": -100 },
    { "x": 150, "y": 200, "z": -100 }
  ],
  "startPoint": { "x": 100, "y": 200, "z": -100 },
  "endPoint": { "x": 950, "y": 200, "z": -100 },
  "connectedTunnels": ["tunnel-003"],
  "connectedPipes": ["pipe-001"],
  "createTime": "2024-01-15T08:30:00",
  "updateTime": "2024-12-20T14:20:00"
}
```

### 3. 管道数据 (Pipe)
```json
{
  "id": "pipe-001",
  "tunnelId": "tunnel-001",
  "name": "主进风管道",
  "type": "intake",
  "layer": "layer-100",
  "diameter": 0.8,
  "length": 120.5,
  "thickness": 0.008,
  "material": "steel",
  "status": "normal",
  "flowRate": 15.5,
  "pressure": 150.0,
  "windSpeed": 8.2,
  "temperature": 18.5,
  "points": [
    { "x": 100, "y": 200, "z": -100 },
    { "x": 200, "y": 200, "z": -100 }
  ],
  "startPoint": { "x": 100, "y": 200, "z": -100 },
  "endPoint": { "x": 500, "y": 200, "z": -100 },
  "roughness": 0.00015,
  "airResistance": 0.025,
  "leakageRate": 0.02,
  "valveConfig": {
    "hasValve": true,
    "valvePosition": 0.5,
    "type": "butterfly"
  },
  "createTime": "2024-01-15T08:30:00",
  "updateTime": "2024-12-20T14:20:00"
}
```

### 4. 风机数据 (Fan)
```json
{
  "id": "fan-001",
  "tunnelId": "tunnel-001",
  "pipeId": "pipe-001",
  "name": "主扇风机-1",
  "code": "FAN-M-001",
  "position": { "x": 300, "y": 200, "z": -100 },
  "type": "axial",
  "model": "FBCDZ-8-NO25",
  "status": "running",
  "power": 315.0,
  "rotationSpeed": 980,
  "airflow": 85.5,
  "efficiency": 0.85,
  "ratedParameters": {
    "power": 315,
    "voltage": 6000,
    "current": 35,
    "rotationSpeed": 980,
    "airflow": 90,
    "pressure": 2800
  },
  "realTimeData": {
    "power": 298,
    "current": 32.5,
    "vibration": 2.1,
    "temperature": 65.5
  },
  "monitoringPoints": [
    { "name": "入口温度", "value": 18, "unit": "°C" },
    { "name": "出口静压", "value": 2500, "unit": "Pa" }
  ],
  "maintenance": {
    "lastMaintenance": "2024-12-01",
    "nextMaintenance": "2025-03-01",
    "runningHours": 8520
  },
  "createTime": "2024-01-15T08:30:00",
  "updateTime": "2024-12-20T14:20:00"
}
```

### 5. 标注数据 (Annotation)
```json
{
  "id": "anno-001",
  "type": "monitoring_point",
  "subtype": "gas",
  "position": { "x": 300, "y": 200, "z": -100 },
  "title": "瓦斯监测点",
  "content": "CH4 浓度: 0.12%",
  "color": "#4CAF50",
  "size": 1.0,
  "opacity": 0.9,
  "rotation": 0,
  "priority": 1,
  "severity": 2,
  "status": "normal",
  "tags": ["瓦斯", "监测", "-100m"],
  "customFields": {
    "sensorModel": "GJC4",
    "alarmThreshold": 0.8
  },
  "attachments": [
    { "name": "安装照片.jpg", "url": "/uploads/xxx.jpg" }
  ],
  "comments": [
    { "user": "张三", "content": "设备正常", "time": "2024-12-20" }
  ],
  "createTime": "2024-01-15T08:30:00",
  "updateTime": "2024-12-20T14:20:00"
}
```

---

## 性能优化指南

### 1. Three.js 渲染优化

#### 减少 Draw Call
```javascript
// 使用材质缓存
static materialCache = new Map();

static getOrCreateMaterial(type, props) {
    const key = `${type}_${JSON.stringify(props)}`;
    if (this.materialCache.has(key)) {
        return this.materialCache.get(key);
    }
    const material = new THREE[`${type}Material`](props);
    this.materialCache.set(key, material);
    return material;
}
```

#### 使用 LOD (Level of Detail)
```javascript
static createPipeLOD(points, diameter, color) {
    const lod = new THREE.LOD();
    // 低精度（远距离）
    lod.addLevel(this.createPipe(points, diameter, color, 'low'), 150);
    // 中精度（中距离）
    lod.addLevel(this.createPipe(points, diameter, color, 'medium'), 50);
    // 高精度（近距离）
    lod.addLevel(this.createPipe(points, diameter, color, 'high'), 0);
    return lod;
}
```

#### 降低渲染质量
| 参数 | 性能优先 | 平衡 | 画质优先 |
|------|----------|------|----------|
| pixelRatio | 1.0 | 1.25 | 1.5 |
| 阴影 | 关闭 | 1024 | 2048 |
| 抗锯齿 | 关闭 | MSAA | MSAA + FXAA |
| 管道分段 | 8 | 16 | 32 |

### 2. 相机参数配置（防止穿透）
```javascript
// 推荐配置
{
  cameraNear: 5,           // 近裁剪面（不能太小）
  cameraFar: 5000,         // 远裁剪面
  minDistance: 20,         // 最小缩放距离
  maxDistance: 3000,       // 最大缩放距离
  minPolarAngle: 0.1,      // 最小俯仰角（防止翻转）
  maxPolarAngle: Math.PI / 2 - 0.01
}
```

### 3. Web Worker 数据处理
```javascript
// 主线程
import workerManager from './workers';

const processed = await workerManager.processPipes(rawData, {
    simplify: true,
    simplifyTolerance: 0.5,
    calculateBounds: true
});
```

### 4. 数据加载优化
```javascript
class DataLoader {
    constructor() {
        this.cache = new Map();
        this.cacheTTL = 5 * 60 * 1000;  // 5分钟缓存
        this.loadingPromises = new Map();  // 防重复请求
    }

    async loadType(type, forceRefresh = false) {
        const cacheKey = `all_${type}`;
        const cached = this.getFromCache(cacheKey);
        if (cached && !forceRefresh) return cached;
        
        if (this.loadingPromises.has(cacheKey)) {
            return this.loadingPromises.get(cacheKey);
        }
        // ... 加载逻辑
    }
}
```

### 5. 标注渲染优化
```javascript
// CSS2D 渲染器配置
{
  pointerEvents: 'none',    // 不阻止交互
  zIndex: 10,               // 层级合理
  position: 'absolute',
  top: 0,
  left: 0
}

// 大量标注时启用聚合
if (annotations.length > 100) {
    // 使用聚合渲染或按需加载
    enableClustering();
}
```

---

## 常见问题

### Q1: 相机缩放为什么会穿透模型？
**原因**：近裁剪面设置太小（0.1）或 minDistance 太小

**解决方案**：
- cameraNear = 5（最小不要小于 1）
- minDistance = 20（根据场景调整）
- 启用动态裁剪面调整

### Q2: 标注位置为什么会偏移？
**原因**：鼠标坐标计算未考虑容器偏移

**解决方案**：
```javascript
const rect = container.getBoundingClientRect();
mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
```

### Q3: 数据量大了为什么卡顿？
**原因**：Draw Call 太多或几何体太复杂

**解决方案**：
1. 使用 LOD 降低远距离精度
2. 材质缓存复用
3. Web Worker 处理数据
4. 视锥体剔除（frustumCulled: true）
5. 降低像素比（pixelRatio = 1）
