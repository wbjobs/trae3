package com.railway.cluster.listener;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.TypeReference;
import com.railway.cluster.message.ClusterMessage;
import com.railway.common.constant.RedisConstants;
import com.railway.common.entity.ClusterNode;
import com.railway.common.entity.TrainStatus;
import com.railway.common.util.IdGeneratorUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;

import jakarta.annotation.Resource;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class ClusterMessageListener implements MessageListener {

    private static final Logger log = LoggerFactory.getLogger(ClusterMessageListener.class);

    private final String currentNodeId = IdGeneratorUtil.generateNodeId();

    @Resource
    private RedisTemplate<String, Object> redisTemplate;

    private final Map<String, ClusterNode> clusterNodes = new ConcurrentHashMap<>();

    private final Map<String, TrainStatus> trainStatusCache = new ConcurrentHashMap<>();

    @Override
    public void onMessage(Message message, byte[] pattern) {
        try {
            String channel = new String(message.getChannel(), StandardCharsets.UTF_8);
            String body = new String(message.getBody(), StandardCharsets.UTF_8);

            log.debug("Received cluster message, channel: {}, body: {}", channel, body);

            ClusterMessage clusterMessage = JSON.parseObject(body, new TypeReference<ClusterMessage>() {});

            if (clusterMessage.getSourceNodeId() != null
                    && clusterMessage.getSourceNodeId().equals(currentNodeId)) {
                return;
            }

            handleClusterMessage(clusterMessage);

        } catch (Exception e) {
            log.error("Handle cluster message failed", e);
        }
    }

    private void handleClusterMessage(ClusterMessage message) {
        String messageType = message.getMessageType();

        switch (messageType) {
            case "NODE_HEARTBEAT":
                handleNodeHeartbeat(message);
                break;
            case "NODE_REGISTER":
                handleNodeRegister(message);
                break;
            case "NODE_OFFLINE":
                handleNodeOffline(message);
                break;
            case "TRAIN_STATUS_SYNC":
                handleTrainStatusSync(message);
                break;
            case "TRAIN_STATUS_INVALIDATE":
                handleTrainStatusInvalidate(message);
                break;
            default:
                log.warn("Unknown cluster message type: {}", messageType);
        }
    }

    private void handleNodeHeartbeat(ClusterMessage message) {
        ClusterNode node = JSON.parseObject(JSON.toJSONString(message.getPayload()),
                new TypeReference<ClusterNode>() {});
        if (node != null) {
            node.setLastHeartbeat(LocalDateTime.now());
            clusterNodes.put(node.getNodeId(), node);
            log.debug("Updated node heartbeat: {}", node.getNodeId());
        }
    }

    private void handleNodeRegister(ClusterMessage message) {
        ClusterNode node = JSON.parseObject(JSON.toJSONString(message.getPayload()),
                new TypeReference<ClusterNode>() {});
        if (node != null) {
            clusterNodes.put(node.getNodeId(), node);
            log.info("Node registered: {}", node.getNodeId());
        }
    }

    private void handleNodeOffline(ClusterMessage message) {
        String nodeId = (String) message.getPayload();
        if (nodeId != null) {
            ClusterNode node = clusterNodes.get(nodeId);
            if (node != null) {
                node.setNodeStatus("OFFLINE");
                clusterNodes.put(nodeId, node);
            }
            log.info("Node offline: {}", nodeId);
        }
    }

    private void handleTrainStatusSync(ClusterMessage message) {
        TrainStatus status = JSON.parseObject(JSON.toJSONString(message.getPayload()),
                new TypeReference<TrainStatus>() {});
        if (status != null && status.getTrainId() != null) {
            trainStatusCache.put(status.getTrainId(), status);

            String key = RedisConstants.KEY_PREFIX_TRAIN_STATUS + status.getTrainId();
            redisTemplate.opsForValue().set(key, status,
                    RedisConstants.TTL_TRAIN_STATUS, java.util.concurrent.TimeUnit.SECONDS);

            log.debug("Synced train status: {}", status.getTrainId());
        }
    }

    private void handleTrainStatusInvalidate(ClusterMessage message) {
        String trainId = (String) message.getPayload();
        if (trainId != null) {
            trainStatusCache.remove(trainId);
            String key = RedisConstants.KEY_PREFIX_TRAIN_STATUS + trainId;
            redisTemplate.delete(key);
            log.debug("Invalidated train status: {}", trainId);
        }
    }

    public Map<String, ClusterNode> getClusterNodes() {
        return clusterNodes;
    }

    public Map<String, TrainStatus> getTrainStatusCache() {
        return trainStatusCache;
    }

    public String getCurrentNodeId() {
        return currentNodeId;
    }
}
