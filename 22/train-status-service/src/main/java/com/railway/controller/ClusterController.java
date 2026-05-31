package com.railway.controller;

import com.railway.auth.annotation.RequireAuth;
import com.railway.cluster.service.ClusterSyncService;
import com.railway.common.dto.Result;
import com.railway.common.entity.ClusterNode;
import com.railway.filter.service.FilterService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import jakarta.annotation.Resource;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/cluster")
@RequireAuth
public class ClusterController {

    private static final Logger log = LoggerFactory.getLogger(ClusterController.class);

    @Resource
    private ClusterSyncService clusterSyncService;

    @Resource
    private FilterService filterService;

    @GetMapping("/nodes")
    public Result<List<ClusterNode>> getClusterNodes() {
        List<ClusterNode> nodes = clusterSyncService.getAllNodes();
        return Result.success(nodes);
    }

    @GetMapping("/node/current")
    public Result<ClusterNode> getCurrentNode() {
        ClusterNode node = clusterSyncService.getCurrentNode();
        return Result.success(node);
    }

    @GetMapping("/node/register")
    public Result<String> registerNode() {
        clusterSyncService.registerNode();
        return Result.success("Node registered successfully");
    }

    @GetMapping("/stats")
    public Result<Map<String, Object>> getClusterStats() {
        Map<String, Object> stats = new HashMap<>();

        List<ClusterNode> nodes = clusterSyncService.getAllNodes();
        int onlineCount = 0;
        int offlineCount = 0;
        long totalMessages = 0;

        for (ClusterNode node : nodes) {
            if ("ONLINE".equals(node.getNodeStatus())) {
                onlineCount++;
            } else {
                offlineCount++;
            }
            if (node.getHandledMessageCount() != null) {
                totalMessages += node.getHandledMessageCount();
            }
        }

        stats.put("totalNodes", nodes.size());
        stats.put("onlineNodes", onlineCount);
        stats.put("offlineNodes", offlineCount);
        stats.put("totalHandledMessages", totalMessages);
        stats.put("currentNode", clusterSyncService.getCurrentNode());
        stats.put("cachedTrainStatusCount", clusterSyncService.getAllTrainStatus().size());

        return Result.success(stats);
    }

    @GetMapping("/filters")
    public Result<List<String>> getFilters() {
        List<String> filters = filterService.getFilterNames();
        return Result.success(filters);
    }

    @GetMapping("/health")
    @RequireAuth(required = false)
    public Result<Map<String, Object>> healthCheck() {
        Map<String, Object> health = new HashMap<>();
        health.put("status", "UP");
        health.put("nodeId", clusterSyncService.getCurrentNode() != null
                ? clusterSyncService.getCurrentNode().getNodeId() : "unknown");
        health.put("timestamp", System.currentTimeMillis());
        return Result.success(health);
    }
}
