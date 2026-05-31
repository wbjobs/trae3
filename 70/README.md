# 多子模块命令行工具 - ConfigTool

一个功能强大的配置管理与运维自动化命令行工具，包含指令解析、配置比对、批量回滚、远程调用四大核心模块，并对接配置中心与版本数据库。

## 项目结构

```
configtool/
├── __init__.py
├── __main__.py              # 主入口
├── cli/                     # 指令解析模块
│   ├── __init__.py
│   ├── parser.py            # CLI框架
│   └── commands/            # 子命令
│       ├── __init__.py
│       ├── diff.py          # 配置比对命令
│       ├── rollback.py      # 批量回滚命令
│       ├── remote.py        # 远程调用命令
│       ├── config.py        # 配置中心命令
│       └── version.py       # 版本数据库命令
├── config_diff/             # 配置比对模块
│   ├── __init__.py
│   ├── models.py            # 数据模型
│   └── comparator.py        # 比对核心逻辑
├── rollback/                # 批量回滚模块
│   ├── __init__.py
│   ├── models.py            # 数据模型
│   └── manager.py           # 回滚管理器
├── remote/                  # 远程调用模块
│   ├── __init__.py
│   ├── client.py            # HTTP客户端
│   └── batch.py             # 批量调用器
├── config_center/           # 配置中心对接
│   ├── __init__.py
│   ├── base.py              # 抽象基类
│   ├── apollo.py            # Apollo客户端
│   ├── nacos.py             # Nacos客户端
│   └── factory.py           # 工厂方法
├── version_db/              # 版本数据库对接
│   ├── __init__.py
│   ├── models.py            # ORM模型
│   └── db.py                # 数据库操作
└── utils/                   # 工具类
    ├── __init__.py
    ├── logger.py            # 日志工具
    ├── exceptions.py        # 异常定义
    └── helpers.py           # 辅助函数
```

## 功能特性

### 1. 指令解析模块
- 基于 Click 框架的多级子命令系统
- 支持环境变量配置文件加载
- 支持详细日志模式
- 统一的异常处理

### 2. 配置比对模块
- 支持本地文件比对（YAML/JSON/Properties）
- 支持跨环境配置中心配置比对
- 支持当前配置与历史版本比对
- 多种输出格式（文本/JSON/表格）
- 可忽略指定配置项

### 3. 批量回滚模块
- 支持5种回滚类型：
  - `config_version` - 回滚到历史版本
  - `config_center` - 跨环境同步配置
  - `remote_service` - 调用远程服务回滚接口
  - `database` - 数据库备份恢复
  - `file` - 文件备份恢复
- 支持串行/并行执行
- 支持 Dry Run 模式
- 自动重试机制
- 详细的执行步骤记录

### 4. 远程调用模块
- 支持 GET/POST/PUT/DELETE/PATCH 请求
- 自动重试与超时处理
- 支持批量并行调用
- 支持服务发现
- 统一的响应封装

### 5. 配置中心对接
- 支持 Apollo 配置中心
- 支持 Nacos 配置中心
- 统一的操作接口
- 多环境支持

### 6. 版本数据库对接
- MySQL 版本数据库
- 配置版本全量存储
- 变更明细记录
- 回滚操作记录
- 版本差异比较

## 安装

```bash
# 安装依赖
pip install -r requirements.txt

# 或者以开发模式安装
pip install -e .
```

## 配置

复制 `.env.example` 为 `.env` 并根据实际情况修改：

```bash
cp .env.example .env
```

主要配置项：

| 配置项 | 说明 |
|--------|------|
| APOLLO_SERVER_URL | Apollo 服务地址 |
| APOLLO_APP_ID | Apollo 应用ID |
| NACOS_SERVER_URL | Nacos 服务地址 |
| DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME | 数据库连接信息 |
| REMOTE_TIMEOUT / REMOTE_RETRY_COUNT | 远程调用配置 |

## 初始化数据库

执行 `sql/init.sql` 创建数据库和表结构：

```bash
mysql -u root -p < sql/init.sql
```

## 使用说明

### 查看帮助

```bash
configtool --help
# 或
python -m configtool --help
```

### 1. 配置比对命令 (diff)

```bash
# 比对两个本地文件
configtool diff files config1.yaml config2.yaml
configtool diff files config1.yaml config2.yaml --format table --output diff.txt

# 比对两个环境的配置中心配置
configtool diff configs dev prod --namespace application --center-type apollo

# 比对当前配置与历史版本
configtool diff version --app-id my-app --version 5 --current-file current.yaml
```

### 2. 批量回滚命令 (rollback)

```bash
# 回滚配置到指定历史版本
configtool rollback version --app-id my-app --target-version 5 --operator admin

# 从源环境同步配置到目标环境
configtool rollback sync --source-env prod --target-env staging --namespace application

# 批量执行回滚任务
configtool rollback batch examples/rollback_tasks.yaml --parallel --max-workers 5

# 调用远程服务回滚接口
configtool rollback remote --service-url http://service.example.com --target-version v1.2.3

# Dry Run 模式（不实际执行）
configtool rollback version --app-id my-app --target-version 5 --dry-run
```

### 3. 远程调用命令 (remote)

```bash
# 发送 GET 请求
configtool remote get http://api.example.com/users --param page 1 --param size 10

# 发送 POST 请求
configtool remote post http://api.example.com/users --data '{"name":"test"}'

# 从文件读取请求体
configtool remote post http://api.example.com/config --data-file config.json

# 批量远程调用
configtool remote batch examples/batch_requests.yaml --max-workers 10 --format table
```

### 4. 配置中心命令 (config)

```bash
# 获取配置
configtool config get --namespace application --format yaml --output config.yaml

# 设置配置项
configtool config set --key server.port --value 9090 --comment "修改端口"

# 发布配置
configtool config publish --namespace application --file config.yaml --comment "批量更新"

# 列出命名空间
configtool config list --center-type nacos --env prod

# 查看发布历史
configtool config history --namespace application --page 1 --page-size 10

# 同步配置到其他环境
configtool config sync --source-env prod --target-env staging --target-env test
```

### 5. 版本数据库命令 (version)

```bash
# 保存配置版本
configtool version save --app-id my-app --file config.yaml --operator admin --change-type update

# 获取配置版本
configtool version get --app-id my-app --version 5 --output config_v5.yaml

# 列出配置版本
configtool version list --app-id my-app --page 1 --page-size 20

# 比较两个版本的差异
configtool version diff --app-id my-app --from-version 3 --to-version 5 --format table

# 查看配置变更日志
configtool version changelog --app-id my-app --version 5

# 查看回滚记录
configtool version rollbacks --app-id my-app

# 检查数据库连接
configtool version check
```

## 作为库使用

除了命令行工具，也可以作为 Python 库使用：

```python
from configtool.config_diff import ConfigComparator
from configtool.rollback import RollbackManager, RollbackType
from configtool.remote import RemoteClient
from configtool.config_center import get_config_center
from configtool.version_db import VersionDB

# 配置比对
comparator = ConfigComparator()
result = comparator.compare_files("config1.yaml", "config2.yaml")
print(comparator.format_result(result))

# 远程调用
with RemoteClient(base_url="http://api.example.com") as client:
    response = client.get("/users", params={"page": 1})
    print(response.data)

# 配置中心
center = get_config_center("apollo", env="prod")
config = center.get_all_configs("application")

# 版本数据库
with VersionDB() as db:
    version = db.save_config_version(
        app_id="my-app",
        namespace="application",
        config_data=config,
        operator="admin",
    )
    print(f"保存版本: {version}")
```

## 批量回滚任务文件格式

```yaml
tasks:
  - type: config_version
    target: my-app
    target_version: "5"
    parameters:
      app_id: my-app
      namespace: application
      config_center: apollo
      operator: admin
    description: 回滚应用配置到版本5

  - type: remote_service
    target: http://service-a.example.com
    target_version: "v1.2.3"
    parameters:
      service_url: http://service-a.example.com
      endpoint: /api/admin/rollback
      timeout: 60
    description: 回滚服务A到指定版本
```

## 批量远程调用请求文件格式

```yaml
requests:
  - url: /api/health
    method: GET
    context:
      service: service-a

  - url: /api/config/reload
    method: POST
    data:
      mode: soft
```

## 开发

```bash
# 安装开发依赖
pip install -e .[dev]

# 运行帮助验证
python -m configtool --help
```

## 日志

日志默认输出到控制台和 `configtool.log` 文件，采用轮转机制（单文件10MB，保留5个备份）。

使用 `-v` 或 `--verbose` 参数启用 DEBUG 级别日志。

## 退出码

| 退出码 | 说明 |
|--------|------|
| 0 | 成功 |
| 1 | 执行失败 |
| 130 | 用户中断 (Ctrl+C) |

## License

MIT
