# 工业设备运维时序数据分析平台

Industrial IoT Time Series Analytics Platform

基于 **ECharts + Python Flask + InfluxDB** 技术栈构建的工业设备运维时序数据分析平台。

## 功能特性

### 1. 前端可视化图表模块
- **实时折线图**: 使用 ECharts 展示设备运行指标趋势
- **热力图分析**: 多设备多维度数据可视化
- **仪表盘**: 设备运行状态概览
- **饼图/柱状图**: 设备状态、分组统计

### 2. 后端数据查询模块
- InfluxDB 时序数据库集成
- 多维度数据筛选（时间、设备、指标）
- 数据降采样优化大数据量加载
- 实时数据查询接口

### 3. 数据清洗转换模块
- 异常值检测（IQR、Z-score 方法）
- 缺失值处理（插值、填充、删除）
- 数据重采样和平滑处理
- 数据质量报告生成

### 4. 报表生成模块
- PDF 格式运维报表自动生成
- Excel 格式数据导出
- 设备单报表和分组汇总报表
- 智能运维建议生成

### 5. 设备分组管理模块
- 设备 CRUD 管理
- 设备分组管理
- 分组统计分析
- 设备状态监控

## 项目结构

```
工业设备运维时序数据分析平台/
├── backend/                          # 后端 Flask 应用
│   ├── app.py                        # Flask 主应用入口
│   ├── config.py                     # 配置文件
│   ├── requirements.txt              # Python 依赖
│   ├── .env.example                  # 环境变量示例
│   ├── influxdb_client.py            # InfluxDB 客户端封装
│   ├── api/
│   │   └── routes.py                 # API 路由定义
│   ├── modules/
│   │   ├── data_query.py             # 数据查询模块
│   │   ├── data_cleaning.py          # 数据清洗模块
│   │   ├── device_management.py      # 设备管理模块
│   │   └── report_generator.py       # 报表生成模块
│   └── data/                         # 本地数据存储
│
├── frontend/                         # 前端页面
│   ├── index.html                    # 首页 / 数据看板
│   ├── css/
│   │   └── style.css                 # 全局样式
│   ├── js/
│   │   ├── api.js                    # API 调用封装
│   │   ├── charts.js                 # ECharts 图表管理
│   │   ├── app.js                    # 首页逻辑
│   │   ├── devices.js                # 设备管理页逻辑
│   │   ├── groups.js                 # 分组管理页逻辑
│   │   ├── heatmap.js                # 热力图页逻辑
│   │   └── reports.js                # 报表中心逻辑
│   └── pages/
│       ├── devices.html              # 设备管理页
│       ├── groups.html               # 分组管理页
│       ├── heatmap.html              # 热力图分析页
│       └── reports.html              # 报表中心页
│
├── reports/                          # 生成的报表目录
├── exports/                          # 数据导出目录
└── README.md                         # 项目文档
```

## 快速开始

### 环境要求

- Python 3.8+
- InfluxDB 2.0+ （可选，内置模拟数据支持）
- 现代浏览器（Chrome、Firefox、Edge）

### 安装步骤

1. **进入后端目录并安装依赖**

```bash
cd backend
pip install -r requirements.txt
```

2. **配置环境变量（可选）**

复制 `.env.example` 为 `.env` 并修改配置：

```bash
cp .env.example .env
```

3. **启动 Flask 应用**

```bash
python app.py
```

4. **访问平台**

打开浏览器访问：http://localhost:5000

## API 接口说明

### 设备管理接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/devices` | 获取设备列表 |
| GET | `/api/devices/{id}` | 获取设备详情 |
| POST | `/api/devices` | 添加设备 |
| PUT | `/api/devices/{id}` | 更新设备 |
| DELETE | `/api/devices/{id}` | 删除设备 |

### 分组管理接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/groups` | 获取分组列表 |
| GET | `/api/groups/{id}` | 获取分组详情 |
| POST | `/api/groups` | 添加分组 |
| PUT | `/api/groups/{id}` | 更新分组 |
| DELETE | `/api/groups/{id}` | 删除分组 |

### 数据查询接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/data/timeseries/device/{id}` | 获取设备时序数据 |
| GET | `/api/data/timeseries/group/{id}` | 获取分组时序数据 |
| POST | `/api/data/heatmap` | 获取热力图数据 |
| GET | `/api/data/statistics/device/{id}` | 获取设备统计数据 |

### 报表接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/reports/generate/device/{id}` | 生成设备报表 |
| POST | `/api/reports/generate/group/{id}` | 生成分组报表 |
| GET | `/api/reports` | 获取报表列表 |
| GET | `/api/reports/download/{filename}` | 下载报表 |

## 技术栈

### 后端
- **Flask**: Web 框架
- **InfluxDB**: 时序数据库
- **Pandas**: 数据处理
- **ReportLab**: PDF 报表生成
- **OpenPyXL**: Excel 报表生成
- **Flask-CORS**: 跨域支持

### 前端
- **ECharts**: 数据可视化图表库
- **原生 JavaScript**: 无框架依赖
- **响应式设计**: 适配多种屏幕

## 数据指标说明

平台支持以下工业设备常见指标：

| 指标 | 说明 | 单位 | 正常范围 |
|------|------|------|----------|
| temperature | 温度 | °C | 20-80 |
| vibration | 振动 | mm/s | 0-30 |
| current | 电流 | A | 5-50 |
| rpm | 转速 | RPM | 1000-2000 |
| pressure | 压力 | MPa | 0-10 |
| flow_rate | 流量 | L/min | 50-200 |
| power | 功率 | kW | 10-100 |

## 配置说明

### InfluxDB 配置（可选）

如需连接真实 InfluxDB 数据库，请在 `.env` 中配置：

```env
INFLUXDB_URL=http://localhost:8086
INFLUXDB_TOKEN=your-token-here
INFLUXDB_ORG=industrial-iot
INFLUXDB_BUCKET=device_metrics
```

### 模拟数据模式

默认使用模拟数据模式，无需 InfluxDB 即可体验全部功能。模拟数据接口：

- `/api/simulate/device/{id}` - 模拟设备时序数据
- `/api/simulate/statistics/{id}` - 模拟设备统计数据
- `/api/simulate/heatmap` - 模拟热力图数据

## 特性详解

### 大数据量优化

1. **数据降采样**: 自动对超过 1000 点的数据进行降采样
2. **时间聚合**: InfluxDB 侧按时间窗口聚合数据
3. **渐进式加载**: 支持按时间范围分段查询

### 数据清洗能力

1. **异常值检测**: IQR 四分位距法、Z-score 标准化法
2. **缺失值处理**: 线性插值、前后填充、均值/中位数填充
3. **数据平滑**: 移动平均、指数加权移动平均
4. **数据验证**: 时间戳完整性、重复值检测

### 报表模板

报表包含以下内容：
- 设备运行统计概览（最小值、最大值、平均值、标准差）
- 智能运维建议（基于阈值判断）
- 设备状态分布
- 历史数据图表（可选）

## 开发说明

### 添加新指标

1. 后端：在 `data_query.py` 中添加指标处理逻辑
2. 前端：在页面筛选器中添加新指标选项
3. 更新指标单位和正常范围配置

### 扩展报表功能

1. 在 `report_generator.py` 中添加新的报表生成方法
2. 在前端报表页面添加对应的生成选项

## 注意事项

1. **生产部署**: 建议使用 Gunicorn + Nginx 部署 Flask 应用
2. **数据安全**: 生产环境请修改默认的 SECRET_KEY
3. **性能优化**: 对于超大数据量，建议启用 InfluxDB 连续查询（CQ）预聚合
4. **备份策略**: 定期备份 InfluxDB 数据和报表文件

## 许可证

MIT License
