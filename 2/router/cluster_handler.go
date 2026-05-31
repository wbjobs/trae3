package router

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"industrial-protocol-gateway/cluster"
	"industrial-protocol-gateway/common"
)

func HandleClusterSync(c *gin.Context) {
	start := time.Now()
	traceID := GetTraceID(c)

	var cmd cluster.SyncCommand
	if err := c.ShouldBindJSON(&cmd); err != nil {
		elapsed := time.Since(start).Milliseconds()
		c.JSON(http.StatusBadRequest, common.ErrorResponse(common.ErrInvalidParameter, traceID, elapsed))
		return
	}

	if err := cluster.HandleSyncCommand(&cmd); err != nil {
		elapsed := time.Since(start).Milliseconds()
		c.JSON(http.StatusInternalServerError, common.ErrorResponse(err, traceID, elapsed))
		return
	}

	elapsed := time.Since(start).Milliseconds()
	c.JSON(http.StatusOK, common.SuccessResponse(map[string]interface{}{
		"status": "ok",
	}, traceID, elapsed))
}

func GetClusterStatus(c *gin.Context) {
	start := time.Now()
	traceID := GetTraceID(c)

	nodes := cluster.GetNodes()
	isLeader := cluster.IsLeader()

	elapsed := time.Since(start).Milliseconds()
	c.JSON(http.StatusOK, common.SuccessResponse(map[string]interface{}{
		"node_id":      cluster.GetManager().GetConfig().NodeID,
		"is_leader":    isLeader,
		"state":        cluster.GetManager().GetState(),
		"nodes_count":  len(nodes),
		"nodes":        nodes,
	}, traceID, elapsed))
}

func GetClusterNodes(c *gin.Context) {
	start := time.Now()
	traceID := GetTraceID(c)

	nodes := cluster.GetNodes()

	elapsed := time.Since(start).Milliseconds()
	c.JSON(http.StatusOK, common.SuccessResponse(map[string]interface{}{
		"total": len(nodes),
		"nodes": nodes,
	}, traceID, elapsed))
}

func SyncClusterCommand(c *gin.Context) {
	start := time.Now()
	traceID := GetTraceID(c)

	var cmd cluster.SyncCommand
	if err := c.ShouldBindJSON(&cmd); err != nil {
		elapsed := time.Since(start).Milliseconds()
		c.JSON(http.StatusBadRequest, common.ErrorResponse(common.ErrInvalidParameter, traceID, elapsed))
		return
	}

	if err := cluster.BroadcastCommand(&cmd); err != nil {
		elapsed := time.Since(start).Milliseconds()
		c.JSON(http.StatusInternalServerError, common.ErrorResponse(err, traceID, elapsed))
		return
	}

	elapsed := time.Since(start).Milliseconds()
	c.JSON(http.StatusOK, common.SuccessResponse(map[string]interface{}{
		"command_id": cmd.ID,
		"status":     "synced",
	}, traceID, elapsed))
}

func SetupClusterRoutes(r *gin.RouterGroup) {
	clusterGroup := r.Group("/cluster")
	{
		clusterGroup.POST("/sync", HandleClusterSync)

		authCluster := clusterGroup.Group("", AuthRequired())
		{
			authCluster.GET("/status", GetClusterStatus)
			authCluster.GET("/nodes", GetClusterNodes)
			authCluster.POST("/command", RoleRequired("admin"), SyncClusterCommand)
		}
	}
}
