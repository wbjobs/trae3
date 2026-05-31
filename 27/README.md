# 供水管网压力流量数据分析可视化平台

基于 ECharts + Django + InfluxDB 技术栈构建的供水管网压力流量数据分析可视化平台。

## 功能模块

### 1. 前端图表展示模块
- **仪表盘**: 实时压力/流量趋势、设备分布图、分区对比
- **分区监控**: 分区详情、24小时分布曲线
- **趋势分析**: 多分区对比、统计分布分析
- **故障预警**: 故障检测、故障列表、故障统计
- **数据质量**: 数据质量评分、异常数据分布
- **运维报表**: 自动生成Excel报表、报表下载

### 2. 后端数据查询模块
- RESTful API 接口
- InfluxDB 时序数据查询
- 实时数据获取
- 历史数据聚合查询

### 3. 管网数据清洗模块
- 异常值检测（超范围、IQR异常）
- 突变点检测
- 缺失值识别
- 数据质量评分

### 4. 分区统计模块
- 分区概览统计
- 24小时规律分析
- 多分区对比
- 达标率计算

### 5. 故障预警模块
- 压力异常检测
- 流量异常检测
- 故障记录管理
- 故障统计分析
- Excel运维报表自动生成

## 项目结构

```
.
├── backend/                          # Django后端
│   ├── manage.py                     # Django管理脚本
│   ├── water_pipeline/               # 项目配置
│   │   ├── settings.py               # 配置文件
│   │   ├── urls.py                   # 路由配置
│   │   └── wsgi.py                   # WSGI配置
│   ├── api/                          # API模块
│   │   ├── models.py                 # 数据模型
│   │   ├── views.py                  # API视图
│   │   ├── serializers.py            # 序列化器
│   │   ├── urls.py                   # API路由
│   │   └── influxdb_client.py        # InfluxDB客户端
│   ├── data_cleaning/                # 数据清洗模块
│   │   └── services.py               # 数据清洗服务
│   ├── zone_statistics/              # 分区统计模块
│   │   └── services.py               # 统计服务
│   ├── fault_warning/                # 故障预警模块
│   │   ├── services.py               # 故障检测服务
│   │   └── report_generator.py       # 报表生成器
│   ├── templates/                    # HTML模板
│   │   └── index.html                # 前端主页
│   └── static/                       # 静态资源
│       ├── css/
│       │   └── style.css             # 样式文件
│       └── js/
│           ├── api.js                # API封装
│           ├── charts.js             # ECharts图表管理
│           └── app.js                # 主应用逻辑
└── requirements.txt                  # Python依赖
```

## 快速开始

### 1. 安装依赖

```bash
cd backend
pip install -r ../requirements.txt
```

### 2. 配置 InfluxDB (可选)

在 `water_pipeline/settings.py` 中配置 InfluxDB 连接：

```python
INFLUXDB = {
    'URL': 'http://localhost:8086',
    'TOKEN': 'your-token-here',
    'ORG': 'water_company',
    'BUCKET': 'pipeline_data',
    'TIMEOUT': 30000,
}
```

**注意**: 如果没有 InfluxDB，系统会自动使用模拟数据。

### 3. 数据库迁移

```bash
python manage.py makemigrations
python manage.py migrate
```

### 4. 初始化测试数据

```bash
python init_data.py
```

### 5. 启动服务

```bash
python manage.py runserver 0.0.0.0:8000
```

访问 http://localhost:8000 即可查看平台。

## API 接口

### 数据查询
- `GET /api/data/pressure/` - 获取压力数据
- `GET /api/data/flow/` - 获取流量数据
- `GET /api/data/realtime/` - 获取实时数据

### 分区管理
- `GET /api/zones/list/` - 获取分区列表
- `GET /api/zone/overview/` - 分区概览
- `GET /api/zone/statistics/` - 分区统计
- `GET /api/zone/comparison/` - 分区对比

### 故障管理
- `GET /api/fault/list/` - 故障列表
- `GET /api/fault/statistics/` - 故障统计
- `POST /api/fault/check/` - 检测故障
- `POST /api/fault/{id}/resolve/` - 标记故障已解决

### 数据质量
- `GET /api/data/quality/` - 数据质量报告
- `POST /api/data/clean/` - 执行数据清洗

### 报表管理
- `POST /api/report/generate/` - 生成报表
- `GET /api/report/{id}/download/` - 下载报表

## 技术栈

- **前端**: ECharts 5.4, HTML5, CSS3, JavaScript
- **后端**: Django 4.2, Django REST Framework
- **数据库**: SQLite (关系型), InfluxDB (时序)
- **数据处理**: Pandas, NumPy
- **报表生成**: OpenPyXL

## 主要特性

1. **大数据量支持**: 支持百万级时序数据的快速查询和渲染
2. **实时更新**: 数据实时刷新，支持动态图表
3. **多维度分析**: 时间维度、空间维度、指标维度的多维分析
4. **智能预警**: 基于阈值和趋势的故障自动检测
5. **数据治理**: 完整的数据质量评估和清洗流程
6. **可视化报表**: 一键生成Excel运维报表

## 数据格式说明

### 压力数据
```json
{
  "time": "2024-01-01T12:00:00",
  "device_id": "P001",
  "zone": "东城区",
  "pressure": 0.35,
  "is_fault": 0
}
```

### 流量数据
```json
{
  "time": "2024-01-01T12:00:00",
  "device_id": "P001",
  "zone": "东城区",
  "flow": 85.5,
  "is_fault": 0
}
```

## 部署建议

1. **生产环境**: 使用 Gunicorn + Nginx 部署
2. **时序数据库**: 部署 InfluxDB 集群存储时序数据
3. **缓存**: 使用 Redis 缓存热点数据
4. **异步任务**: 使用 Celery 处理数据清洗和报表生成

## License

MIT License
