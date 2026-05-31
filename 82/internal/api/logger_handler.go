package api

import (
	"edge-platform/internal/logger"
	"edge-platform/internal/model"

	"github.com/gin-gonic/gin"
)

type LoggerHandler struct {
	svc *logger.Service
}

func NewLoggerHandler(svc *logger.Service) *LoggerHandler {
	return &LoggerHandler{svc: svc}
}

func (h *LoggerHandler) WriteLog(c *gin.Context) {
	var req model.RuntimeLog
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, err.Error())
		return
	}
	if err := h.svc.WriteLog(&req); err != nil {
		InternalError(c, err.Error())
		return
	}
	Success(c, req)
}

func (h *LoggerHandler) WriteLogsBatch(c *gin.Context) {
	var req struct {
		Logs []model.RuntimeLog `json:"logs"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, err.Error())
		return
	}
	if len(req.Logs) == 0 {
		BadRequest(c, "empty logs")
		return
	}
	if len(req.Logs) > 1000 {
		BadRequest(c, "logs exceed maximum batch size (1000)")
		return
	}
	if err := h.svc.WriteLogsBatch(req.Logs); err != nil {
		InternalError(c, err.Error())
		return
	}
	Success(c, gin.H{"written": len(req.Logs)})
}

func (h *LoggerHandler) CleanupLogs(c *gin.Context) {
	var req struct {
		RetentionDays int `json:"retention_days"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		req.RetentionDays = 30
	}
	deleted, err := h.svc.CleanupOldLogs(req.RetentionDays)
	if err != nil {
		InternalError(c, err.Error())
		return
	}
	Success(c, gin.H{"deleted_logs": deleted})
}

func (h *LoggerHandler) QueryLogs(c *gin.Context) {
	var params logger.LogQueryParams
	if err := c.ShouldBindQuery(&params); err != nil {
		BadRequest(c, err.Error())
		return
	}
	if params.Page < 1 {
		params.Page = 1
	}
	if params.PageSize < 1 || params.PageSize > 100 {
		params.PageSize = 20
	}
	logs, total, err := h.svc.QueryLogs(params)
	if err != nil {
		InternalError(c, err.Error())
		return
	}
	SuccessWithPage(c, logs, total, params.Page, params.PageSize)
}

func (h *LoggerHandler) GetTaskStats(c *gin.Context) {
	clusterID := c.Query("cluster_id")
	statDate := c.Query("stat_date")
	stats, err := h.svc.GetTaskStats(clusterID, statDate)
	if err != nil {
		InternalError(c, err.Error())
		return
	}
	Success(c, stats)
}

func (h *LoggerHandler) GetNodeStats(c *gin.Context) {
	nodeID := c.Query("node_id")
	statDate := c.Query("stat_date")
	stats, err := h.svc.GetNodeStats(nodeID, statDate)
	if err != nil {
		InternalError(c, err.Error())
		return
	}
	Success(c, stats)
}

func (h *LoggerHandler) AggregateTaskStats(c *gin.Context) {
	clusterID := c.Param("cluster_id")
	stat, err := h.svc.AggregateTaskStats(clusterID)
	if err != nil {
		InternalError(c, err.Error())
		return
	}
	Success(c, stat)
}

func (h *LoggerHandler) AggregateNodeStats(c *gin.Context) {
	nodeID := c.Param("node_id")
	stat, err := h.svc.AggregateNodeStats(nodeID)
	if err != nil {
		InternalError(c, err.Error())
		return
	}
	Success(c, stat)
}

func (h *LoggerHandler) Dashboard(c *gin.Context) {
	clusterID := c.Query("cluster_id")
	taskStat, err := h.svc.AggregateTaskStats(clusterID)
	if err != nil {
		InternalError(c, err.Error())
		return
	}

	var nodeCount, onlineCount int64
	db := h.svc.GetConfigDB()
	q := db.Model(&model.Node{})
	if clusterID != "" {
		q = q.Where("cluster_id = ?", clusterID)
	}
	q.Count(&nodeCount)
	db.Model(&model.Node{}).Where("cluster_id = ? AND status = ?", clusterID, "online").Count(&onlineCount)

	Success(c, gin.H{
		"task_stats": taskStat,
		"node_total": nodeCount,
		"node_online": onlineCount,
	})
}
