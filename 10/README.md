# Cluster Inspector - 服务器集群巡检自动化命令行工具集

一个基于 Rust 开发的服务器集群巡检自动化命令行工具集，支持 SSH 批量连接多台服务器、采集运行指标、按照自定义规则校验巡检结果、生成格式化巡检报告、配置定时自动巡检。

## 功能特性

- 🔌 **集群连接模块** - 支持 SSH 批量连接，密码/密钥认证，连接池管理
- 📊 **指标采集模块** - CPU、内存、磁盘、进程、系统信息等多维度指标采集
- ✅ **规则校验模块** - 自定义巡检规则，支持多种条件表达式语法
- 📄 **结果输出模块** - 支持 JSON、YAML、CSV、HTML 多种格式报告输出
- ⏰ **定时调度模块** - 基于 Cron 表达式的定时巡检任务管理
- 🎯 **多命令架构** - 子命令组合，各模块独立可复用

## 项目结构

```
src/
├── main.rs                 # 主入口文件
├── cli/
│   └── mod.rs              # CLI 子命令解析模块
├── config/
│   └── mod.rs              # 配置模块（服务器、规则配置）
├── cluster/
│   ├── mod.rs              # 集群连接管理
│   └── ssh.rs              # SSH 会话实现
├── collector/
│   ├── mod.rs              # 指标采集器
│   └── metrics.rs          # 指标数据结构
├── rules/
│   ├── mod.rs              # 巡检规则模块
│   └── validator.rs        # 规则校验引擎
├── output/
│   ├── mod.rs              # 报告输出模块
│   └── report.rs           # 报告生成器
└── scheduler/
    ├── mod.rs              # 任务调度器
    └── task.rs             # 定时任务数据结构
```

## 快速开始

### 编译

```bash
cargo build --release
```

### 配置

1. 复制并修改服务器配置：

```bash
cp config/config.yaml.example config/config.yaml
```

2. 复制并修改巡检规则：

```bash
cp config/rules.yaml.example config/rules.yaml
```

## 使用指南

### 1. 测试服务器连接

```bash
# 测试所有服务器连接
cluster-inspector connect --config config/config.yaml

# 测试指定服务器连接
cluster-inspector connect --config config/config.yaml --host web-server-01
```

### 2. 采集服务器指标

```bash
# 采集所有服务器全部指标
cluster-inspector collect --config config/config.yaml

# 采集指定服务器的 CPU 和磁盘指标
cluster-inspector collect --config config/config.yaml --host web-server-01 --metric-type cpu,disk

# 指标类型可选值: cpu, memory, disk, process, system, all
```

### 3. 执行完整巡检

```bash
cluster-inspector inspect \
  --config config/config.yaml \
  --rules config/rules.yaml \
  --output reports \
  --format html
```

输出格式可选: `json`, `yaml`, `csv`, `html`

### 4. 校验巡检规则

```bash
cluster-inspector validate --rules config/rules.yaml
```

### 5. 生成巡检报告

```bash
cluster-inspector report \
  --input reports/inspection_report_xxx.json \
  --output reports \
  --format html
```

### 6. 定时任务管理

```bash
# 添加定时任务 - 每小时执行一次巡检
cluster-inspector schedule add \
  --name "hourly-inspection" \
  --cron "0 * * * *" \
  --config config/config.yaml \
  --rules config/rules.yaml \
  --output reports \
  --format html

# 列出所有定时任务
cluster-inspector schedule list

# 移除定时任务
cluster-inspector schedule remove --id <task-id>

# 启动调度器
cluster-inspector schedule start

# 停止调度器
cluster-inspector schedule stop
```

## Cron 表达式格式

```
*    *    *    *    *
┬    ┬    ┬    ┬    ┬
│    │    │    │    │
│    │    │    │    └─ 星期 (0-7, 0 或 7 为周日)
│    │    │    └────── 月份 (1-12)
│    │    └─────────── 日期 (1-31)
│    └──────────────── 小时 (0-23)
└───────────────────── 分钟 (0-59)
```

示例：
- `0 * * * *` - 每小时整点执行
- `0 0 * * *` - 每天凌晨执行
- `*/30 * * * *` - 每 30 分钟执行
- `0 9-18 * * 1-5` - 工作日 9:00-18:00 每小时执行

## 规则条件表达式

支持以下条件语法：

### 比较运算符

| 运算符 | 说明 | 示例 |
|--------|------|------|
| `>` | 大于 | `cpu.usage > 80` |
| `<` | 小于 | `memory.available < 1024` |
| `>=` | 大于等于 | `disk./.usage >= 85` |
| `<=` | 小于等于 | `process.count <= 500` |
| `==` | 等于 | `system.tcp_conn == 0` |
| `!=` | 不等于 | `cpu.idle != 0` |

### 范围判断

```
cpu.usage between 10 and 60
```

## 指标类型

| 指标路径 | 说明 | 单位 |
|----------|------|------|
| `cpu.usage` | CPU 总使用率 | % |
| `cpu.user` | CPU 用户态使用率 | % |
| `cpu.system` | CPU 系统态使用率 | % |
| `cpu.iowait` | CPU IO 等待 | % |
| `cpu.idle` | CPU 空闲率 | % |
| `cpu.load1` | 1 分钟平均负载 | - |
| `cpu.load5` | 5 分钟平均负载 | - |
| `cpu.load15` | 15 分钟平均负载 | - |
| `cpu.cores` | CPU 核心数 | 个 |
| `memory.usage` | 内存使用率 | % |
| `memory.total` | 总内存 | MB |
| `memory.used` | 已用内存 | MB |
| `memory.available` | 可用内存 | MB |
| `memory.swap_usage` | Swap 使用率 | % |
| `disk.<mount>.usage` | 指定挂载点使用率 | % |
| `disk.<mount>.total` | 指定挂载点总容量 | GB |
| `disk.<mount>.used` | 指定挂载点已用容量 | GB |
| `disk.<mount>.available` | 指定挂载点可用容量 | GB |
| `disk.max_usage` | 所有磁盘最高使用率 | % |
| `process.count` | 进程总数 | 个 |
| `process.high_cpu` | 单个进程最高 CPU 使用率 | % |
| `process.high_mem` | 单个进程最高内存使用率 | % |
| `system.tcp_conn` | TCP 连接数 | 个 |
| `system.open_files` | 打开文件数 | 个 |
| `system.uptime` | 系统运行时间 | 秒 |

## 配置文件格式

### 服务器配置 (config.yaml)

```yaml
global:
  timeout: 30          # SSH 超时时间（秒）
  retries: 2           # 重试次数
  parallel: 5          # 并行连接数

servers:
  - name: server-01
    host: 192.168.1.10
    port: 22
    username: admin
    auth_type: password
    password: "password"
    tags: ["web", "prod"]
```

支持两种认证方式：
- 密码认证：`auth_type: password`
- 密钥认证：`auth_type: key` + `key_path` + `passphrase`

### 巡检规则配置 (rules.yaml)

```yaml
rules:
  - id: RULE_001
    name: CPU 使用率过高
    description: "CPU 使用率超过 80%"
    metric_type: cpu.usage
    condition: "cpu.usage > 80"
    severity: warning  # critical, warning, info
    enabled: true
```

## 依赖

- Rust 1.70+
- OpenSSL (SSH 连接依赖)

## License

MIT
