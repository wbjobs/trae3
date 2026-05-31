package api

import (
	"edge-platform/internal/model"
	"edge-platform/internal/router"

	"github.com/gin-gonic/gin"
)

type RouterHandler struct {
	svc *router.Service
}

func NewRouterHandler(svc *router.Service) *RouterHandler {
	return &RouterHandler{svc: svc}
}

func (h *RouterHandler) ListRules(c *gin.Context) {
	clusterID := c.Query("cluster_id")
	rules, err := h.svc.ListRules(clusterID)
	if err != nil {
		InternalError(c, err.Error())
		return
	}
	Success(c, rules)
}

func (h *RouterHandler) CreateRule(c *gin.Context) {
	var req model.RouteRule
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, err.Error())
		return
	}
	if err := h.svc.CreateRule(&req); err != nil {
		InternalError(c, err.Error())
		return
	}
	Success(c, req)
}

func (h *RouterHandler) UpdateRule(c *gin.Context) {
	ruleID := c.Param("id")
	var req model.RouteRule
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, err.Error())
		return
	}
	req.ID = ruleID
	if err := h.svc.UpdateRule(&req); err != nil {
		if err == router.ErrRuleVersionMismatch {
			Error(c, 409, err.Error())
		} else {
			InternalError(c, err.Error())
		}
		return
	}
	Success(c, req)
}

func (h *RouterHandler) DeleteRule(c *gin.Context) {
	ruleID := c.Param("id")
	if err := h.svc.DeleteRule(ruleID); err != nil {
		InternalError(c, err.Error())
		return
	}
	Success(c, nil)
}

func (h *RouterHandler) SelectNode(c *gin.Context) {
	clusterID := c.Param("cluster_id")
	strategy := c.DefaultQuery("strategy", "round_robin")
	node, err := h.svc.SelectNode(clusterID, strategy)
	if err != nil {
		if err == router.ErrNoNodesAvailable {
			Error(c, 503, err.Error())
		} else {
			InternalError(c, err.Error())
		}
		return
	}
	Success(c, node)
}

func (h *RouterHandler) RouteTask(c *gin.Context) {
	var req model.Task
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, err.Error())
		return
	}
	node, err := h.svc.RouteTask(&req)
	if err != nil {
		if err == router.ErrNoNodesAvailable {
			Error(c, 503, err.Error())
		} else {
			InternalError(c, err.Error())
		}
		return
	}
	Success(c, node)
}
