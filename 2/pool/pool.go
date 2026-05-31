package pool

import (
	"context"
	"sync"
	"time"
)

type PoolStats struct {
	DBStats      map[string]interface{} `json:"db_stats"`
	DeviceStats map[string]interface{} `json:"device_stats"`
}

type PoolManager struct {
	devicePool *DevicePool
	once       sync.Once
}

var manager *PoolManager

func Init() {
	InitDevicePool()
}

func GetStats() *PoolStats {
	dbStats := GetDBStats()
	deviceStats := GetDevicePool().Stats()

	return &PoolStats{
		DBStats: map[string]interface{}{
			"max_open":     dbStats.MaxOpenConnections,
			"open":         dbStats.OpenConnections,
			"in_use":       dbStats.InUse,
			"idle":         dbStats.Idle,
			"wait_count":   dbStats.WaitCount,
			"wait_duration": dbStats.WaitDuration.Seconds(),
		},
		DeviceStats: deviceStats,
	}
}

func Shutdown() {
	if db != nil {
		CloseDBPool()
	}
	if devicePool != nil {
		devicePool.Close()
	}
}

func HealthCheck(ctx context.Context) (bool, error) {
	if db == nil {
		return false, nil
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		return false, err
	}

	return true, nil
}
