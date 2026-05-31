package com.smartmeter.gateway.feign;

import com.smartmeter.common.model.ServerNode;
import com.smartmeter.common.result.Result;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@FeignClient(name = "load-balancer-service")
public interface LoadBalancerClient {

    @GetMapping("/api/loadbalancer/select")
    Result<ServerNode> selectNode(
            @RequestParam(value = "protocolType", required = false) String protocolType,
            @RequestParam(value = "strategy", required = false) String strategy);

    @GetMapping("/api/loadbalancer/stats")
    Result<Map<String, Object>> getStats();

    @GetMapping("/api/loadbalancer/nodes")
    Result<List<ServerNode>> getAllNodes();
}
