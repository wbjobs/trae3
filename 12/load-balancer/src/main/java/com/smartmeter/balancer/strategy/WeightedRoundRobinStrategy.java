package com.smartmeter.balancer.strategy;

import com.smartmeter.balancer.model.LoadBalancerNode;
import com.smartmeter.common.constant.ProtocolConstants;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

@Slf4j
@Component
public class WeightedRoundRobinStrategy implements LoadBalancerStrategy {

    private final AtomicInteger counter = new AtomicInteger(0);

    @Override
    public String getStrategyName() {
        return ProtocolConstants.LOAD_BALANCER_STRATEGY_WEIGHTED;
    }

    @Override
    public LoadBalancerNode select(List<LoadBalancerNode> nodes, String protocolType) {
        if (nodes == null || nodes.isEmpty()) {
            throw new IllegalStateException("No available server nodes");
        }

        List<LoadBalancerNode> filteredNodes = nodes.stream()
                .filter(node -> node.isHealthy())
                .filter(node -> protocolType == null || node.getProtocolType() == null
                        || node.getProtocolType().equals(protocolType))
                .collect(Collectors.toList());

        if (filteredNodes.isEmpty()) {
            throw new IllegalStateException("No healthy server nodes available for protocol: " + protocolType);
        }

        int totalWeight = filteredNodes.stream()
                .mapToInt(LoadBalancerNode::getWeight)
                .sum();

        int current = counter.getAndIncrement() % totalWeight;
        if (counter.get() > Integer.MAX_VALUE - 1000) {
            counter.set(0);
        }

        LoadBalancerNode selected = null;
        int weightSum = 0;
        for (LoadBalancerNode node : filteredNodes) {
            weightSum += node.getWeight();
            if (current < weightSum) {
                selected = node;
                break;
            }
        }

        if (selected == null) {
            selected = filteredNodes.get(0);
        }

        log.debug("WeightedRoundRobin selected node: {}:{}, weight: {}, current: {}, totalWeight: {}",
                selected.getHost(), selected.getPort(), selected.getWeight(), current, totalWeight);
        return selected;
    }
}
