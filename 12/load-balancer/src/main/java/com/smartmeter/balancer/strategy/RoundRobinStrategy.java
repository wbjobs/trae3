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
public class RoundRobinStrategy implements LoadBalancerStrategy {

    private final AtomicInteger counter = new AtomicInteger(0);

    @Override
    public String getStrategyName() {
        return ProtocolConstants.LOAD_BALANCER_STRATEGY_ROUND_ROBIN;
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

        int index = counter.getAndIncrement() % filteredNodes.size();
        if (counter.get() > Integer.MAX_VALUE - 1000) {
            counter.set(0);
        }

        LoadBalancerNode selected = filteredNodes.get(index);
        log.debug("RoundRobin selected node: {}:{}, index: {}", selected.getHost(), selected.getPort(), index);
        return selected;
    }
}
