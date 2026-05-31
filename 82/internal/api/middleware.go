package api

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

func TimeoutMiddleware(timeout time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), timeout)
		defer cancel()

		c.Request = c.Request.WithContext(ctx)

		done := make(chan struct{}, 1)
		go func() {
			defer func() {
				if r := recover(); r != nil {
					_ = r
				}
			}()
			c.Next()
			done <- struct{}{}
		}()

		select {
		case <-done:
			return
		case <-ctx.Done():
			c.AbortWithStatusJSON(http.StatusGatewayTimeout, Response{
				Code:    -2,
				Message: "request timeout",
			})
			return
		}
	}
}

func HealthCheck(dbPinger func() error) gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.Request.URL.Path
		if path == "/health" || path == "/healthz" {
			if err := dbPinger(); err != nil {
				c.AbortWithStatusJSON(http.StatusServiceUnavailable, Response{
					Code:    -1,
					Message: "service unhealthy: " + err.Error(),
				})
				return
			}
		}
		c.Next()
	}
}
