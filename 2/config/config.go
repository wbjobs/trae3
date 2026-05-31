package config

import (
	"fmt"
	"strings"

	"github.com/spf13/viper"
)

type Config struct {
	Server    ServerConfig    `mapstructure:"server"`
	Database DatabaseConfig    `mapstructure:"database"`
	InfluxDB InfluxDBConfig  `mapstructure:"influxdb"`
	Cluster  ClusterConfig   `mapstructure:"cluster"`
	Auth     AuthConfig      `mapstructure:"auth"`
	RateLimit RateLimitConfig `mapstructure:"ratelimit"`
	Log      LogConfig       `mapstructure:"log"`
	Protocol ProtocolConfig  `mapstructure:"protocol"`
}

type ServerConfig struct {
	Port     string `mapstructure:"port"`
	NodeID   uint16 `mapstructure:"node_id"`
	Mode     string `mapstructure:"mode"`
}

type DatabaseConfig struct {
	Host     string `mapstructure:"host"`
	Port     string `mapstructure:"port"`
	User     string `mapstructure:"user"`
	Password string `mapstructure:"password"`
	DBName   string `mapstructure:"dbname"`
	SSLMode  string `mapstructure:"sslmode"`
	MaxOpen  int    `mapstructure:"max_open"`
	MaxIdle  int    `mapstructure:"max_idle"`
}

type InfluxDBConfig struct {
	URL           string `mapstructure:"url"`
	Token         string `mapstructure:"token"`
	Org           string `mapstructure:"org"`
	Bucket        string `mapstructure:"bucket"`
	BatchSize     int    `mapstructure:"batch_size"`
	CompressRaw   bool   `mapstructure:"compress_raw"`
	RawRetention  string `mapstructure:"raw_retention"`
	Downsample    bool   `mapstructure:"downsample"`
	ColdBucket    string `mapstructure:"cold_bucket"`
	ColdThreshold string `mapstructure:"cold_threshold"`
}

type ClusterConfig struct {
	Mode       string   `mapstructure:"mode"`
	NodeID     string   `mapstructure:"node_id"`
	JoinAddr   string   `mapstructure:"join_addr"`
	BindAddr   string   `mapstructure:"bind_addr"`
	HTTPAddr   string   `mapstructure:"http_addr"`
	Peers      []string `mapstructure:"peers"`
	EtcdEndpoints []string `mapstructure:"etcd_endpoints"`
}

type AuthConfig struct {
	JWTSecret string `mapstructure:"jwt_secret"`
	JWTExpire int    `mapstructure:"jwt_expire"`
	APIKeys   []APIKey `mapstructure:"api_keys"`
}

type APIKey struct {
	Key    string `mapstructure:"key"`
	Name   string `mapstructure:"name"`
	Role   string `mapstructure:"role"`
}

type RateLimitConfig struct {
	Global      int64            `mapstructure:"global"`
	PerIP       int64            `mapstructure:"per_ip"`
	PerKey      int64            `mapstructure:"per_key"`
	WhitelistIP []string         `mapstructure:"whitelist_ip"`
	WhitelistKey []string        `mapstructure:"whitelist_key"`
	PathLimits  map[string]int64 `mapstructure:"path_limits"`
}

type LogConfig struct {
	Level      string `mapstructure:"level"`
	FilePath   string `mapstructure:"file_path"`
	MaxSize    int    `mapstructure:"max_size"`
	MaxBackups int    `mapstructure:"max_backups"`
	MaxAge     int    `mapstructure:"max_age"`
	Compress   bool   `mapstructure:"compress"`
}

type ProtocolConfig struct {
	Modbus     ModbusConfig     `mapstructure:"modbus"`
	IEC104     IEC104Config     `mapstructure:"iec104"`
	WorkerPool WorkerPoolConfig `mapstructure:"worker_pool"`
}

type WorkerPoolConfig struct {
	ParseWorkers   int `mapstructure:"parse_workers"`
	StorageWorkers int `mapstructure:"storage_workers"`
	ForwardWorkers int `mapstructure:"forward_workers"`
	QueueSize      int `mapstructure:"queue_size"`
}

type ModbusConfig struct {
	Timeout     int  `mapstructure:"timeout"`
	MaxRetries  int  `mapstructure:"max_retries"`
	PoolWarmup  bool `mapstructure:"pool_warmup"`
	HealthCheck bool `mapstructure:"health_check"`
}

type IEC104Config struct {
	APCI       uint16 `mapstructure:"apci"`
	Timeout    int    `mapstructure:"timeout"`
	MaxRetries int    `mapstructure:"max_retries"`
}

var cfg *Config

func Load() error {
	v := viper.New()
	v.SetConfigName("config")
	v.SetConfigType("yaml")
	v.AddConfigPath(".")
	v.AddConfigPath("./config")
	v.AddConfigPath("/etc/industrial-gateway")

	v.SetEnvPrefix("GATEWAY")
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()

	if err := v.ReadInConfig(); err != nil {
		return fmt.Errorf("read config failed: %w", err)
	}

	cfg = &Config{}
	if err := v.Unmarshal(cfg); err != nil {
		return fmt.Errorf("unmarshal config failed: %w", err)
	}

	return nil
}

func Get() *Config {
	return cfg
}

func LoadFromBytes(data []byte) error {
	v := viper.New()
	v.SetConfigType("yaml")
	if err := v.ReadConfig(strings.NewReader(string(data))); err != nil {
		return err
	}
	cfg = &Config{}
	return v.Unmarshal(cfg)
}
