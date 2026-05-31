package api

import (
	"edge-platform/internal/model"
	"edge-platform/internal/scheduler"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

type SchedulerHandler struct {
	svc *scheduler.Service
}

func NewSchedulerHandler(svc *scheduler.Service) *SchedulerHandler {
	return &SchedulerHandler{svc: svc}
}

func (h *SchedulerHandler) CreateTask(c *gin.Context) {
	var req model.Task
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, err.Error())
		return
	}
	if err := h.svc.CreateTask(&req); err != nil {
		InternalError(c, err.Error())
		return
	}
	Success(c, req)
}

func (h *SchedulerHandler) GetTask(c *gin.Context) {
	taskID := c.Param("id")
	task, err := h.svc.GetTask(taskID)
	if err != nil {
		NotFound(c, "task not found")
		return
	}
	Success(c, task)
}

func (h *SchedulerHandler) ListTasks(c *gin.Context) {
	clusterID := c.Query("cluster_id")
	status := c.Query("status")
	priority, _ := strconv.Atoi(c.DefaultQuery("priority", "0"))
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	tasks, total, err := h.svc.ListTasks(clusterID, status, priority, page, pageSize)
	if err != nil {
		InternalError(c, err.Error())
		return
	}
	SuccessWithPage(c, tasks, total, page, pageSize)
}

func (h *SchedulerHandler) DispatchTask(c *gin.Context) {
	taskID := c.Param("id")
	task, err := h.svc.DispatchTask(taskID)
	if err != nil {
		if err == scheduler.ErrTaskNotPending {
			BadRequest(c, err.Error())
		} else if err == scheduler.ErrNoAvailableNodes {
			Error(c, 503, err.Error())
		} else {
			InternalError(c, err.Error())
		}
		return
	}
	Success(c, task)
}

func (h *SchedulerHandler) CompleteTask(c *gin.Context) {
	taskID := c.Param("id")
	var req struct {
		Result string `json:"result"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, err.Error())
		return
	}
	task, err := h.svc.CompleteTask(taskID, req.Result)
	if err != nil {
		InternalError(c, err.Error())
		return
	}
	Success(c, task)
}

func (h *SchedulerHandler) FailTask(c *gin.Context) {
	taskID := c.Param("id")
	var req struct {
		Reason string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, err.Error())
		return
	}
	task, err := h.svc.FailTask(taskID, req.Reason)
	if err != nil {
		InternalError(c, err.Error())
		return
	}
	Success(c, task)
}

func (h *SchedulerHandler) CancelTask(c *gin.Context) {
	taskID := c.Param("id")
	if err := h.svc.CancelTask(taskID); err != nil {
		InternalError(c, err.Error())
		return
	}
	Success(c, nil)
}

func (h *SchedulerHandler) BatchDispatch(c *gin.Context) {
	clusterID := c.Param("cluster_id")
	count, err := h.svc.BatchDispatch(clusterID)
	if err != nil {
		InternalError(c, err.Error())
		return
	}
	Success(c, gin.H{"dispatched": count})
}

func (h *SchedulerHandler) RecoverStuckTasks(c *gin.Context) {
	var req struct {
		TimeoutMinutes int `json:"timeout_minutes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		req.TimeoutMinutes = 30
	}
	timeout := time.Duration(req.TimeoutMinutes) * time.Minute
	recovered, err := h.svc.RecoverStuckTasks(timeout)
	if err != nil {
		InternalError(c, err.Error())
		return
	}
	Success(c, gin.H{"recovered": recovered})
}

func (h *SchedulerHandler) MigrateNodeTasks(c *gin.Context) {
	nodeID := c.Param("node_id")
	migrated, err := h.svc.MigrateTasksFromNode(nodeID)
	if err != nil {
		InternalError(c, err.Error())
		return
	}
	Success(c, gin.H{"migrated": migrated, "node_id": nodeID})
}

func (h *SchedulerHandler) MigrateFaultyNodes(c *gin.Context) {
	migrated, err := h.svc.MigrateFaultyNodes()
	if err != nil {
		InternalError(c, err.Error())
		return
	}
	Success(c, gin.H{"migrated": migrated})
}

func (h *SchedulerHandler) DispatchByPriority(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	dispatched, err := h.svc.DispatchByPriority(limit)
	if err != nil {
		InternalError(c, err.Error())
		return
	}
	Success(c, gin.H{"dispatched": dispatched})
}

func (h *SchedulerHandler) SetStrategy(c *gin.Context) {
	var req struct {
		Strategy string `json:"strategy" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, err.Error())
		return
	}
	h.svc.SetStrategyByName(req.Strategy)
	Success(c, gin.H{"strategy": req.Strategy})
}
