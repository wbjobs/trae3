package com.smartmeter.balancer.service;

import com.alibaba.cloud.nacos.NacosDiscoveryProperties;
import com.alibaba.nacos.api.naming.NamingService;
import com.alibaba.nacos.api.naming.pojo.Instance;
import com.smartmeter.balancer.model.LoadBalancerNode;
import com.smartmeter.balancer.strategy.LoadBalancerStrategy;
import com.smartmeter.common.constant.ProtocolConstants;
import com.smartmeter.common.model.ServerNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.client.discovery.DiscoveryClient;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.stream.Collectors;

@Slf4j
@Service
public class LoadBalancerService {

    private static final String NODE_CACHE_KEY = "lb:nodes:";

    private final Map<String, LoadBalancerStrategy> strategyMap = new ConcurrentHashMap<>();
    private final List<LoadBalancerNode> nodes = new CopyOnWriteArrayList<>();

    @Autowired
    private List<LoadBalancerStrategy> strategies;

    @Autowired
    private DiscoveryClient discoveryClient;

    @Autowired
    private RedisTemplate<String, Object> redisTemplate;

    @Value("${loadbalancer.default-strategy:round_robin}")
    private String defaultStrategy;

    @Value("${loadbalancer.service-names:protocol-parser-service,data-cache-service,data-forward-service}")
    private List<String> serviceNames;

    @PostConstruct
    public void init() {
        for (LoadBalancerStrategy strategy : strategies) {
            strategyMap.put(strategy.getStrategyName(), strategy);
        }
        log.info("LoadBalancer strategies registered: {}", strategyMap.keySet());
        refreshNodes();
    }

    @Scheduled(fixedDelayString = "${loadbalancer.refresh-interval:10000}")
    public void refreshNodes() {
        try {
            List<LoadBalancerNode> newNodes = new ArrayList<>();

            for (String serviceName : serviceNames) {
                List<LoadBalancerNode> serviceNodes = getNodesFromDiscovery(serviceName);
                newNodes.addAll(serviceNodes);
            }

            for (LoadBalancerNode newNode : newNodes) {
                boolean exists = nodes.stream()
                        .anyMatch(n -> n.getUrl().equals(newNode.getUrl()));
                if (!exists) {
                    nodes.add(newNode);
                    log.info("Added new node: {}:{} ({})", newNode.getHost(), newNode.getPort(), newNode.getServiceId());
                }
            }

            nodes.removeIf(node -> newNodes.stream()
                    .noneMatch(n -> n.getUrl().equals(node.getUrl())));

            cacheNodesToRedis();
            log.debug("Nodes refreshed, total: {}", nodes.size());

        } catch (Exception e) {
            log.error("Refresh nodes failed: {}", e.getMessage(), e);
        }
    }

    @Scheduled(fixedDelayString = "${loadbalancer.health-check-interval:5000}")
    public void healthCheck() {
        for (LoadBalancerNode node : nodes) {
            boolean healthy = checkNodeHealth(node);
            node.setHealthy(healthy);
            node.setLastHealthCheckTime(System.currentTimeMillis());
            if (!healthy) {
                log.warn("Node health check failed: {}:{}", node.getHost(), node.getPort());
            }
        }
        cacheNodesToRedis();
    }

    public ServerNode selectNode(String protocolType) {
        return selectNode(protocolType, defaultStrategy);
    }

    public ServerNode selectNode(String protocolType, String strategyName) {
        LoadBalancerStrategy strategy = strategyMap.get(strategyName);
        if (strategy == null) {
            log.warn("Strategy {} not found, using default: {}", strategyName, defaultStrategy);
            strategy = strategyMap.get(defaultStrategy);
        }

        if (strategy == null) {
            throw new IllegalStateException("No load balancer strategy available");
        }

        List<LoadBalancerNode> candidateNodes = getCandidateNodes(protocolType);
        
        if (candidateNodes.isEmpty()) {
            throw new IllegalStateException("No healthy server nodes available for protocol: " + protocolType);
        }

        LoadBalancerNode node = strategy.select(candidateNodes, protocolType);
        if (node != null) {
            node.incrementConnections();
            log.info("Selected node: {}:{}, protocol: {}, strategy: {}, active: {}",
                    node.getHost(), node.getPort(), protocolType, strategyName, node.getActiveConnections());
        }
        return node;
    }

    private List<LoadBalancerNode> getCandidateNodes(String protocolType) {
        List<LoadBalancerNode> healthyNodes = getHealthyNodes();
        
        if (protocolType == null || protocolType.isEmpty()) {
            return healthyNodes;
        }

        List<LoadBalancerNode> protocolSpecificNodes = healthyNodes.stream()
                .filter(node -> protocolType.equals(node.getProtocolType()))
                .collect(Collectors.toList());

        if (!protocolSpecificNodes.isEmpty()) {
            log.debug("Found {} protocol-specific nodes for {}", protocolSpecificNodes.size(), protocolType);
            return protocolSpecificNodes;
        }

        List<LoadBalancerNode> genericNodes = healthyNodes.stream()
                .filter(node -> node.getProtocolType() == null || node.getProtocolType().isEmpty())
                .collect(Collectors.toList());

        if (!genericNodes.isEmpty()) {
            log.debug("No protocol-specific nodes for {}, using {} generic nodes", protocolType, genericNodes.size());
            return genericNodes;
        }

        log.warn("No protocol-specific or generic nodes for {}, using all {} healthy nodes", protocolType, healthyNodes.size());
        return healthyNodes;
    }

    public void releaseConnection(ServerNode node) {
        if (node != null) {
            for (LoadBalancerNode lbNode : nodes) {
                if (lbNode.getUrl().equals(node.getUrl())) {
                    lbNode.decrementConnections();
                    return;
                }
            }
        }
    }

    public List<LoadBalancerNode> getAllNodes() {
        return new ArrayList<>(nodes);
    }

    public List<LoadBalancerNode> getHealthyNodes() {
        List<LoadBalancerNode> healthyNodes = new ArrayList<>();
        for (LoadBalancerNode node : nodes) {
            if (node.isHealthy()) {
                healthyNodes.add(node);
            }
        }
        return healthyNodes;
    }

    public Map<String, Object> getLoadBalancerStats() {
        Map<String, Object> stats = new HashMap<>();
        stats.put("totalNodes", nodes.size());
        stats.put("healthyNodes", getHealthyNodes().size());
        stats.put("defaultStrategy", defaultStrategy);
        stats.put("availableStrategies", strategyMap.keySet());

        List<Map<String, Object>> nodeStats = new ArrayList<>();
        for (LoadBalancerNode node : nodes) {
            Map<String, Object> nodeStat = new HashMap<>();
            nodeStat.put("serviceId", node.getServiceId());
            nodeStat.put("host", node.getHost());
            nodeStat.put("port", node.getPort());
            nodeStat.put("weight", node.getWeight());
            nodeStat.put("activeConnections", node.getActiveConnections());
            nodeStat.put("healthy", node.isHealthy());
            nodeStat.put("protocolType", node.getProtocolType());
            nodeStats.add(nodeStat);
        }
        stats.put("nodes", nodeStats);

        return stats;
    }

    private List<LoadBalancerNode> getNodesFromDiscovery(String serviceName) {
        List<LoadBalancerNode> result = new ArrayList<>();
        try {
            List<org.springframework.cloud.client.ServiceInstance> instances =
                    discoveryClient.getInstances(serviceName);

            for (org.springframework.cloud.client.ServiceInstance instance : instances) {
                int weight = 1;
                String protocolType = null;
                Map<String, String> metadata = instance.getMetadata();
                if (metadata != null) {
                    if (metadata.containsKey("weight")) {
                        weight = Integer.parseInt(metadata.get("weight"));
                    }
                    if (metadata.containsKey("protocol")) {
                        protocolType = metadata.get("protocol");
                    }
                }

                LoadBalancerNode node = new LoadBalancerNode(
                        serviceName,
                        instance.getHost(),
                        instance.getPort(),
                        weight,
                        protocolType
                );
                result.add(node);
            }
        } catch (Exception e) {
            log.warn("Get nodes from discovery failed for service {}: {}", serviceName, e.getMessage());
        }
        return result;
    }

    private boolean checkNodeHealth(ServerNode node) {
        try {
            String healthUrl = node.getUrl() + "/actuator/health";
            java.net.URL url = new java.net.URL(healthUrl);
            java.net.HttpURLConnection conn = (java.net.HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(2000);
            conn.setReadTimeout(2000);
            conn.setRequestMethod("GET");
            int responseCode = conn.getResponseCode();
            conn.disconnect();
            return responseCode == 200;
        } catch (Exception e) {
            return false;
        }
    }

    private void cacheNodesToRedis() {
        try {
            String key = NODE_CACHE_KEY + "all";
            List<ServerNode> commonNodes = nodes.stream()
                    .map(this::toCommonNode)
                    .collect(Collectors.toList());
            redisTemplate.opsForValue().set(key, commonNodes, 30, java.util.concurrent.TimeUnit.SECONDS);
        } catch (Exception e) {
            log.warn("Cache nodes to redis failed: {}", e.getMessage());
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
}
