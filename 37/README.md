# 工业设备时序振动数据分析可视化全栈系统

## 项目概述

本系统是一个多文件、跨服务的工业设备时序振动数据分析可视化全栈系统，用于实时采集、分析和可视化工业设备的振动数据，帮助用户监测设备状态、识别异常、生成分析报告。

## 系统架构

### 后端模块

1. **数据采集转发模块** ([backend/app/services/data_collection_service.py](file:///e:/标注项目/trae3/37/backend/app/services/data_collection_service.py))
   - 支持模拟振动数据生成（正弦波、噪声、异常信号）
   - 历史数据批量生成
   - 实时数据采集（可扩展对接真实传感器）
   - 发布/订阅模式的数据转发

2. **时序数据计算模块** ([backend/app/services/timeseries_calculator.py](file:///e:/标注项目/trae3/37/backend/app/services/timeseries_calculator.py))
   - 时域特征计算：RMS、峰值、峭度、偏度、波峰因数
   - 频域分析：FFT变换、主频提取、谐波分析、频带能量
   - 统计特征：均值、标准差、中位数、峰峰值

3. **异常分析模块** ([backend/app/services/anomaly_detector.py](file:///e:/标注项目/trae3/37/backend/app/services/anomaly_detector.py))
   - 阈值检测：RMS、峰值、温度阈值告警
   - 统计异常：Z-score离群点检测
   - 频率异常：谐波失真检测
   - 趋势分析：设备劣化趋势识别
   - 故障分类：轴承损伤、不平衡、润滑问题等

4. **数据库读写模块**
   - 数据模型：[backend/app/models/](file:///e:/标注项目/trae3/37/backend/app/models/)
   - CRUD服务：[backend/app/services/crud_service.py](file:///e:/标注项目/trae3/37/backend/app/services/crud_service.py)
   - 数据库配置：[backend/app/core/database.py](file:///e:/标注项目/trae3/37/backend/app/core/database.py)

### 前端模块

1. **数据筛选模块** ([frontend/src/components/DataFilter.vue](file:///e:/标注项目/trae3/37/frontend/src/components/DataFilter.vue))
   - 设备选择下拉框
   - 时间范围选择器
   - 快捷时间选择（1小时/24小时/7天）

2. **多维图表可视化模块**
   - 时域波形图：[frontend/src/components/VibrationChart.vue](file:///e:/标注项目/trae3/37/frontend/src/components/VibrationChart.vue)
   - 频谱分析图：[frontend/src/components/FFTChart.vue](file:///e:/标注项目/trae3/37/frontend/src/components/FFTChart.vue)
   - 状态卡片：[frontend/src/components/StatusCard.vue](file:///e:/标注项目/trae3/37/frontend/src/components/StatusCard.vue)

3. **报表导出模块** ([frontend/src/views/Reports.vue](file:///e:/标注项目/trae3/37/frontend/src/views/Reports.vue))
   - 振动数据报表生成（Excel格式）
   - 异常分析报表生成（Excel格式）
   - 报表下载功能

### API接口层

- 设备管理API：[backend/app/api/devices.py](file:///e:/标注项目/trae3/37/backend/app/api/devices.py)
- 振动数据API：[backend/app/api/vibration.py](file:///e:/标注项目/trae3/37/backend/app/api/vibration.py)
- 异常告警API：[backend/app/api/anomalies.py](file:///e:/标注项目/trae3/37/backend/app/api/anomalies.py)
- 报表中心API：[backend/app/api/reports.py](file:///e:/标注项目/trae3/37/backend/app/api/reports.py)
- 数据采集API：[backend/app/api/data_collection.py](file:///e:/标注项目/trae3/37/backend/app/api/data_collection.py)

### 页面视图

- 数据概览：[frontend/src/views/Dashboard.vue](file:///e:/标注项目/trae3/37/frontend/src/views/Dashboard.vue)
- 设备管理：[frontend/src/views/Devices.vue](file:///e:/标注项目/trae3/37/frontend/src/views/Devices.vue)
- 振动分析：[frontend/src/views/Analysis.vue](file:///e:/标注项目/trae3/37/frontend/src/views/Analysis.vue)
- 异常告警：[frontend/src/views/Anomalies.vue](file:///e:/标注项目/trae3/37/frontend/src/views/Anomalies.vue)
- 报表中心：[frontend/src/views/Reports.vue](file:///e:/标注项目/trae3/37/frontend/src/views/Reports.vue)

## 技术栈

### 后端
- **框架**: FastAPI 0.104.1
- **数据库**: SQLAlchemy 2.0.23 + SQLite
- **数据处理**: NumPy 1.26.2, Pandas 2.1.3, SciPy 1.11.4
- **报表生成**: openpyxl 3.1.2, xlsxwriter 3.1.9

### 前端
- **框架**: Vue 3.3.8
- **构建工具**: Vite 5.0.4
- **UI组件**: Element Plus 2.4.4
- **图表库**: ECharts 5.4.3
- **状态管理**: Pinia 2.1.7
- **路由**: Vue Router 4.2.5
- **HTTP客户端**: Axios 1.6.2

## 快速开始

### 1. 后端启动

```bash
# 进入后端目录
cd backend

# 创建虚拟环境
python -m venv venv

# 激活虚拟环境
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 启动服务
python main.py
```

后端服务将在 http://localhost:8000 启动
API文档: http://localhost:8000/docs

### 2. 前端启动

```bash
# 进入前端目录
cd frontend

# 安装依赖
npm install

# 启动开发服务
npm run dev
```

前端服务将在 http://localhost:5173 启动

### 3. 初始化数据

1. 启动后端服务后，数据库会自动创建
2. 进入前端设备管理页面，添加测试设备（如：设备编号 PUMP-001）
3. 在数据概览页面点击"生成测试数据"按钮
4. 或调用API生成历史数据：

```bash
curl -X POST "http://localhost:8000/api/data-collection/generate-historical?device_code=PUMP-001&days=7"
```

## 项目目录结构

```
37/
├── backend/
│   ├── app/
│   │   ├── api/              # API路由
│   │   ├── core/             # 核心配置
│   │   ├── models/           # 数据模型
│   │   └── services/         # 业务服务
│   ├── reports/              # 生成的报表文件
│   ├── tests/                # 测试文件
│   ├── main.py               # 应用入口
│   ├── requirements.txt      # 依赖列表
│   └── .env                  # 环境配置
├── frontend/
│   ├── src/
│   │   ├── api/              # API封装
│   │   ├── components/       # 可复用组件
│   │   ├── router/           # 路由配置
│   │   ├── store/            # 状态管理
│   │   ├── styles/           # 全局样式
│   │   ├── views/            # 页面视图
│   │   ├── App.vue           # 根组件
│   │   └── main.js           # 入口文件
│   ├── public/               # 静态资源
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
└── README.md
```

## 核心功能特性

### 数据分析能力
- ✅ 三轴振动数据实时采集与展示
- ✅ 时域波形分析（X/Y/Z轴）
- ✅ FFT频谱分析与谐波检测
- ✅ 20+种统计特征参数计算
- ✅ 多维度异常检测算法

### 可视化展示
- ✅ 折线图/柱状图切换
- ✅ 多轴数据叠加对比
- ✅ 交互式数据缩放
- ✅ 仪表盘式状态卡片
- ✅ 异常告警实时提示

### 报表系统
- ✅ 振动数据报表（含统计摘要）
- ✅ 异常分析报表（含统计汇总）
- ✅ Excel格式导出
- ✅ 报表历史管理

## API端点

| 模块 | 端点 | 方法 | 说明 |
|------|------|------|------|
| 设备 | `/api/devices` | GET | 获取设备列表 |
| 设备 | `/api/devices` | POST | 创建设备 |
| 设备 | `/api/devices/{id}` | PUT | 更新设备 |
| 设备 | `/api/devices/{id}` | DELETE | 删除设备 |
| 振动 | `/api/vibration/data` | GET | 获取振动数据 |
| 振动 | `/api/vibration/data` | POST | 上传振动数据 |
| 振动 | `/api/vibration/analyze` | POST | 执行振动分析 |
| 振动 | `/api/vibration/detect-anomalies` | POST | 异常检测 |
| 异常 | `/api/anomalies` | GET | 获取异常列表 |
| 异常 | `/api/anomalies/stats` | GET | 异常统计 |
| 异常 | `/api/anomalies/{id}/handle` | POST | 处理异常 |
| 报表 | `/api/reports` | GET | 获取报表列表 |
| 报表 | `/api/reports/generate` | POST | 生成报表 |
| 报表 | `/api/reports/download/{id}` | GET | 下载报表 |
| 采集 | `/api/data-collection/generate-historical` | POST | 生成历史数据 |
| 采集 | `/api/data-collection/generate-sample` | POST | 生成样本数据 |

## 数据模型

### 设备表 (devices)
- 设备编号、名称、类型、位置、制造商、型号、状态等

### 振动数据表 (vibration_data)
- 设备编号、时间戳、X/Y/Z轴振动值、温度、转速、采样率

### 分析结果表 (analysis_results)
- 设备编号、时间范围、RMS、峰值、峭度、主频、FFT数据等

### 异常记录表 (anomaly_records)
- 设备编号、时间、异常类型、严重程度、轴向、数值、阈值、描述、状态

### 报表表 (reports)
- 报表名称、类型、设备、时间范围、文件路径、格式、大小

## 扩展建议

1. **真实传感器接入**: 修改 `DataCollector` 类，对接Modbus、OPC UA等工业协议
2. **WebSocket实时推送**: 增加WebSocket支持，实现数据实时推送
3. **机器学习模型**: 集成LSTM、AutoEncoder等深度学习模型进行预测性维护
4. **多租户支持**: 增加用户权限管理和数据隔离
5. **消息队列**: 引入Kafka/RabbitMQ处理高并发数据流
6. **时序数据库**: 替换SQLite为InfluxDB、TDengine等专业时序数据库

## License

MIT License
