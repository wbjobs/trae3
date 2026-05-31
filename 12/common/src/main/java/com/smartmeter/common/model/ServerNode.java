package com.smartmeter.common.model;

import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

import java.io.Serializable;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ServerNode implements Serializable {

    private static final long serialVersionUID = 1L;

    private String serviceId;
    private String host;
    private int port;
    private String url;
    private int weight;
    private long lastHealthCheckTime;
    private boolean healthy;
    private String protocolType;

    public ServerNode(String serviceId, String host, int port, int weight, String protocolType) {
        this.serviceId = serviceId;
        this.host = host;
        this.port = port;
        this.url = "http://" + host + ":" + port;
        this.weight = weight;
        this.protocolType = protocolType;
        this.healthy = true;
        this.lastHealthCheckTime = System.currentTimeMillis();
    }

    public String getUrl() {
        if (url == null && host != null) {
            url = "http://" + host + ":" + port;
        }
        return url;
    }
}
