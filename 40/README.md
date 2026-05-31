# 微服务集群配置一体化命令行工具

一个功能强大的微服务配置管理命令行工具，支持多文件、跨服务联动的配置管理操作。

## 功能特性

- 📝 **配置解析模块** - 支持 YAML/JSON/Properties 多种格式解析
- ✅ **批量校验模块** - 语法校验、自定义规则校验、批量校验
- 🚀 **远程调用模块** - 对接 Nacos/Apollo 等主流配置中心
- 💾 **本地备份模块** - 全量/增量备份、定时备份、备份恢复
- 🔄 **跨集群迁移模块** - 批量迁移、差异比对、迁移回滚
- 🎯 **命令行驱动** - 直观的子命令系统，支持批量操作上百个微服务

## 项目结构

```
.
├── src/
│   ├── __init__.py          # 版本信息
│   ├── main.py              # 命令行入口
│   ├── parser.py            # 配置解析模块
│   ├── validator.py         # 批量校验模块
│   ├── remote.py            # 远程调用模块
│   ├── backup.py            # 本地备份模块
│   └── migration.py         # 跨集群迁移模块
├── config/
│   ├── .env.example         # 环境变量示例
│   ├── clusters/
│   │   └── clusters.yaml    # 集群配置
│   └── rules/
│       └── validation_rules.json  # 校验规则
├── examples/
│   └── configs/             # 示例配置文件
├── tests/                   # 测试用例
├── requirements.txt         # 依赖列表
└── setup.py                 # 安装配置
```

## 快速开始

### 安装

```bash
# 安装依赖
pip install -r requirements.txt

# 以开发模式安装
pip install -e .
```

### 配置环境

1. 复制环境变量文件：
```bash
cp config/.env.example config/.env
```

2. 编辑集群配置 `config/clusters/clusters.yaml`

### 基本使用

#### 1. 配置校验

```bash
# 校验单个文件
msconfig validate file examples/configs/user-service.yaml

# 校验整个目录
msconfig validate dir examples/configs/

# 指定环境配置校验
msconfig validate file examples/configs/user-service.yaml --profile prod

# 输出JSON格式结果
msconfig validate file examples/configs/user-service.yaml --format json
```

#### 2. 配置中心操作

```bash
# 列出指定集群的所有配置
msconfig config list --cluster dev

# 获取指定配置
msconfig config get user-service --cluster dev --group DEFAULT_GROUP

# 发布配置到配置中心
msconfig config publish user-service config.yaml --cluster dev
```

#### 3. 备份管理

```bash
# 全量备份
msconfig backup full --cluster dev

# 增量备份
msconfig backup incr --cluster dev

# 列出备份历史
msconfig backup list --cluster dev

# 从备份恢复
msconfig backup restore ./backups/dev/full_20240101_120000.zip --cluster dev

# 启动定时备份服务
msconfig backup schedule
```

#### 4. 跨集群迁移

```bash
# 比较两个集群的配置差异
msconfig migrate diff --source dev --target test

# 导出差异报告
msconfig migrate diff --source dev --target test --export diff_report.html --format html

# 执行配置迁移（预览模式）
msconfig migrate run --source dev --target test --dry-run

# 执行配置迁移（带自动回滚）
msconfig migrate run --source dev --target test --with-rollback
```

#### 5. 格式转换

```bash
# YAML转JSON
msconfig convert config.yaml --format json --output config.json

# Properties转YAML
msconfig convert config.properties --format yaml
```

## 校验规则说明

校验规则定义在 `config/rules/validation_rules.json` 中，支持：

- **必填字段校验** - 检查必需的配置字段
- **格式校验** - 服务名、版本号、端口号等格式
- **服务类型规则** - 根据服务类型(web/database/cache/message)校验特定字段
- **环境规则** - 不同环境(dev/test/prod)的特殊校验规则
- **敏感字段检测** - 生产环境检测硬编码的密钥密码

## 集群配置示例

```yaml
clusters:
  dev:
    name: Development Cluster
    config_center:
      url: http://dev-config-center:8848
      type: nacos
      username: ${DEV_CONFIG_USERNAME}
      password: ${DEV_CONFIG_PASSWORD}
    namespace: dev
    backup_path: ./backups/dev

  prod:
    name: Production Cluster
    config_center:
      url: http://prod-config-center:8848
      type: nacos
    namespace: prod
    read_only: true
```

## 运行测试

```bash
# 安装pytest
pip install pytest

# 运行所有测试
pytest tests/ -v

# 运行特定模块测试
pytest tests/test_parser.py -v
```

## 支持的配置中心

- ✅ Nacos (推荐)
- ✅ Apollo
- 🔄 更多配置中心支持可扩展

## 批量操作能力

工具支持批量操作上百个微服务配置：

- **批量校验** - 递归扫描目录，并行校验所有配置文件
- **批量迁移** - 一次性迁移整个命名空间的所有配置
- **批量备份** - 自动备份配置中心所有配置项
- **差异批量比对** - 快速对比两个集群的所有配置差异

## 命令参考

### 全局选项

- `--verbose` - 显示详细日志
- `--config-dir` - 指定配置目录路径
- `--version` - 显示版本信息
- `--help` - 显示帮助信息

### validate 子命令

| 命令 | 说明 |
|------|------|
| `validate file <path>` | 校验单个配置文件 |
| `validate dir <path>` | 批量校验目录下配置文件 |

### config 子命令

| 命令 | 说明 |
|------|------|
| `config list` | 列出配置中心配置 |
| `config get <data_id>` | 获取配置内容 |
| `config publish <data_id> <file>` | 发布配置 |

### backup 子命令

| 命令 | 说明 |
|------|------|
| `backup full` | 执行全量备份 |
| `backup incr` | 执行增量备份 |
| `backup list` | 列出备份历史 |
| `backup restore <path>` | 从备份恢复 |
| `backup schedule` | 启动定时备份服务 |

### migrate 子命令

| 命令 | 说明 |
|------|------|
| `migrate diff` | 比较配置差异 |
| `migrate run` | 执行配置迁移 |

## License

MIT License
