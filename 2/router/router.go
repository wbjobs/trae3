package router

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"industrial-protocol-gateway/common"
	"industrial-protocol-gateway/config"
	"industrial-protocol-gateway/logger"
)

func SetupRouter() *gin.Engine {
	if config.Get().Server.Mode == "release" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()

	InitRateLimiter()

	r.Use(Recovery())
	r.Use(CORS())
	r.Use(RequestID())
	r.Use(Logger())
	r.Use(RateLimit())
	r.Use(gin.LoggerWithWriter(&logger.GinLogWriter{}))

	r.NoRoute(func(c *gin.Context) {
		traceID := GetTraceID(c)
		c.JSON(http.StatusNotFound, common.ErrorResponse(common.ErrNotFound, traceID, 0))
	})

	r.NoMethod(func(c *gin.Context) {
		traceID := GetTraceID(c)
		c.JSON(http.StatusMethodNotAllowed, common.ErrorResponseWithCode(
			common.CodeInvalidParameter, "method not allowed", traceID, 0,
		))
	})

	apiV1 := r.Group("/api/v1")
	{
		SetupAuthRoutes(apiV1)
		SetupProtocolRoutes(apiV1)
		SetupDataRoutes(apiV1)
		SetupClusterRoutes(apiV1)
		SetupSystemRoutes(apiV1)
	}

	r.GET("/", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"name":      "Industrial Protocol Gateway",
			"version":   "1.0.0",
			"status":    "running",
			"timestamp": time.Now().Format(time.RFC3339),
		})
	})

	return r
}
