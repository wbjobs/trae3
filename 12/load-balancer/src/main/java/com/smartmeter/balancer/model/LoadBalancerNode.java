package com.smartmeter.balancer.model;

import com.smartmeter.common.model.ServerNode;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.concurrent.atomic.AtomicInteger;

@Data
@EqualsAndHashCode(callSuper = true)
public class LoadBalancerNode extends ServerNode {

    private static final long serialVersionUID = 1L;

    private transient AtomicInteger activeConnections;

    public LoadBalancerNode() {
        super();
        this.activeConnections = new AtomicInteger(0);
    }

    public LoadBalancerNode(String serviceId, String host, int port, int weight, String protocolType) {
        super(serviceId, host, port, weight, protocolType);
        this.activeConnections = new AtomicInteger(0);
    }

    public static LoadBalancerNode from(ServerNode node) {
        LoadBalancerNode lbNode = new LoadBalancerNode(
                node.getServiceId(), node.getHost(), node.getPort(),
                node.getWeight(), node.getProtocolType());
        lbNode.setLastHealthCheckTime(node.getLastHealthCheckTime());
        lbNode.setHealthy(node.isHealthy());
        return lbNode;
    }

    public int incrementConnections() {
        return activeConnections.incrementAndGet();
    }

    public int decrementConnections() {
        return activeConnections.decrementAndGet();
    }

    public int getActiveConnections() {
        return activeConnections.get();
    }
}
