# 边缘网关集群状态巡检工具

Go 语言开发的边缘网关集群状态巡检命令行工具集，支持批量远程连接边缘网关、采集运行指标、按规则校验异常、生成结构化巡检报告、配置定时自动巡检。

## 功能特性

- **SSH 集群连接模块**: 支持密码认证、密钥认证、SSH Agent，批量连接管理
- **网关指标采集模块**: 系统、网络、进程、磁盘、服务等多维度指标采集
- **巡检规则校验模块**: 内置 8 条默认规则，支持自定义规则扩展
- **报告生成模块**: 支持 Console、JSON、HTML、Markdown 四种输出格式
- **定时任务调度模块**: 基于 Cron 表达式的定时巡检任务
- **多子命令架构**: 清晰的命令行交互体验

## 项目结构

```
edge-gateway-inspector/
├── cmd/
│   └── inspector/
│       └── main.go           # 主程序入口
├── pkg/
│   ├── ssh/
│   │   └── ssh.go            # SSH 集群连接模块
│   ├── metrics/
│   │   └── metrics.go        # 网关指标采集模块
│   ├── rules/
│   │   └── rules.go          # 巡检规则校验模块
│   ├── report/
│   │   └── report.go         # 报告生成模块
│   ├── scheduler/
│   │   └── scheduler.go      # 定时任务调度模块
│   └── config/
│       └── config.go         # 配置文件处理模块
├── config.yaml               # 配置文件
├── go.mod
└── README.md
```

## 安装

```bash
# 克隆项目
git clone <repository-url>
cd edge-gateway-inspector

# 下载依赖
go mod download

# 编译
go build -o inspector ./cmd/inspector
```

## 快速开始

### 1. 生成配置文件

```bash
./inspector config init
```

### 2. 编辑配置文件

编辑 `config.yaml`，填入网关连接信息：

```yaml
gateways:
  - name: gateway-01
    host: 192.168.1.100
    port: 22
    username: root
    password: ""
    privatekey: ~/.ssh/id_rsa
    timeout: 10
    enabled: true
```

### 3. 测试网关连接

```bash
# 测试所有网关
./inspector test

# 测试指定网关
./inspector test gateway-01
```

### 4. 执行巡检

```bash
# 使用默认配置执行巡检
./inspector inspect

# 指定报告格式和输出目录
./inspector inspect -f html,json,markdown -o ./reports

# 多种格式输出
./inspector inspect -f console -f html
```

### 5. 查看已配置的网关

```bash
./inspector list
```

### 6. 配置管理

```bash
# 查看当前配置
./inspector config show

# 验证配置文件
./inspector config validate
```

### 7. 定时巡检

```bash
# 启动定时巡检（使用配置文件中的 cron 表达式）
./inspector schedule start

# 指定 cron 表达式启动
./inspector schedule start --cron "0 */6 * * *"

# 查看定时任务配置
./inspector schedule list
```

## 子命令说明

| 命令 | 说明 |
|------|------|
| `inspect` | 执行一次巡检任务 |
| `schedule start` | 启动定时巡检任务 |
| `schedule list` | 查看定时任务配置 |
| `config init` | 生成示例配置文件 |
| `config show` | 显示当前配置 |
| `config validate` | 验证配置文件 |
| `list` | 列出已配置的网关 |
| `test [gateway-name]` | 测试网关连接 |

## 巡检规则

内置 8 条巡检规则：

| 规则ID | 名称 | 说明 | 阈值 |
|--------|------|------|------|
| cpu_usage_high | CPU使用率检查 | 检查CPU使用率是否过高 | > 80% |
| memory_usage_high | 内存使用率检查 | 检查内存使用率是否过高 | > 85% |
| disk_usage_high | 磁盘使用率检查 | 检查磁盘使用率是否过高 | > 90% |
| load_average_high | 负载均衡检查 | 检查系统负载是否过高 | > 1.5 * CPU核数 |
| swap_usage_high | Swap使用检查 | 检查Swap分区使用率是否过高 | > 50% |
| zombie_processes | 僵尸进程检查 | 检查是否存在僵尸进程 | > 5个 |
| service_status | 服务状态检查 | 检查关键服务是否运行 | 全部运行 |
| network_connections | 网络连接检查 | 检查网络连接数是否异常 | > 1000个 |

## 报告格式

### Console (控制台)
- 彩色输出表格
- 详细检查结果
- 系统摘要信息

### JSON
- 结构化数据
- 便于程序解析
- 完整指标数据

### HTML
- 美观的网页报告
- 响应式设计
- 图表展示

### Markdown
- 纯文本格式
- 便于文档管理
- 支持版本控制

## 配置说明

### 网关配置

| 字段 | 类型 | 说明 |
|------|------|------|
| name | string | 网关名称（唯一标识） |
| host | string | 主机地址 |
| port | int | SSH端口 |
| username | string | 用户名 |
| password | string | 密码（可选） |
| privatekey | string | 私钥文件路径（可选） |
| timeout | int | 连接超时（秒） |
| enabled | bool | 是否启用 |

### 调度器配置

| 字段 | 类型 | 说明 |
|------|------|------|
| enabled | bool | 是否启用 |
| cronexpr | string | Cron表达式 |

### 报告配置

| 字段 | 类型 | 说明 |
|------|------|------|
| outputdir | string | 报告输出目录 |
| formats | []string | 输出格式列表 |

## Cron 表达式

标准的 5 位 Cron 表达式：

```
* * * * *
│ │ │ │ │
│ │ │ │ └── 星期 (0-6)
│ │ │ └──── 月份 (1-12)
│ │ └────── 日期 (1-31)
│ └──────── 小时 (0-23)
└────────── 分钟 (0-59)
```

常用示例：
- `0 0 * * *` - 每天凌晨执行
- `0 */6 * * *` - 每6小时执行
- `0 9 * * 1-5` - 工作日早上9点执行
- `0 0 1 * *` - 每月1号凌晨执行

## 依赖库

- [cobra](https://github.com/spf13/cobra) - 命令行框架
- [viper](https://github.com/spf13/viper) - 配置管理
- [crypto/ssh](https://golang.org/x/crypto/ssh) - SSH 客户端
- [cron](https://github.com/robfig/cron) - 定时任务
- [go-pretty](https://github.com/jedib0t/go-pretty) - 表格渲染

## License

MIT
