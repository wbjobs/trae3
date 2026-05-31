package router

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"industrial-protocol-gateway/common"
	"industrial-protocol-gateway/storage"
)

type QueryRequest struct {
	Protocol  string    `json:"protocol" binding:"required"`
	DeviceID  string    `json:"device_id" binding:"required"`
	StartTime time.Time `json:"start_time" binding:"required"`
	EndTime   time.Time `json:"end_time" binding:"required"`
	Limit     int       `json:"limit"`
	Offset    int       `json:"offset"`
}

func QueryProtocolData(c *gin.Context) {
	start := time.Now()
	traceID := GetTraceID(c)

	protocol := c.Query("protocol")
	deviceID := c.Query("device_id")
	startTimeStr := c.Query("start_time")
	endTimeStr := c.Query("end_time")
	limitStr := c.Query("limit")

	if protocol == "" || deviceID == "" || startTimeStr == "" || endTimeStr == "" {
		elapsed := time.Since(start).Milliseconds()
		c.JSON(http.StatusBadRequest, common.ErrorResponse(common.ErrInvalidParameter, traceID, elapsed))
		return
	}

	startTime, err := time.Parse(time.RFC3339, startTimeStr)
	if err != nil {
		elapsed := time.Since(start).Milliseconds()
		c.JSON(http.StatusBadRequest, common.ErrorResponseWithCode(
			common.CodeInvalidParameter, "invalid start_time format, use RFC3339", traceID, elapsed,
		))
		return
	}

	endTime, err := time.Parse(time.RFC3339, endTimeStr)
	if err != nil {
		elapsed := time.Since(start).Milliseconds()
		c.JSON(http.StatusBadRequest, common.ErrorResponseWithCode(
			common.CodeInvalidParameter, "invalid end_time format, use RFC3339", traceID, elapsed,
		))
		return
	}

	limit := 100
	if limitStr != "" {
		limit, _ = strconv.Atoi(limitStr)
		if limit <= 0 || limit > 1000 {
			limit = 100
		}
	}

	data, err := storage.QueryProtocolData(c.Request.Context(), protocol, deviceID, startTime, endTime)
	if err != nil {
		elapsed := time.Since(start).Milliseconds()
		c.JSON(http.StatusInternalServerError, common.ErrorResponse(err, traceID, elapsed))
		return
	}

	if len(data) > limit {
		data = data[:limit]
	}

	elapsed := time.Since(start).Milliseconds()
	c.JSON(http.StatusOK, common.SuccessResponse(map[string]interface{}{
		"total": len(data),
		"items": data,
	}, traceID, elapsed))
}

func QueryRawPackets(c *gin.Context) {
	start := time.Now()
	traceID := GetTraceID(c)

	protocol := c.Query("protocol")
	deviceID := c.Query("device_id")
	startTimeStr := c.Query("start_time")
	endTimeStr := c.Query("end_time")
	limitStr := c.Query("limit")
	decompressStr := c.Query("decompress")

	if protocol == "" || deviceID == "" || startTimeStr == "" || endTimeStr == "" {
		elapsed := time.Since(start).Milliseconds()
		c.JSON(http.StatusBadRequest, common.ErrorResponse(common.ErrInvalidParameter, traceID, elapsed))
		return
	}

	startTime, err := time.Parse(time.RFC3339, startTimeStr)
	if err != nil {
		elapsed := time.Since(start).Milliseconds()
		c.JSON(http.StatusBadRequest, common.ErrorResponseWithCode(
			common.CodeInvalidParameter, "invalid start_time format, use RFC3339", traceID, elapsed,
		))
		return
	}

	endTime, err := time.Parse(time.RFC3339, endTimeStr)
	if err != nil {
		elapsed := time.Since(start).Milliseconds()
		c.JSON(http.StatusBadRequest, common.ErrorResponseWithCode(
			common.CodeInvalidParameter, "invalid end_time format, use RFC3339", traceID, elapsed,
		))
		return
	}

	limit := 100
	if limitStr != "" {
		limit, _ = strconv.Atoi(limitStr)
		if limit <= 0 || limit > 1000 {
			limit = 100
		}
	}

	decompress := false
	if decompressStr == "true" || decompressStr == "1" {
		decompress = true
	}

	data, err := storage.QueryRawPacketsWithOptions(
		c.Request.Context(), protocol, deviceID, startTime, endTime, limit, decompress,
	)
	if err != nil {
		elapsed := time.Since(start).Milliseconds()
		c.JSON(http.StatusInternalServerError, common.ErrorResponse(err, traceID, elapsed))
		return
	}

	elapsed := time.Since(start).Milliseconds()
	c.JSON(http.StatusOK, common.SuccessResponse(map[string]interface{}{
		"total":      len(data),
		"items":      data,
		"decompress": decompress,
	}, traceID, elapsed))
}

func QueryWithFlux(c *gin.Context) {
	start := time.Now()
	traceID := GetTraceID(c)

	var req struct {
		Query string `json:"query" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		elapsed := time.Since(start).Milliseconds()
		c.JSON(http.StatusBadRequest, common.ErrorResponse(common.ErrInvalidParameter, traceID, elapsed))
		return
	}

	points, err := storage.QueryData(c.Request.Context(), req.Query)
	if err != nil {
		elapsed := time.Since(start).Milliseconds()
		c.JSON(http.StatusInternalServerError, common.ErrorResponse(err, traceID, elapsed))
		return
	}

	elapsed := time.Since(start).Milliseconds()
	c.JSON(http.StatusOK, common.SuccessResponse(map[string]interface{}{
		"total":  len(points),
		"points": points,
	}, traceID, elapsed))
}

func SetupDataRoutes(r *gin.RouterGroup) {
	data := r.Group("/data", AuthRequired())
	{
		data.GET("/protocol", QueryProtocolData)
		data.GET("/raw", QueryRawPackets)
		data.POST("/query", RoleRequired("admin", "readwrite"), QueryWithFlux)
	}
}
