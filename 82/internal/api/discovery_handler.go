package api

import (
	"edge-platform/internal/discovery"
	"edge-platform/internal/model"
	"strconv"

	"github.com/gin-gonic/gin"
)

type DiscoveryHandler struct {
	svc *discovery.Service
}

func NewDiscoveryHandler(svc *discovery.Service) *DiscoveryHandler {
	return &DiscoveryHandler{svc: svc}
}

func (h *DiscoveryHandler) ListNodes(c *gin.Context) {
	clusterID := c.Query("cluster_id")
	status := c.Query("status")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	nodes, total, err := h.svc.ListNodes(clusterID, status, page, pageSize)
	if err != nil {
		InternalError(c, err.Error())
		return
	}
	SuccessWithPage(c, nodes, total, page, pageSize)
}

func (h *DiscoveryHandler) GetNode(c *gin.Context) {
	nodeID := c.Param("id")
	node, err := h.svc.GetNode(nodeID)
	if err != nil {
		NotFound(c, "node not found")
		return
	}
	Success(c, node)
}

func (h *DiscoveryHandler) RegisterNode(c *gin.Context) {
	var req model.Node
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, err.Error())
		return
	}
	if err := h.svc.RegisterNode(&req); err != nil {
		InternalError(c, err.Error())
		return
	}
	Success(c, req)
}

func (h *DiscoveryHandler) DeregisterNode(c *gin.Context) {
	nodeID := c.Param("id")
	if err := h.svc.DeregisterNode(nodeID); err != nil {
		InternalError(c, err.Error())
		return
	}
	Success(c, nil)
}

func (h *DiscoveryHandler) ProbeNode(c *gin.Context) {
	nodeID := c.Param("id")
	node, err := h.svc.ProbeNode(nodeID)
	if err != nil {
		NotFound(c, "node not found")
		return
	}
	Success(c, node)
}

func (h *DiscoveryHandler) ProbeCluster(c *gin.Context) {
	clusterID := c.Param("cluster_id")
	nodes, err := h.svc.ProbeCluster(clusterID)
	if err != nil {
		InternalError(c, err.Error())
		return
	}
	Success(c, nodes)
}

func (h *DiscoveryHandler) SyncCluster(c *gin.Context) {
	clusterID := c.Param("cluster_id")
	address := c.Query("address")
	count, err := h.svc.SyncClusterNodes(clusterID, address)
	if err != nil {
		InternalError(c, err.Error())
		return
	}
	Success(c, gin.H{"synced_nodes": count})
}
