package router

import (
	"net/http"
	"runtime"
	"time"

	"github.com/gin-gonic/gin"

	"industrial-protocol-gateway/common"
	"industrial-protocol-gateway/pool"
	"industrial-protocol-gateway/storage"
)

func HealthCheck(c *gin.Context) {
	start := time.Now()
	traceID := GetTraceID(c)

	ok, err := pool.HealthCheck(c.Request.Context())

	elapsed := time.Since(start).Milliseconds()
	c.JSON(http.StatusOK, common.SuccessResponse(map[string]interface{}{
		"status":  "ok",
		"healthy": ok,
		"error":   err,
		"time":    time.Now().Format(time.RFC3339),
	}, traceID, elapsed))
}

func GetSystemStatus(c *gin.Context) {
	start := time.Now()
	traceID := GetTraceID(c)

	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	poolStats := pool.GetStats()
	storageStats := storage.GetStats()
	compressionStats := storage.GetCompressionStats()
	forwardStats := storage.GetForwardManager().GetForwardStats()
	workerStats := map[string]interface{}{
		"parse_pool":   common.GetParsePool().GetStats(),
		"storage_pool": common.GetStoragePool().GetStats(),
		"forward_pool": common.GetForwardPool().GetStats(),
	}
	dbStats := pool.GetDBStatsWithDetail()
	devicePoolStats := pool.GetDevicePool().Stats()

	elapsed := time.Since(start).Milliseconds()
	c.JSON(http.StatusOK, common.SuccessResponse(map[string]interface{}{
		"system": map[string]interface{}{
			"go_version":    runtime.Version(),
			"os":            runtime.GOOS,
			"arch":          runtime.GOARCH,
			"num_goroutine": runtime.NumGoroutine(),
			"num_cpu":       runtime.NumCPU(),
			"uptime":        common.FormatDuration(time.Since(start)),
		},
		"memory": map[string]interface{}{
			"alloc":         m.Alloc,
			"total_alloc":   m.TotalAlloc,
			"sys":           m.Sys,
			"heap_alloc":    m.HeapAlloc,
			"heap_sys":      m.HeapSys,
			"heap_idle":     m.HeapIdle,
			"heap_inuse":    m.HeapInuse,
			"heap_released": m.HeapReleased,
			"heap_objects":  m.HeapObjects,
			"stack_inuse":   m.StackInuse,
			"stack_sys":     m.StackSys,
		},
		"pool":         poolStats,
		"db_pool":      dbStats,
		"device_pool":  devicePoolStats,
		"worker_pools": workerStats,
		"storage":      storageStats,
		"compression":  compressionStats,
		"forward":      forwardStats,
	}, traceID, elapsed))
}

func GetPoolStats(c *gin.Context) {
	start := time.Now()
	traceID := GetTraceID(c)

	stats := pool.GetStats()

	elapsed := time.Since(start).Milliseconds()
	c.JSON(http.StatusOK, common.SuccessResponse(stats, traceID, elapsed))
}

func GetMetrics(c *gin.Context) {
	start := time.Now()
	traceID := GetTraceID(c)

	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	elapsed := time.Since(start).Milliseconds()
	c.JSON(http.StatusOK, common.SuccessResponse(map[string]interface{}{
		"go_goroutines": runtime.NumGoroutine(),
		"go_memstats_alloc_bytes": m.Alloc,
		"go_memstats_heap_alloc_bytes": m.HeapAlloc,
		"go_memstats_heap_inuse_bytes": m.HeapInuse,
		"go_memstats_heap_idle_bytes": m.HeapIdle,
		"go_memstats_stack_inuse_bytes": m.StackInuse,
		"go_memstats_next_gc_bytes": m.NextGC,
	}, traceID, elapsed))
}

func SetupSystemRoutes(r *gin.RouterGroup) {
	system := r.Group("/system")
	{
		system.GET("/health", HealthCheck)

		authSystem := system.Group("", AuthRequired())
		{
			authSystem.GET("/status", RoleRequired("admin"), GetSystemStatus)
			authSystem.GET("/pool", RoleRequired("admin"), GetPoolStats)
			authSystem.GET("/metrics", GetMetrics)
		}
	}
}
