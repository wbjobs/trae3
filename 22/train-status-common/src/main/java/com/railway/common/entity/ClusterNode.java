package com.railway.common.entity;

import java.io.Serializable;
import java.time.LocalDateTime;

public class ClusterNode implements Serializable {

    private static final long serialVersionUID = 1L;

    private String nodeId;

    private String host;

    private Integer port;

    private String nodeStatus;

    private LocalDateTime registerTime;

    private LocalDateTime lastHeartbeat;

    private Long handledMessageCount;

    private Double cpuUsage;

    private Double memoryUsage;

    public ClusterNode() {
    }

    public ClusterNode(String nodeId, String host, Integer port) {
        this.nodeId = nodeId;
        this.host = host;
        this.port = port;
        this.registerTime = LocalDateTime.now();
        this.lastHeartbeat = LocalDateTime.now();
        this.nodeStatus = "ONLINE";
        this.handledMessageCount = 0L;
    }

    public String getNodeId() {
        return nodeId;
    }

    public void setNodeId(String nodeId) {
        this.nodeId = nodeId;
    }

    public String getHost() {
        return host;
    }

    public void setHost(String host) {
        this.host = host;
    }

    public Integer getPort() {
        return port;
    }

    public void setPort(Integer port) {
        this.port = port;
    }

    public String getNodeStatus() {
        return nodeStatus;
    }

    public void setNodeStatus(String nodeStatus) {
        this.nodeStatus = nodeStatus;
    }

    public LocalDateTime getRegisterTime() {
        return registerTime;
    }

    public void setRegisterTime(LocalDateTime registerTime) {
        this.registerTime = registerTime;
    }

    public LocalDateTime getLastHeartbeat() {
        return lastHeartbeat;
    }

    public void setLastHeartbeat(LocalDateTime lastHeartbeat) {
        this.lastHeartbeat = lastHeartbeat;
    }

    public Long getHandledMessageCount() {
        return handledMessageCount;
    }

    public void setHandledMessageCount(Long handledMessageCount) {
        this.handledMessageCount = handledMessageCount;
    }

    public Double getCpuUsage() {
        return cpuUsage;
    }

    public void setCpuUsage(Double cpuUsage) {
        this.cpuUsage = cpuUsage;
    }

    public Double getMemoryUsage() {
        return memoryUsage;
    }

    public void setMemoryUsage(Double memoryUsage) {
        this.memoryUsage = memoryUsage;
    }
}
