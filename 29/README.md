# 矿山巷道通风管网三维 3D 交互系统

基于 Three.js + SpringBoot + MongoDB 开发的矿山巷道通风管网三维交互系统。

## 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                     前端 (Vue 3 + Vite)                  │
├─────────────┬─────────────┬─────────────┬────────────────┤
│ 3D场景渲染  │ 视角交互    │ 管网标注    │ 通风数据加载   │
│ 模块        │ 模块        │ 编辑模块    │ 模块           │
└─────────────┴──────┬──────┴─────────────┴────────────────┘
                     │ HTTP/WebSocket
┌────────────────────┴─────────────────────────────────────┐
│                后端 (Spring Boot 3.2)                    │
├─────────────────┬─────────────────────────────────────────┤
│ 数据服务层      │ RESTful API + 业务逻辑                  │
└─────────────────┬─────────────────────────────────────────┘
                     │
┌────────────────────┴─────────────────────────────────────┐
│                数据库 (MongoDB)                          │
└──────────────────────────────────────────────────────────┘
```

## 功能模块

### 1. 3D 场景渲染模块
- 巷道三维模型渲染（拱形截面）
- 通风管道三维模型渲染（曲线管道）
- 风机点位三维模型渲染（带旋转动画）
- 地面网格、坐标轴、光照系统
- 雾效、背景色配置

### 2. 通风数据加载模块
- 巷道、管道、风机、标注数据批量加载
- Web Worker 海量数据处理（路径简化、点云抽稀）
- 数据缓存机制（5分钟 TTL）
- 增量加载、分页加载支持
- 加载进度实时反馈

### 3. 视角交互模块
- 缩放、旋转、平移操作（OrbitControls）
- 视角预设（顶视图、前视图、侧视图、透视图）
- 飞行动画（flyTo 指定位置）
- 射线拾取（鼠标悬停、点击选中）
- 框选功能（Shift + 拖拽）
- 相机状态保存/恢复

### 4. 后端数据服务模块
- Spring Boot 3.2 + Spring Data MongoDB
- RESTful API 接口（CRUD + 批量操作）
- 数据自动初始化（启动时导入 JSON 数据）
- 数据导入/导出接口
- 跨域支持

### 5. 管网标注编辑模块
- 文字标注（CSS2DRenderer）
- 图标标注（Sprite）
- 标注增删改查
- 标注拖拽定位
- 标注样式配置
- 标注搜索、筛选

## 技术栈

### 前端
- **框架**: Vue 3 + Vite 5
- **3D 引擎**: Three.js r160+
- **UI 组件**: Element Plus
- **HTTP 客户端**: Axios
- **动画库**: @tweenjs/tween.js
- **其他**: Web Worker

### 后端
- **框架**: Spring Boot 3.2.0
- **ORM**: Spring Data MongoDB
- **构建工具**: Maven
- **Java 版本**: JDK 17
- **JSON 处理**: Jackson

### 数据库
- MongoDB 6.0+

## 项目结构

```
.
├── backend/                          # 后端项目
│   ├── src/main/java/com/mine/ventilation/
│   │   ├── common/                   # 公共类
│   │   │   └── Result.java           # 统一返回结果
│   │   ├── config/                   # 配置类
│   │   │   ├── CorsConfig.java       # 跨域配置
│   │   │   └── DataInitializer.java  # 数据初始化
│   │   ├── controller/               # 控制器层
│   │   │   ├── TunnelController.java
│   │   │   ├── PipeController.java
│   │   │   ├── FanController.java
│   │   │   ├── AnnotationController.java
│   │   │   └── DataController.java
│   │   ├── entity/                   # 实体类
│   │   │   ├── Point3D.java
│   │   │   ├── Tunnel.java
│   │   │   ├── Pipe.java
│   │   │   ├── Fan.java
│   │   │   └── Annotation.java
│   │   ├── repository/               # 数据访问层
│   │   ├── service/                  # 业务逻辑层
│   │   └── VentilationSystemApplication.java
│   └── src/main/resources/
│       ├── data/                     # 初始化数据
│       │   ├── tunnels.json
│       │   ├── pipes.json
│       │   ├── fans.json
│       │   └── annotations.json
│       └── application.yml           # 应用配置
├── frontend/                         # 前端项目
│   ├── src/
│   │   ├── api/                      # API 接口
│   │   │   └── index.js
│   │   ├── components/               # Vue 组件
│   │   │   ├── SceneViewer.vue       # 3D场景容器
│   │   │   ├── ControlPanel.vue      # 控制面板
│   │   │   ├── InfoPanel.vue         # 信息面板
│   │   │   ├── AnnotationPanel.vue   # 标注编辑面板
│   │   │   └── DataLoading.vue       # 数据加载进度
│   │   ├── composables/              # 组合式函数
│   │   │   ├── useScene.js
│   │   │   ├── useData.js
│   │   │   └── useAnnotation.js
│   │   ├── core/                     # 核心模块
│   │   │   ├── SceneManager.js       # 场景管理器
│   │   │   ├── ObjectFactory.js      # 3D对象工厂
│   │   │   ├── RenderLayer.js        # 渲染层管理
│   │   │   ├── CameraController.js   # 相机控制器
│   │   │   ├── InteractionManager.js # 交互管理器
│   │   │   ├── AnimationManager.js   # 动画管理器
│   │   │   ├── LayerController.js    # 分层控制器
│   │   │   ├── DataLoader.js         # 数据加载器
│   │   │   └── AnnotationManager.js  # 标注管理器
│   │   ├── utils/                    # 工具函数
│   │   │   ├── math.js               # 数学工具
│   │   │   └── constants.js          # 常量配置
│   │   ├── workers/                  # Web Worker
│   │   │   ├── dataProcessor.worker.js
│   │   │   └── index.js
│   │   ├── App.vue
│   │   ├── main.js
│   │   └── style.css
│   ├── package.json
│   ├── vite.config.js
│   └── index.html
├── start-backend.bat                 # 后端启动脚本
├── start-frontend.bat                # 前端启动脚本
└── start-all.bat                     # 一键启动脚本
```

## 快速开始

### 环境要求
- JDK 17+
- Maven 3.8+
- Node.js 16+
- MongoDB 6.0+

### 1. 启动 MongoDB

确保 MongoDB 已启动并运行在 `mongodb://localhost:27017`

```bash
# Windows
net start MongoDB

# 或手动启动
mongod --dbpath /your/data/path
```

### 2. 启动后端

**方式一：使用启动脚本**
```bash
start-backend.bat
```

**方式二：手动启动**
```bash
cd backend
mvn spring-boot:run
```

后端服务将运行在: http://localhost:8081

### 3. 启动前端

**方式一：使用启动脚本**
```bash
start-frontend.bat
```

**方式二：手动启动**
```bash
cd frontend
npm install
npm run dev
```

前端服务将运行在: http://localhost:5173

### 4. 一键启动（推荐）

```bash
start-all.bat
```

## API 接口文档

### 巷道接口
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/tunnels` | 获取所有巷道 |
| GET | `/api/tunnels/{id}` | 获取单个巷道 |
| GET | `/api/tunnels/layer/{layer}` | 按层级查询 |
| POST | `/api/tunnels` | 新增巷道 |
| POST | `/api/tunnels/batch` | 批量新增 |
| PUT | `/api/tunnels` | 更新巷道 |
| DELETE | `/api/tunnels/{id}` | 删除巷道 |

### 管道接口
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/pipes` | 获取所有管道 |
| GET | `/api/pipes/{id}` | 获取单个管道 |
| GET | `/api/pipes/layer/{layer}` | 按层级查询 |
| GET | `/api/pipes/tunnel/{tunnelId}` | 按巷道查询 |
| POST | `/api/pipes` | 新增管道 |
| POST | `/api/pipes/batch` | 批量新增 |

### 风机接口
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/fans` | 获取所有风机 |
| GET | `/api/fans/{id}` | 获取单个风机 |
| GET | `/api/fans/status/{status}` | 按状态查询 |
| POST | `/api/fans` | 新增风机 |
| POST | `/api/fans/batch` | 批量新增 |

### 标注接口
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/annotations` | 获取所有标注 |
| GET | `/api/annotations/{id}` | 获取单个标注 |
| GET | `/api/annotations/type/{type}` | 按类型查询 |
| POST | `/api/annotations` | 新增标注 |
| POST | `/api/annotations/batch` | 批量新增 |
| PUT | `/api/annotations` | 更新标注 |
| DELETE | `/api/annotations/{id}` | 删除标注 |

### 数据管理接口
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/data/import` | 导入初始数据 |
| POST | `/api/data/reimport?confirm=true` | 重新导入数据 |
| POST | `/api/data/clear?confirm=true` | 清除所有数据 |
| GET | `/api/data/status` | 获取数据状态 |
| GET | `/api/data/all` | 获取所有汇总数据 |
| GET | `/api/data/summary` | 获取数据统计 |

## 操作说明

### 鼠标操作
- **左键拖拽**: 旋转场景
- **右键拖拽**: 平移场景
- **滚轮**: 缩放场景
- **左键点击**: 选中对象
- **双击**: 飞行到选中对象
- **Shift + 拖拽**: 框选多个对象
- **ESC**: 取消选中

### 分层查看
- 左侧控制面板可切换不同层级（-100m ~ -500m）
- 可按类型显示/隐藏（巷道、管道、风机、标注）
- 支持图层隔离显示

### 标注编辑
1. 点击顶部工具栏「标注管理」
2. 点击「添加标注」按钮
3. 选择标注类型，填写内容
4. 点击场景确定标注位置
5. 可拖拽调整标注位置

## 数据说明

### 初始化数据
系统启动时自动从 JSON 文件导入以下数据：
- **巷道**: 5 条（-100m ~ -500m 各 1 条）
- **管道**: 15 条（含 1000+ 坐标点）
- **风机**: 10 台（主扇风机、局部风机）
- **标注**: 10 个（监测点、缺陷、设备等）

### 海量数据处理
- 管道坐标点通过 Ramer-Douglas-Peucker 算法简化
- Web Worker 后台处理不阻塞 UI
- 支持按距离过滤、边界框过滤

## 常见问题

### 1. 后端启动失败
- 检查 MongoDB 是否启动
- 检查 MongoDB 连接配置 `backend/src/main/resources/application.yml`
- 检查 JDK 版本是否为 17+

### 2. 前端加载数据失败
- 检查后端是否正常启动
- 检查浏览器控制台网络请求
- 确认 `vite.config.js` 代理配置正确

### 3. 3D 场景卡顿
- 减少显示的对象数量
- 启用图层隔离
- 关闭风流粒子动画
- 检查浏览器 WebGL 支持

### 4. 数据导入失败
- 调用 `POST /api/data/reimport?confirm=true` 重新导入
- 检查 JSON 数据格式是否正确
- 查看后端日志定位问题

## 构建部署

### 前端构建
```bash
cd frontend
npm run build
```
构建产物在 `frontend/dist` 目录

### 后端打包
```bash
cd backend
mvn clean package
```
Jar 包在 `backend/target/ventilation-system-0.0.1-SNAPSHOT.jar`

### 运行 Jar 包
```bash
java -jar ventilation-system-0.0.1-SNAPSHOT.jar
```

## 开发计划

- [ ] 增加更多巷道截面类型支持
- [ ] 支持通风网络解算可视化
- [ ] 增加实时数据推送（WebSocket）
- [ ] 支持 VR 模式浏览
- [ ] 增加测量工具（距离、角度、面积）
- [ ] 支持导出 3D 模型（glTF、OBJ）

## 许可证

MIT License
