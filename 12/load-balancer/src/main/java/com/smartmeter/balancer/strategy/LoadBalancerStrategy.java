package com.smartmeter.balancer.strategy;

import com.smartmeter.balancer.model.LoadBalancerNode;
import java.util.List;

public interface LoadBalancerStrategy {

    String getStrategyName();

    LoadBalancerNode select(List<LoadBalancerNode> nodes, String protocolType);
}
