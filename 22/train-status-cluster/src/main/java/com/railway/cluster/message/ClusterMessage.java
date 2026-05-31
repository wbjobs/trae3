package com.railway.cluster.message;

import java.io.Serializable;
import java.time.LocalDateTime;

public class ClusterMessage implements Serializable {

    private static final long serialVersionUID = 1L;

    private String messageId;

    private String messageType;

    private String sourceNodeId;

    private String targetNodeId;

    private Object payload;

    private LocalDateTime timestamp;

    public ClusterMessage() {
        this.timestamp = LocalDateTime.now();
    }

    public ClusterMessage(String messageType, String sourceNodeId, Object payload) {
        this.messageType = messageType;
        this.sourceNodeId = sourceNodeId;
        this.payload = payload;
        this.timestamp = LocalDateTime.now();
    }

    public String getMessageId() {
        return messageId;
    }

    public void setMessageId(String messageId) {
        this.messageId = messageId;
    }

    public String getMessageType() {
        return messageType;
    }

    public void setMessageType(String messageType) {
        this.messageType = messageType;
    }

    public String getSourceNodeId() {
        return sourceNodeId;
    }

    public void setSourceNodeId(String sourceNodeId) {
        this.sourceNodeId = sourceNodeId;
    }

    public String getTargetNodeId() {
        return targetNodeId;
    }

    public void setTargetNodeId(String targetNodeId) {
        this.targetNodeId = targetNodeId;
    }

    public Object getPayload() {
        return payload;
    }

    public void setPayload(Object payload) {
        this.payload = payload;
    }

    public LocalDateTime getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(LocalDateTime timestamp) {
        this.timestamp = timestamp;
    }
}
