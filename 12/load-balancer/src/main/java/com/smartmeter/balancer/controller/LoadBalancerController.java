package com.smartmeter.balancer.controller;

import com.smartmeter.balancer.model.LoadBalancerNode;
import com.smartmeter.balancer.service.LoadBalancerService;
import com.smartmeter.common.model.ServerNode;
import com.smartmeter.common.result.Result;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@RestController
@RequestMapping("/api/loadbalancer")
public class LoadBalancerController {

    @Autowired
    private LoadBalancerService loadBalancerService;

    @GetMapping("/select")
    public Result<ServerNode> selectNode(
            @RequestParam(required = false) String protocolType,
            @RequestParam(required = false) String strategy) {
        try {
            log.info("Select node request, protocolType: {}, strategy: {}", protocolType, strategy);
            ServerNode node = loadBalancerService.selectNode(protocolType, strategy);
            return Result.success(node);
        } catch (Exception e) {
            log.error("Select node failed: {}", e.getMessage(), e);
            return Result.fail("Select node failed: " + e.getMessage());
        }
    }

    @PostMapping("/release")
    public Result<Void> releaseConnection(@RequestBody ServerNode node) {
        try {
            loadBalancerService.releaseConnection(node);
            return Result.success();
        } catch (Exception e) {
            log.error("Release connection failed: {}", e.getMessage(), e);
            return Result.fail("Release connection failed: " + e.getMessage());
        }
    }

    @GetMapping("/nodes")
    public Result<List<ServerNode>> getAllNodes() {
        try {
            List<LoadBalancerNode> nodes = loadBalancerService.getAllNodes();
            List<ServerNode> result = nodes.stream()
                    .map(this::toCommonNode)
                    .collect(Collectors.toList());
            return Result.success(result);
        } catch (Exception e) {
            log.error("Get all nodes failed: {}", e.getMessage(), e);
            return Result.fail("Get all nodes failed: " + e.getMessage());
        }
    }

    @GetMapping("/nodes/healthy")
    public Result<List<ServerNode>> getHealthyNodes() {
        try {
            List<LoadBalancerNode> nodes = loadBalancerService.getHealthyNodes();
            List<ServerNode> result = nodes.stream()
                    .map(this::toCommonNode)
                    .collect(Collectors.toList());
            return Result.success(result);
        } catch (Exception e) {
            log.error("Get healthy nodes failed: {}", e.getMessage(), e);
            return Result.fail("Get healthy nodes failed: " + e.getMessage());
        }
    }

    private ServerNode toCommonNode(LoadBalancerNode lbNode) {
        return new ServerNode(
                lbNode.getServiceId(),
                lbNode.getHost(),
                lbNode.getPort(),
                lbNode.getUrl(),
                lbNode.getWeight(),
                lbNode.getLastHealthCheckTime(),
                lbNode.isHealthy(),
                lbNode.getProtocolType()
        );
    }

    @GetMapping("/stats")
    public Result<Map<String, Object>> getStats() {
        try {
            Map<String, Object> stats = loadBalancerService.getLoadBalancerStats();
            return Result.success(stats);
        } catch (Exception e) {
            log.error("Get stats failed: {}", e.getMessage(), e);
            return Result.fail("Get stats failed: " + e.getMessage());
        }
    }

    @PostMapping("/refresh")
    public Result<Void> refreshNodes() {
        try {
            loadBalancerService.refreshNodes();
            return Result.success();
        } catch (Exception e) {
            log.error("Refresh nodes failed: {}", e.getMessage(), e);
            return Result.fail("Refresh nodes failed: " + e.getMessage());
        }
    }
}
