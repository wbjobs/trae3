package db

import (
	"edge-platform/internal/config"
	"edge-platform/internal/model"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type Databases struct {
	ConfigDB *gorm.DB
	LogDB    *gorm.DB
}

func Init(cfg *config.Config) (*Databases, error) {
	configDB, err := gorm.Open(sqlite.Open(cfg.ConfigDB.DSN+"?_journal_mode=WAL&_busy_timeout=5000"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, err
	}

	if err := configureConnectionPool(configDB); err != nil {
		return nil, err
	}

	if err := configDB.AutoMigrate(
		&model.Node{},
		&model.Task{},
		&model.Cluster{},
		&model.RouteRule{},
	); err != nil {
		return nil, err
	}

	if err := ensureIndexes(configDB); err != nil {
		return nil, err
	}

	logDB, err := gorm.Open(sqlite.Open(cfg.LogDB.DSN+"?_journal_mode=WAL&_busy_timeout=5000"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, err
	}

	if err := configureConnectionPool(logDB); err != nil {
		return nil, err
	}

	if err := logDB.AutoMigrate(
		&model.RuntimeLog{},
		&model.TaskStat{},
		&model.NodeStat{},
	); err != nil {
		return nil, err
	}

	if err := ensureLogIndexes(logDB); err != nil {
		return nil, err
	}

	return &Databases{
		ConfigDB: configDB,
		LogDB:    logDB,
	}, nil
}

func configureConnectionPool(db *gorm.DB) error {
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	sqlDB.SetMaxOpenConns(25)
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetConnMaxLifetime(30 * time.Minute)
	sqlDB.SetConnMaxIdleTime(5 * time.Minute)
	return nil
}

func ensureIndexes(db *gorm.DB) error {
	indexes := []struct {
		table  string
		name   string
		column string
	}{
		{"tasks", "idx_tasks_status", "status"},
		{"tasks", "idx_tasks_cluster_status", "cluster_id, status"},
		{"tasks", "idx_tasks_node_status", "node_id, status"},
		{"tasks", "idx_tasks_priority", "priority DESC"},
		{"tasks", "idx_tasks_created_at", "created_at"},
		{"nodes", "idx_nodes_cluster_status", "cluster_id, status"},
		{"nodes", "idx_nodes_status_heartbeat", "status, last_heartbeat"},
		{"route_rules", "idx_rules_cluster_enabled", "cluster_id, enabled"},
	}
	for _, idx := range indexes {
		if err := db.Exec("CREATE INDEX IF NOT EXISTS "+idx.name+" ON "+idx.table+" ("+idx.column+")").Error; err != nil {
			return err
		}
	}
	return nil
}

func ensureLogIndexes(db *gorm.DB) error {
	indexes := []struct {
		table  string
		name   string
		column string
	}{
		{"runtime_logs", "idx_logs_created_at", "created_at"},
		{"runtime_logs", "idx_logs_level_module", "level, module"},
		{"runtime_logs", "idx_logs_cluster", "cluster_id, created_at"},
		{"runtime_logs", "idx_logs_task", "task_id"},
		{"task_stats", "idx_task_stats_cluster_date", "cluster_id, stat_date"},
		{"node_stats", "idx_node_stats_node_date", "node_id, stat_date"},
	}
	for _, idx := range indexes {
		if err := db.Exec("CREATE INDEX IF NOT EXISTS "+idx.name+" ON "+idx.table+" ("+idx.column+")").Error; err != nil {
			return err
		}
	}
	return nil
}

func (d *Databases) Close() error {
	cfgSQL, err := d.ConfigDB.DB()
	if err != nil {
		return err
	}
	logSQL, err := d.LogDB.DB()
	if err != nil {
		return err
	}
	if err := cfgSQL.Close(); err != nil {
		return err
	}
	return logSQL.Close()
}
