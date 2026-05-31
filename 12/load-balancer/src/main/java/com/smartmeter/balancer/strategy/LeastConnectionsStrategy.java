package com.smartmeter.balancer.strategy;

import com.smartmeter.balancer.model.LoadBalancerNode;
import com.smartmeter.common.constant.ProtocolConstants;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Component
public class LeastConnectionsStrategy implements LoadBalancerStrategy {

    @Override
    public String getStrategyName() {
        return ProtocolConstants.LOAD_BALANCER_STRATEGY_LEAST_CONN;
    }

    @Override
    public LoadBalancerNode select(List<LoadBalancerNode> nodes, String protocolType) {
        if (nodes == null || nodes.isEmpty()) {
            throw new IllegalStateException("No available server nodes");
        }

        List<LoadBalancerNode> protocolSpecificNodes = nodes.stream()
                .filter(node -> node.isHealthy())
                .filter(node -> protocolType != null 
                        && node.getProtocolType() != null 
                        && node.getProtocolType().equals(protocolType))
                .collect(Collectors.toList());

        List<LoadBalancerNode> filteredNodes;
        if (!protocolSpecificNodes.isEmpty()) {
            filteredNodes = protocolSpecificNodes;
            log.debug("Using protocol-specific nodes for {}: {}", protocolType, protocolSpecificNodes.size());
        } else {
            filteredNodes = nodes.stream()
                    .filter(node -> node.isHealthy())
                    .filter(node -> node.getProtocolType() == null)
                    .collect(Collectors.toList());
            
            if (filteredNodes.isEmpty()) {
                filteredNodes = nodes.stream()
                        .filter(LoadBalancerNode::isHealthy)
                        .collect(Collectors.toList());
            }
        }

        if (filteredNodes.isEmpty()) {
            throw new IllegalStateException("No healthy server nodes available for protocol: " + protocolType);
        }

        LoadBalancerNode selected = filteredNodes.stream()
                .min(Comparator.comparingDouble(this::calculateLoadScore))
                .orElse(filteredNodes.get(0));

        log.debug("WeightedLeastConnections selected node: {}:{}, score: {}, activeConnections: {}, weight: {}",
                selected.getHost(), selected.getPort(), 
                String.format("%.2f", calculateLoadScore(selected)),
                selected.getActiveConnections(), selected.getWeight());
        return selected;
    }

    private double calculateLoadScore(LoadBalancerNode node) {
        int weight = Math.max(node.getWeight(), 1);
        int activeConnections = node.getActiveConnections();
        return (double) (activeConnections + 1) / weight;
    }
}
