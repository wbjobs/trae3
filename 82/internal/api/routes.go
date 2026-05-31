package api

import (
	"edge-platform/internal/discovery"
	"edge-platform/internal/logger"
	"edge-platform/internal/router"
	"edge-platform/internal/scheduler"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(
	engine *gin.Engine,
	discSvc *discovery.Service,
	schedSvc *scheduler.Service,
	routerSvc *router.Service,
	logSvc *logger.Service,
) {
	discH := NewDiscoveryHandler(discSvc)
	schedH := NewSchedulerHandler(schedSvc)
	routerH := NewRouterHandler(routerSvc)
	logH := NewLoggerHandler(logSvc)

	engine.Use(TimeoutMiddleware(10 * time.Second))
	engine.Use(HealthCheck(func() error { return schedSvc.Ping() }))

	engine.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})
	engine.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	api := engine.Group("/api/v1")

	writeLimiter := NewTokenBucketLimiter(100, 200)
	readLimiter := NewTokenBucketLimiter(200, 500)
	schedBreaker := NewCircuitBreaker(5, 3, 30*time.Second)

	{
		discovery := api.Group("/discovery")
		discovery.Use(RateLimitMiddleware(readLimiter))
		{
			discovery.GET("/nodes", discH.ListNodes)
			discovery.GET("/nodes/:id", discH.GetNode)
			discovery.POST("/nodes", RateLimitMiddleware(writeLimiter), discH.RegisterNode)
			discovery.DELETE("/nodes/:id", RateLimitMiddleware(writeLimiter), discH.DeregisterNode)
			discovery.POST("/nodes/:id/probe", discH.ProbeNode)
			discovery.POST("/clusters/:cluster_id/probe", discH.ProbeCluster)
			discovery.POST("/clusters/:cluster_id/sync", RateLimitMiddleware(writeLimiter), discH.SyncCluster)
		}

		sched := api.Group("/scheduler")
		sched.Use(CircuitBreakerMiddleware(schedBreaker))
		{
			sched.POST("/tasks", RateLimitMiddleware(writeLimiter), schedH.CreateTask)
			sched.GET("/tasks", RateLimitMiddleware(readLimiter), schedH.ListTasks)
			sched.GET("/tasks/:id", schedH.GetTask)
			sched.POST("/tasks/:id/dispatch", RateLimitMiddleware(writeLimiter), schedH.DispatchTask)
			sched.POST("/tasks/:id/complete", RateLimitMiddleware(writeLimiter), schedH.CompleteTask)
			sched.POST("/tasks/:id/fail", RateLimitMiddleware(writeLimiter), schedH.FailTask)
			sched.POST("/tasks/:id/cancel", RateLimitMiddleware(writeLimiter), schedH.CancelTask)
			sched.POST("/clusters/:cluster_id/batch-dispatch", RateLimitMiddleware(writeLimiter), schedH.BatchDispatch)
			sched.POST("/tasks/recover-stuck", RateLimitMiddleware(writeLimiter), schedH.RecoverStuckTasks)
			sched.POST("/tasks/dispatch-by-priority", RateLimitMiddleware(writeLimiter), schedH.DispatchByPriority)
			sched.POST("/nodes/:node_id/migrate", RateLimitMiddleware(writeLimiter), schedH.MigrateNodeTasks)
			sched.POST("/nodes/migrate-faulty", RateLimitMiddleware(writeLimiter), schedH.MigrateFaultyNodes)
			sched.PUT("/strategy", RateLimitMiddleware(writeLimiter), schedH.SetStrategy)
		}

		rt := api.Group("/router")
		rt.Use(RateLimitMiddleware(readLimiter))
		{
			rt.GET("/rules", routerH.ListRules)
			rt.POST("/rules", RateLimitMiddleware(writeLimiter), routerH.CreateRule)
			rt.PUT("/rules/:id", RateLimitMiddleware(writeLimiter), routerH.UpdateRule)
			rt.DELETE("/rules/:id", RateLimitMiddleware(writeLimiter), routerH.DeleteRule)
			rt.GET("/clusters/:cluster_id/select", routerH.SelectNode)
			rt.POST("/route", RateLimitMiddleware(writeLimiter), routerH.RouteTask)
		}

		lg := api.Group("/logger")
		lg.Use(RateLimitMiddleware(readLimiter))
		{
			lg.POST("/logs", RateLimitMiddleware(writeLimiter), logH.WriteLog)
			lg.POST("/logs/batch", RateLimitMiddleware(writeLimiter), logH.WriteLogsBatch)
			lg.POST("/logs/cleanup", RateLimitMiddleware(writeLimiter), logH.CleanupLogs)
			lg.GET("/logs", logH.QueryLogs)
			lg.GET("/stats/tasks", logH.GetTaskStats)
			lg.GET("/stats/nodes", logH.GetNodeStats)
			lg.POST("/stats/tasks/:cluster_id/aggregate", RateLimitMiddleware(writeLimiter), logH.AggregateTaskStats)
			lg.POST("/stats/nodes/:node_id/aggregate", RateLimitMiddleware(writeLimiter), logH.AggregateNodeStats)
			lg.GET("/dashboard", logH.Dashboard)
		}
	}
}
