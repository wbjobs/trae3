# 异构工业协议报文解析转发 API 集群服务

基于 Go 语言开发的工业协议网关服务，支持 Modbus、IEC104 两种工业协议的报文解析、转发和存储。

## 功能特性

### 协议解析
- **Modbus RTU/TCP**: 支持功能码 0x01-0x06、0x0F、0x10
  - 读线圈、读离散输入
  - 读保持寄存器、读输入寄存器
  - 写单个线圈、写单个寄存器
  - 写多个线圈、写多个寄存器
- **IEC 60870-5-104**: 支持 APCI/ASDU 结构解析
  - U-format: STARTDT、STOPDT、TESTFR
  - I-format: 信息传输
  - S-format: 链路确认
  - ASDU 类型: 单点/双点信息、测量值、步位置、位串等

### 核心功能
- **RESTful API**: 统一的 HTTP 接口对外提供服务
- **集群同步**: 基于 etcd 的多实例集群管理和数据同步
- **时序存储**: InfluxDB 2.x 存储原始报文和解析数据
- **连接池管理**: 数据库连接池、设备 TCP 连接池
- **接口限流**: 令牌桶算法实现三级限流（全局/IP/API Key）
- **身份认证**: JWT + API Key 双模式认证
- **日志归档**: 结构化日志、自动切割、定时归档
- **数据转发**: 支持多目标 HTTP Webhook 回调

## 项目架构

```
industrial-protocol-gateway/
├── main.go                    # 主入口
├── go.mod                     # 模块定义
├── config/                    # 配置管理
│   ├── config.go
│   └── config.yaml
├── common/                    # 公共工具
│   ├── snowflake.go          # 雪花算法 ID
│   ├── utils.go              # 工具函数
│   ├── errors.go             # 错误定义
│   └── response.go           # 统一响应
├── logger/                    # 日志归档
│   └── logger.go
├── protocol/                  # 协议解析
│   ├── parser.go             # 解析器接口
│   ├── modbus.go             # Modbus 解析
│   └── iec104.go             # IEC104 解析
├── pool/                      # 连接池管理
│   ├── pool.go               # 连接池总控
│   ├── db_pool.go            # 数据库连接池
│   └── device_pool.go        # 设备连接池
├── storage/                   # 数据存储
│   ├── influxdb.go           # InfluxDB 对接
│   └── forward.go            # 数据转发
├── cluster/                   # 集群管理
│   └── cluster.go            # etcd 集群同步
├── router/                    # 路由分发
│   ├── router.go             # 路由总入口
│   ├── middleware.go         # 中间件
│   ├── auth_handler.go       # 认证接口
│   ├── protocol_handler.go   # 协议处理接口
│   ├── data_handler.go       # 数据查询接口
│   ├── cluster_handler.go    # 集群管理接口
│   └── system_handler.go     # 系统监控接口
└── deploy/                    # 部署配置
    ├── Dockerfile
    ├── docker-compose.yml
    ├── industrial-gateway.service
    ├── nginx.conf
    ├── install.sh
    ├── build.sh
    ├── start.sh
    └── stop.sh
```

## 快速开始

### 环境要求
- Go 1.21+
- PostgreSQL 13+
- InfluxDB 2.x
- etcd 3.5+

### 构建

```bash
# 下载依赖
go mod tidy

# 构建
go build -o industrial-protocol-gateway .

# 交叉编译 Linux 版本
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o industrial-protocol-gateway .
```

### 配置

复制并修改配置文件：

```bash
cp config/config.yaml config.yaml
```

主要配置项：

```yaml
server:
  mode: debug                    # debug/release
  host: 0.0.0.0
  port: 8080

database:
  host: localhost
  port: 5432
  db: gateway
  user: gateway
  password: gateway_password

influxdb:
  host: localhost
  port: 8086
  token: gateway-token
  org: industrial
  bucket: gateway

cluster:
  mode: etcd                     # etcd/raft
  node_id: node-1
  bind_addr: 0.0.0.0:9000
  http_addr: 127.0.0.1:8080
  etcd_endpoints:
    - 127.0.0.1:2379

auth:
  jwt_secret: your-secret-key
  jwt_expire_hours: 24
  api_keys:
    - key: test-api-key
      name: test
      role: admin

rate_limit:
  global: 1000                   # 每秒请求数
  per_ip: 100
  per_api_key: 500
```

也可以使用环境变量配置（前缀 `GATEWAY_`）：

```bash
export GATEWAY_SERVER_MODE=release
export GATEWAY_SERVER_PORT=8080
export GATEWAY_DATABASE_PASSWORD=your_password
```

### 运行

```bash
# 直接运行
./industrial-protocol-gateway

# 指定配置文件
./industrial-protocol-gateway -config config.yaml
```

## API 文档

所有接口前缀：`/api/v1`

### 认证接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/auth/login` | 用户登录获取 Token | 公开 |
| POST | `/auth/logout` | 用户登出 | 已认证 |
| GET | `/auth/me` | 获取当前用户信息 | 已认证 |
| POST | `/auth/refresh` | 刷新 Token | 已认证 |

### 协议处理接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/protocol/parse` | 解析协议报文 | 已认证 |
| POST | `/protocol/detect` | 自动检测协议类型 | 已认证 |
| POST | `/protocol/validate` | 验证报文格式 | 已认证 |
| POST | `/protocol/send` | 构建协议命令 | 已认证 |
| GET | `/protocol/supported` | 获取支持的协议列表 | 已认证 |
| POST | `/protocol/forward` | 添加转发目标 | admin |
| GET | `/protocol/forward` | 获取转发目标列表 | 已认证 |
| DELETE | `/protocol/forward/:id` | 删除转发目标 | admin |

### 数据查询接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/data/protocol` | 查询解析后的数据 | 已认证 |
| GET | `/data/raw` | 查询原始报文 | 已认证 |
| POST | `/data/query` | 执行 Flux 查询 | admin |

### 集群管理接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/cluster/status` | 获取集群状态 | 已认证 |
| GET | `/cluster/nodes` | 获取集群节点列表 | 已认证 |
| POST | `/cluster/command` | 发送集群同步命令 | admin |

### 系统监控接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/system/health` | 健康检查 | 公开 |
| GET | `/system/status` | 系统状态监控 | 已认证 |
| GET | `/system/pool` | 连接池状态 | 已认证 |
| GET | `/system/metrics` | 运行指标 | 已认证 |

### 统一响应格式

```json
{
  "code": 0,
  "message": "success",
  "trace_id": "xxx",
  "elapsed_ms": 10,
  "data": {}
}
```

- `code`: 0 表示成功，非 0 表示错误
- `trace_id`: 请求追踪 ID，用于问题排查
- `elapsed_ms`: 请求处理耗时（毫秒）

### 错误码

| 错误码 | 说明 |
|--------|------|
| 0 | 成功 |
| 1001 | 协议错误 |
| 1002 | 不支持的协议 |
| 1003 | 报文格式错误 |
| 1004 | 校验和错误 |
| 1005 | 功能码不支持 |
| 2001 | 认证失败 |
| 2002 | Token 过期 |
| 2003 | 权限不足 |
| 2004 | API Key 无效 |
| 3001 | 参数错误 |
| 3002 | 资源不存在 |
| 3003 | 频率超限 |
| 4001 | 连接池已满 |
| 4002 | 连接超时 |
| 4003 | 设备连接失败 |
| 5001 | 集群同步失败 |
| 5002 | 存储错误 |

## 使用示例

### 1. 用户登录

```bash
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
    "expires_in": 86400
  }
}
```

### 2. 解析 Modbus 报文

```bash
curl -X POST http://localhost:8080/api/v1/protocol/parse \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access_token>" \
  -d '{
    "protocol": "modbus",
    "data": "010300000002C40B",
    "device_id": "PLC-001",
    "auto_detect": false
  }'
```

响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "protocol": "modbus",
    "slave_id": 1,
    "function": "Read Holding Registers",
    "data_points": [
      {
        "address": 0,
        "value": 100,
        "type": "register"
      },
      {
        "address": 1,
        "value": 200,
        "type": "register"
      }
    ],
    "timestamp": "2024-01-01T12:00:00Z",
    "device_id": "PLC-001"
  }
}
```

### 3. 解析 IEC104 报文

```bash
curl -X POST http://localhost:8080/api/v1/protocol/parse \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access_token>" \
  -d '{
    "protocol": "iec104",
    "data": "680E000000000101000100000000",
    "device_id": "RTU-001"
  }'
```

### 4. 使用 API Key 认证

```bash
curl http://localhost:8080/api/v1/system/health \
  -H "X-API-Key: test-api-key"
```

### 5. 健康检查

```bash
curl http://localhost:8080/api/v1/system/health
```

响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-01T12:00:00Z"
  }
}
```

## 部署

### Docker 部署

```bash
cd deploy
docker-compose up -d
```

### Linux 系统部署

```bash
# 1. 构建
./deploy/build.sh

# 2. 解压到目标机器
tar -xzf industrial-protocol-gateway-1.0.0-linux-amd64.tar.gz
cd deploy

# 3. 安装
sudo ./install.sh

# 4. 启动服务
sudo systemctl start industrial-gateway
sudo systemctl enable industrial-gateway

# 5. 查看状态
sudo systemctl status industrial-gateway
journalctl -u industrial-gateway -f
```

### Nginx 反向代理

参考 `deploy/nginx.conf` 配置 Nginx 作为负载均衡器。

## 集群部署

### 多节点集群配置

节点 1 配置：

```yaml
cluster:
  mode: etcd
  node_id: node-1
  bind_addr: 0.0.0.0:9000
  http_addr: 192.168.1.10:8080
  etcd_endpoints:
    - 192.168.1.10:2379
    - 192.168.1.11:2379
    - 192.168.1.12:2379
```

节点 2 配置：

```yaml
cluster:
  mode: etcd
  node_id: node-2
  bind_addr: 0.0.0.0:9000
  http_addr: 192.168.1.11:8080
  etcd_endpoints:
    - 192.168.1.10:2379
    - 192.168.1.11:2379
    - 192.168.1.12:2379
```

## 日志

日志文件默认位置：`/var/log/industrial-gateway/`

- `gateway.log`: 主日志
- `protocol.log`: 协议解析日志
- `audit.log`: 审计日志
- `stdout.log`: 标准输出
- `stderr.log`: 标准错误

日志自动切割策略：
- 单文件最大 100MB
- 保留最近 30 天
- 最多保留 10 个文件
- 每日 0 点归档压缩

## 性能监控

系统提供运行指标接口：

```bash
curl http://localhost:8080/api/v1/system/metrics \
  -H "Authorization: Bearer <access_token>"
```

包括：
- CPU/内存使用率
- Goroutine 数量
- API 请求统计
- 连接池状态
- 协议解析统计
- 存储写入统计

## 安全建议

1. **修改默认密码和密钥**：生产环境必须修改默认的 JWT Secret、API Key 和数据库密码
2. **启用 HTTPS**：使用 Nginx 或 Traefik 配置 SSL/TLS
3. **网络隔离**：将服务部署在内网，限制外部访问
4. **定期更新**：及时更新依赖包和 Go 版本
5. **审计日志**：开启审计日志，记录所有关键操作

## 开发说明

### 添加新的协议支持

1. 在 `protocol/` 目录下创建新的解析器文件
2. 实现 `Parser` 接口：
   - `Parse(data []byte) (*ParseResult, error)`
   - `BuildRequest(req interface{}) ([]byte, error)`
   - `Validate(data []byte) error`
   - `GetProtocol() ProtocolType`
3. 在 `parser.go` 的 `NewParser` 工厂函数中注册

### 扩展集群同步命令

1. 在 `cluster/cluster.go` 中添加新的 `SyncCommandType`
2. 注册处理函数：`cluster.RegisterHandler(cmdType, handler)`
3. 调用 `cluster.BroadcastCommand(cmd)` 发送同步命令

## License

MIT License
