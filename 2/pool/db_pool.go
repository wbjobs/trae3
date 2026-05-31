package pool

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"sync"
	"time"

	"industrial-protocol-gateway/common"
	"industrial-protocol-gateway/config"
	"industrial-protocol-gateway/logger"

	_ "github.com/lib/pq"
)

var (
	db              *sql.DB
	dbOnce          sync.Once
	healthCheckDone chan struct{}
)

func InitDBPool() error {
	var initErr error
	dbOnce.Do(func() {
		cfg := config.Get().Database

		dsn := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
			cfg.Host, cfg.Port, cfg.User, cfg.Password, cfg.DBName, cfg.SSLMode)

		var err error
		db, err = sql.Open("postgres", dsn)
		if err != nil {
			initErr = fmt.Errorf("open db failed: %w", err)
			return
		}

		maxOpen := cfg.MaxOpen
		if maxOpen <= 0 {
			maxOpen = 50
		}
		maxIdle := cfg.MaxIdle
		if maxIdle <= 0 {
			maxIdle = 10
		}

		db.SetMaxOpenConns(maxOpen)
		db.SetMaxIdleConns(maxIdle)
		db.SetConnMaxLifetime(1 * time.Hour)
		db.SetConnMaxIdleTime(30 * time.Minute)

		if err := db.Ping(); err != nil {
			initErr = fmt.Errorf("ping db failed: %w", err)
			return
		}

		if err := warmupDBPool(maxIdle); err != nil {
			logger.Warnf("db pool warmup failed: %v", err)
		}

		healthCheckDone = make(chan struct{})
		go startDBHealthCheck()

		logger.Infof("database connection pool initialized: max_open=%d, max_idle=%d", maxOpen, maxIdle)
	})
	return initErr
}

func warmupDBPool(count int) error {
	if count <= 0 {
		return nil
	}

	logger.Infof("warming up database connection pool with %d connections", count)

	conns := make([]*sql.Conn, 0, count)
	for i := 0; i < count; i++ {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		conn, err := db.Conn(ctx)
		cancel()
		if err != nil {
			for _, c := range conns {
				c.Close()
			}
			return fmt.Errorf("warmup connection %d failed: %w", i+1, err)
		}
		conns = append(conns, conn)
	}

	for _, c := range conns {
		c.Close()
	}

	logger.Infof("database connection pool warmup completed successfully")
	return nil
}

func startDBHealthCheck() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			performDBHealthCheck()
		case <-healthCheckDone:
			return
		}
	}
}

func performDBHealthCheck() {
	if db == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		logger.Errorf("database health check failed: %v", err)
		return
	}

	stats := db.Stats()
	usageRatio := float64(stats.InUse) / float64(stats.MaxOpenConnections) * 100
	if usageRatio > 80 {
		logger.Warnf("database connection pool high usage: %.1f%% (in_use: %d, max: %d)",
			usageRatio, stats.InUse, stats.MaxOpenConnections)
	}
}

func ResizeDBPool(newMaxOpen, newMaxIdle int) error {
	if db == nil {
		return fmt.Errorf("db pool not initialized")
	}

	if newMaxOpen <= 0 || newMaxIdle <= 0 {
		return fmt.Errorf("invalid pool size: open=%d, idle=%d", newMaxOpen, newMaxIdle)
	}

	if newMaxIdle > newMaxOpen {
		newMaxIdle = newMaxOpen
	}

	oldStats := db.Stats()

	db.SetMaxOpenConns(newMaxOpen)
	db.SetMaxIdleConns(newMaxIdle)

	logger.Infof("database connection pool resized: open=%d->%d, idle=%d->%d",
		oldStats.MaxOpenConnections, newMaxOpen,
		oldStats.MaxIdleClosed, newMaxIdle)

	return nil
}

func GetDB() *sql.DB {
	return db
}

func CloseDBPool() {
	if healthCheckDone != nil {
		select {
		case <-healthCheckDone:
		default:
			close(healthCheckDone)
		}
	}

	if db != nil {
		if err := db.Close(); err != nil {
			logger.Errorf("close db pool failed: %v", err)
		}
		logger.Info("database connection pool closed")
	}
}

func GetDBStats() sql.DBStats {
	if db == nil {
		return sql.DBStats{}
	}
	return db.Stats()
}

func GetDBStatsWithDetail() map[string]interface{} {
	stats := db.Stats()
	usageRate := float64(0)
	if stats.MaxOpenConnections > 0 {
		usageRate = float64(stats.InUse) / float64(stats.MaxOpenConnections) * 100
	}

	return map[string]interface{}{
		"max_open":     stats.MaxOpenConnections,
		"open":         stats.OpenConnections,
		"in_use":       stats.InUse,
		"idle":         stats.Idle,
		"wait_count":   stats.WaitCount,
		"wait_duration": stats.WaitDuration.Seconds(),
		"max_idle_closed": stats.MaxIdleClosed,
		"max_lifetime_closed": stats.MaxLifetimeClosed,
		"usage_rate":   fmt.Sprintf("%.2f%%", usageRate),
	}
}

func ExecWithRetry(query string, args ...interface{}) (sql.Result, error) {
	maxRetries := 3
	var lastErr error

	for i := 0; i < maxRetries; i++ {
		result, err := db.Exec(query, args...)
		if err == nil {
			return result, nil
		}
		lastErr = err

		if isTransientDBError(err) {
			time.Sleep(time.Duration(i+1) * 100 * time.Millisecond)
			continue
		}
		break
	}

	return nil, lastErr
}

func QueryWithRetry(query string, args ...interface{}) (*sql.Rows, error) {
	maxRetries := 3
	var lastErr error

	for i := 0; i < maxRetries; i++ {
		rows, err := db.Query(query, args...)
		if err == nil {
			return rows, nil
		}
		lastErr = err

		if isTransientDBError(err) {
			time.Sleep(time.Duration(i+1) * 100 * time.Millisecond)
			continue
		}
		break
	}

	return nil, lastErr
}

func isTransientDBError(err error) bool {
	errStr := strings.ToLower(err.Error())
	transientErrors := []string{
		"connection reset",
		"connection refused",
		"connection timed out",
		"deadlock",
		"timeout",
		"tls handshake",
		"too many connections",
	}
	for _, e := range transientErrors {
		if strings.Contains(errStr, e) {
			return true
		}
	}
	return false
}

func WithTransaction(fn func(tx *sql.Tx) error) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("begin tx failed: %w", err)
	}
	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback()
			panic(p)
		}
	}()

	if err := fn(tx); err != nil {
		if rbErr := tx.Rollback(); rbErr != nil {
			logger.Errorf("rollback tx failed: %v", rbErr)
		}
		return err
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit tx failed: %w", err)
	}
	return nil
}

func WithTransactionRetry(fn func(tx *sql.Tx) error) error {
	maxRetries := 3
	var lastErr error

	for i := 0; i < maxRetries; i++ {
		err := WithTransaction(fn)
		if err == nil {
			return nil
		}
		lastErr = err

		if isTransientDBError(err) {
			time.Sleep(time.Duration(i+1) * 100 * time.Millisecond)
			continue
		}
		break
	}

	return lastErr
}
