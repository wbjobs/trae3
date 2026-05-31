package config

import (
	"encoding/json"
	"os"
)

type Config struct {
	Server   ServerConfig   `json:"server"`
	ConfigDB DBConfig       `json:"config_db"`
	LogDB    DBConfig       `json:"log_db"`
	Clusters []ClusterConfig `json:"clusters"`
}

type ServerConfig struct {
	Port int    `json:"port"`
	Mode string `json:"mode"`
}

type DBConfig struct {
	Driver string `json:"driver"`
	DSN    string `json:"dsn"`
}

type ClusterConfig struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Address string `json:"address"`
}

func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}
