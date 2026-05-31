package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/viper"
)

type Config struct {
	Gateways  []GatewayConfig    `mapstructure:"gateways" json:"gateways"`
	Scheduler SchedulerConfig    `mapstructure:"scheduler" json:"scheduler"`
	Report    ReportConfig       `mapstructure:"report" json:"report"`
	Rules     RulesConfig        `mapstructure:"rules" json:"rules"`
}

type GatewayConfig struct {
	Name       string `mapstructure:"name" json:"name"`
	Group      string `mapstructure:"group" json:"group,omitempty"`
	Host       string `mapstructure:"host" json:"host"`
	Port       int    `mapstructure:"port" json:"port"`
	Username   string `mapstructure:"username" json:"username"`
	Password   string `mapstructure:"password" json:"-"`
	PrivateKey string `mapstructure:"private_key" json:"private_key,omitempty"`
	Timeout    int    `mapstructure:"timeout" json:"timeout"`
	Enabled    bool   `mapstructure:"enabled" json:"enabled"`
}

type SchedulerConfig struct {
	Enabled  bool   `mapstructure:"enabled" json:"enabled"`
	CronExpr string `mapstructure:"cron_expr" json:"cron_expr"`
}

type ReportConfig struct {
	OutputDir string   `mapstructure:"output_dir" json:"output_dir"`
	Formats   []string `mapstructure:"formats" json:"formats"`
}

type RulesConfig struct {
	CPUThreshold        float64      `mapstructure:"cpu_threshold" json:"cpu_threshold"`
	MemoryThreshold     float64      `mapstructure:"memory_threshold" json:"memory_threshold"`
	DiskThreshold       float64      `mapstructure:"disk_threshold" json:"disk_threshold"`
	LoadThreshold       float64      `mapstructure:"load_threshold" json:"load_threshold"`
	SwapThreshold       float64      `mapstructure:"swap_threshold" json:"swap_threshold"`
	ZombieThreshold     int          `mapstructure:"zombie_threshold" json:"zombie_threshold"`
	ConnectionThreshold int          `mapstructure:"connection_threshold" json:"connection_threshold"`
	CustomRules         []CustomRule `mapstructure:"custom_rules" json:"custom_rules,omitempty"`
	ServiceChecks       []string     `mapstructure:"service_checks" json:"service_checks,omitempty"`
}

type CustomRule struct {
	ID          string `mapstructure:"id" json:"id"`
	Name        string `mapstructure:"name" json:"name"`
	Description string `mapstructure:"description" json:"description"`
	Severity    string `mapstructure:"severity" json:"severity"`
	Command     string `mapstructure:"command" json:"command"`
	Condition   string `mapstructure:"condition" json:"condition"`
	Threshold   string `mapstructure:"threshold" json:"threshold"`
}

func LoadConfig(configPath string) (*Config, error) {
	v := viper.New()
	v.SetEnvPrefix("INSPECTOR")
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()

	v.SetDefault("scheduler.enabled", false)
	v.SetDefault("scheduler.cron_expr", "0 0 * * *")
	v.SetDefault("report.output_dir", "./reports")
	v.SetDefault("report.formats", []string{"console", "html"})
	v.SetDefault("rules.cpu_threshold", 80.0)
	v.SetDefault("rules.memory_threshold", 85.0)
	v.SetDefault("rules.disk_threshold", 90.0)
	v.SetDefault("rules.load_threshold", 1.5)
	v.SetDefault("rules.swap_threshold", 50.0)
	v.SetDefault("rules.zombie_threshold", 5)
	v.SetDefault("rules.connection_threshold", 1000)
	v.SetDefault("rules.service_checks", []string{"nginx", "docker", "mosquitto", "frps"})

	if configPath != "" {
		v.SetConfigFile(configPath)
		v.SetConfigType(strings.TrimPrefix(filepath.Ext(configPath), "."))
	} else {
		v.SetConfigName("config")
		v.SetConfigType("yaml")
		v.AddConfigPath(".")
		v.AddConfigPath("/etc/edge-inspector")
		v.AddConfigPath("$HOME/.edge-inspector")
	}

	if err := v.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); ok {
			cfg := getDefaultConfig()
			applyEnvOverrides(cfg)
			return cfg, nil
		}
		return nil, fmt.Errorf("failed to read config: %w", err)
	}

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("failed to unmarshal config: %w", err)
	}

	applyEnvOverrides(&cfg)

	return &cfg, nil
}

func applyEnvOverrides(cfg *Config) {
	for i := range cfg.Gateways {
		gw := &cfg.Gateways[i]
		prefix := "INSPECTOR_GW_" + strings.ToUpper(strings.ReplaceAll(gw.Name, "-", "_")) + "_"

		if host := os.Getenv(prefix + "HOST"); host != "" {
			gw.Host = host
		}
		if port := os.Getenv(prefix + "PORT"); port != "" {
			var p int
			if _, err := fmt.Sscanf(port, "%d", &p); err == nil && p > 0 && p <= 65535 {
				gw.Port = p
			}
		}
		if user := os.Getenv(prefix + "USER"); user != "" {
			gw.Username = user
		}
		if pass := os.Getenv(prefix + "PASS"); pass != "" {
			gw.Password = pass
		}
		if key := os.Getenv(prefix + "KEY"); key != "" {
			gw.PrivateKey = key
		}
	}

	if cron := os.Getenv("INSPECTOR_SCHEDULER_CRON"); cron != "" {
		cfg.Scheduler.CronExpr = cron
	}
}

func getDefaultConfig() *Config {
	return &Config{
		Gateways: []GatewayConfig{},
		Scheduler: SchedulerConfig{
			Enabled:  false,
			CronExpr: "0 0 * * *",
		},
		Report: ReportConfig{
			OutputDir: "./reports",
			Formats:   []string{"console", "html"},
		},
		Rules: RulesConfig{
			CPUThreshold:        80.0,
			MemoryThreshold:     85.0,
			DiskThreshold:       90.0,
			LoadThreshold:       1.5,
			SwapThreshold:       50.0,
			ZombieThreshold:     5,
			ConnectionThreshold: 1000,
			ServiceChecks:       []string{"nginx", "docker", "mosquitto", "frps"},
		},
	}
}

func SaveConfig(cfg *Config, configPath string) error {
	v := viper.New()
	v.SetConfigType("yaml")

	v.Set("gateways", cfg.Gateways)
	v.Set("scheduler.enabled", cfg.Scheduler.Enabled)
	v.Set("scheduler.cron_expr", cfg.Scheduler.CronExpr)
	v.Set("report.output_dir", cfg.Report.OutputDir)
	v.Set("report.formats", cfg.Report.Formats)
	v.Set("rules.cpu_threshold", cfg.Rules.CPUThreshold)
	v.Set("rules.memory_threshold", cfg.Rules.MemoryThreshold)
	v.Set("rules.disk_threshold", cfg.Rules.DiskThreshold)
	v.Set("rules.load_threshold", cfg.Rules.LoadThreshold)
	v.Set("rules.swap_threshold", cfg.Rules.SwapThreshold)
	v.Set("rules.zombie_threshold", cfg.Rules.ZombieThreshold)
	v.Set("rules.connection_threshold", cfg.Rules.ConnectionThreshold)
	v.Set("rules.service_checks", cfg.Rules.ServiceChecks)
	if len(cfg.Rules.CustomRules) > 0 {
		v.Set("rules.custom_rules", cfg.Rules.CustomRules)
	}

	dir := filepath.Dir(configPath)
	if dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("failed to create config directory: %w", err)
		}
	}

	if err := v.WriteConfigAs(configPath); err != nil {
		return fmt.Errorf("failed to write config: %w", err)
	}

	return nil
}

func GenerateSampleConfig(configPath string) error {
	sampleConfig := &Config{
		Gateways: []GatewayConfig{
			{
				Name:       "gateway-01",
				Group:      "production",
				Host:       "192.168.1.100",
				Port:       22,
				Username:   "root",
				Password:   "",
				PrivateKey: "~/.ssh/id_rsa",
				Timeout:    10,
				Enabled:    true,
			},
			{
				Name:       "gateway-02",
				Group:      "production",
				Host:       "192.168.1.101",
				Port:       22,
				Username:   "admin",
				Password:   "your-password",
				PrivateKey: "",
				Timeout:    10,
				Enabled:    true,
			},
			{
				Name:       "gateway-test-01",
				Group:      "testing",
				Host:       "192.168.2.100",
				Port:       22,
				Username:   "root",
				Password:   "",
				PrivateKey: "~/.ssh/id_rsa",
				Timeout:    10,
				Enabled:    true,
			},
		},
		Scheduler: SchedulerConfig{
			Enabled:  false,
			CronExpr: "0 0 * * *",
		},
		Report: ReportConfig{
			OutputDir: "./reports",
			Formats:   []string{"console", "html", "json"},
		},
		Rules: RulesConfig{
			CPUThreshold:        80.0,
			MemoryThreshold:     85.0,
			DiskThreshold:       90.0,
			LoadThreshold:       1.5,
			SwapThreshold:       50.0,
			ZombieThreshold:     5,
			ConnectionThreshold: 1000,
			ServiceChecks:       []string{"nginx", "docker", "mosquitto", "frps"},
		},
	}

	return SaveConfig(sampleConfig, configPath)
}
