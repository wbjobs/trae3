# MsgCLI - 多子模块命令行工具

多子模块命令行工具，包含指令解析、主题巡检、消息重放、远程调用模块，对接消息集群与配置数据库。

## 功能特性

- **指令解析**: 词法分析和语法解析，支持复杂命令行
- **主题巡检**: Kafka 主题健康检查和配置同步验证
- **消息重放**: 从 Kafka/文件/Redis 收集和重放消息
- **远程调用**: JSON-RPC 和 HTTP 客户端，支持服务发现
- **消息集群**: Kafka 和 Redis 客户端封装
- **配置数据库**: MySQL 配置数据库对接

## 安装

```bash
pip install -e .
```

或

```bash
pip install -r requirements.txt
```

## 环境变量配置

```bash
# 数据库配置
export DB_HOST=localhost
export DB_PORT=3306
export DB_USER=root
export DB_PASSWORD=password
export DB_NAME=config_db

# Kafka 配置
export KAFKA_SERVERS=localhost:9092
export KAFKA_GROUP_ID=msgcli-group

# Redis 配置
export REDIS_HOST=localhost
export REDIS_PORT=6379
export REDIS_PASSWORD=

# RPC 配置
export RPC_ENDPOINT=http://localhost:8080
export RPC_API_KEY=your_api_key
```

## 使用示例

### 1. 指令解析

```bash
# 词法分析
msgcli parse lex "inspect all --format json -o report.json"

# 语法解析
msgcli parse parse "replay kafka source_topic target_topic -n 1000 -s 2.0"
```

### 2. 主题巡检

```bash
# 巡检所有主题
msgcli inspect all

# 输出 JSON 格式
msgcli inspect all --format json --output report.json

# 巡检指定主题
msgcli inspect topic my_topic

# 跳过配置同步检查
msgcli inspect all --no-config-sync
```

### 3. 消息重放

```bash
# 从一个主题重放到另一个主题
msgcli replay kafka source_topic target_topic -n 1000

# 2倍速重放
msgcli replay kafka source_topic target_topic -s 2.0

# 试运行模式（不实际发送）
msgcli replay kafka source_topic target_topic --dry-run

# 从文件重放
msgcli replay file messages.json target_topic

# 收集消息到文件
msgcli replay collect my_topic -o messages.json -n 500
```

### 4. 远程调用

```bash
# RPC 方法调用
msgcli rpc call kafka.list_topics

# 带参数的 RPC 调用
msgcli rpc call kafka.send -p '{"topic": "test", "message": {"key": "value"}}'

# HTTP GET
msgcli rpc get /health

# HTTP POST
msgcli rpc post /api/data -d '{"name": "test"}'

# 健康检查
msgcli rpc health
```

### 5. Kafka 管理

```bash
# 列出主题
msgcli kafka topics

# 创建主题
msgcli kafka create-topic my_topic -p 3 -r 1

# 删除主题
msgcli kafka delete-topic my_topic

# 发送消息
msgcli kafka send my_topic '{"key": "value", "data": "test"}'

# 消费消息
msgcli kafka consume my_topic -n 10

# 列出消费者组
msgcli kafka groups
```

### 6. 配置数据库

```bash
# 列出配置的主题
msgcli configdb topics

# 获取主题配置
msgcli configdb get-topic my_topic

# 列出消费者配置
msgcli configdb consumers
```

### 7. Redis 管理

```bash
# 获取键值
msgcli redis get my_key

# 设置键值
msgcli redis set my_key '{"data": "value"}' -e 3600

# 列出键
msgcli redis keys -p "prefix:*"

# 列表操作
msgcli redis llen my_list
msgcli redis lrange my_list -s 0 -e 10
```

## 数据库表结构

配置数据库需要以下表：

```sql
CREATE TABLE topic_configs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    partitions INT DEFAULT 3,
    replicas INT DEFAULT 1,
    retention_ms BIGINT DEFAULT 86400000,
    description TEXT,
    status VARCHAR(50) DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status)
);

CREATE TABLE consumer_configs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_id VARCHAR(255) NOT NULL,
    topic_name VARCHAR(255) NOT NULL,
    consumer_type VARCHAR(50) DEFAULT 'regular',
    auto_commit BOOLEAN DEFAULT TRUE,
    auto_commit_interval_ms INT DEFAULT 5000,
    description TEXT,
    status VARCHAR(50) DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_group_topic (group_id, topic_name)
);

CREATE TABLE system_configs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    `key` VARCHAR(255) NOT NULL UNIQUE,
    value TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

## 项目结构

```
msgcli/
├── __init__.py
├── cli.py                 # 主 CLI 入口
├── common/                # 公共模块
│   ├── __init__.py
│   ├── logger.py          # 日志工具
│   └── config.py          # 配置管理
├── parser/                # 指令解析模块
│   ├── __init__.py
│   ├── lexer.py           # 词法分析器
│   └── command_parser.py  # 命令解析器
├── inspector/             # 主题巡检模块
│   ├── __init__.py
│   └── topic_inspector.py # 主题巡检器
├── replayer/              # 消息重放模块
│   ├── __init__.py
│   └── message_replayer.py # 消息重放器
├── rpc/                   # 远程调用模块
│   ├── __init__.py
│   └── rpc_client.py      # RPC 客户端
├── msg_cluster/           # 消息集群模块
│   ├── __init__.py
│   ├── kafka_client.py    # Kafka 客户端
│   └── redis_client.py    # Redis 客户端
└── configdb/              # 配置数据库模块
    ├── __init__.py
    ├── models.py          # 数据模型
    └── client.py          # 数据库客户端
```

## 库调用示例

### Python API 使用

```python
from msgcli.msg_cluster import KafkaClient
from msgcli.inspector import TopicInspector
from msgcli.replayer import MessageReplayer
from msgcli.rpc import RPCClient

# Kafka 客户端
kafka = KafkaClient()
kafka.send_message("my_topic", {"key": "value"})
kafka.close()

# 主题巡检
inspector = TopicInspector()
report = inspector.inspect_all()
print(inspector.generate_report(report, "text"))
inspector.close()

# 消息重放
replayer = MessageReplayer()
messages = replayer.collect_messages("source_topic", max_messages=100)
replayer.save_messages_to_file(messages, "messages.json")
replayer.close()

# RPC 调用
rpc = RPCClient(endpoint="http://localhost:8080")
response = rpc.call("kafka.list_topics")
print(response.data)
rpc.close()
```

## License

MIT License
