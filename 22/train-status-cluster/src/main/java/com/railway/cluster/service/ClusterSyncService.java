package com.railway.cluster.service;

import com.alibaba.fastjson2.JSON;
import com.railway.cluster.listener.ClusterMessageListener;
import com.railway.cluster.message.ClusterMessage;
import com.railway.common.constant.MqConstants;
import com.railway.common.constant.RedisConstants;
import com.railway.common.entity.ClusterNode;
import com.railway.common.entity.TrainStatus;
import com.railway.common.util.IdGeneratorUtil;
import com.railway.mq.producer.TrainStatusProducer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.Resource;
import java.net.InetAddress;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class ClusterSyncService {

    private static final Logger log = LoggerFactory.getLogger(ClusterSyncService.class);

    private final String currentNodeId = IdGeneratorUtil.generateNodeId();

    @Resource
    private RedisTemplate<String, Object> redisTemplate;

    @Resource
    private ClusterMessageListener clusterMessageListener;

    @Resource
    private TrainStatusProducer trainStatusProducer;

    private ClusterNode currentNode;

    @PostConstruct
    public void init() {
        try {
            String host = InetAddress.getLocalHost().getHostAddress();
            int port = Integer.parseInt(System.getProperty("server.port", "8080"));

            currentNode = new ClusterNode(currentNodeId, host, port);

            registerNode();

            log.info("Cluster node initialized: {}", currentNodeId);

        } catch (Exception e) {
            log.error("Initialize cluster node failed", e);
        }
    }

    public void registerNode() {
        try {
            String key = RedisConstants.KEY_PREFIX_NODE_STATUS + currentNodeId;
            redisTemplate.opsForValue().set(key, currentNode,
                    RedisConstants.TTL_NODE_STATUS, java.util.concurrent.TimeUnit.SECONDS);

            redisTemplate.opsForSet().add(RedisConstants.KEY_NODE_LIST, currentNodeId);

            ClusterMessage message = new ClusterMessage("NODE_REGISTER", currentNodeId, currentNode);
            broadcastMessage(message);

            log.info("Node registered: {}", currentNodeId);
        } catch (Exception e) {
            log.error("Register node failed", e);
        }
    }

    @Scheduled(fixedRate = 5000, initialDelay = 10000)
    public void sendHeartbeat() {
        try {
            if (currentNode == null) {
                return;
            }

            currentNode.setLastHeartbeat(LocalDateTime.now());
            currentNode.setHandledMessageCount(currentNode.getHandledMessageCount() == null
                    ? 1L : currentNode.getHandledMessageCount() + 1);

            String key = RedisConstants.KEY_PREFIX_NODE_STATUS + currentNodeId;
            redisTemplate.opsForValue().set(key, currentNode,
                    RedisConstants.TTL_NODE_STATUS, java.util.concurrent.TimeUnit.SECONDS);

            ClusterMessage message = new ClusterMessage("NODE_HEARTBEAT", currentNodeId, currentNode);
            trainStatusProducer.sendClusterSyncMessage(message, MqConstants.TAG_NODE_HEARTBEAT);
            broadcastMessage(message);

            log.debug("Sent heartbeat: {}", currentNodeId);
        } catch (Exception e) {
            log.warn("Send heartbeat failed", e);
        }
    }

    @Scheduled(fixedRate = 30000, initialDelay = 30000)
    public void checkOfflineNodes() {
        try {
            List<String> nodeIds = redisTemplate.opsForSet()
                    .members(RedisConstants.KEY_NODE_LIST)
                    .stream()
                    .map(Object::toString)
                    .collect(Collectors.toList());

            LocalDateTime threshold = LocalDateTime.now().minusSeconds(RedisConstants.TTL_NODE_STATUS);

            for (String nodeId : nodeIds) {
                String key = RedisConstants.KEY_PREFIX_NODE_STATUS + nodeId;
                ClusterNode node = (ClusterNode) redisTemplate.opsForValue().get(key);

                if (node == null || node.getLastHeartbeat().isBefore(threshold)) {
                    redisTemplate.opsForSet().remove(RedisConstants.KEY_NODE_LIST, nodeId);
                    redisTemplate.delete(key);

                    ClusterMessage message = new ClusterMessage("NODE_OFFLINE", currentNodeId, nodeId);
                    broadcastMessage(message);

                    log.info("Detected offline node: {}", nodeId);
                }
            }
        } catch (Exception e) {
            log.warn("Check offline nodes failed", e);
        }
    }

    public void syncTrainStatus(TrainStatus status) {
        if (status == null || status.getTrainId() == null) {
            return;
        }

        String key = RedisConstants.KEY_PREFIX_TRAIN_STATUS + status.getTrainId();
        redisTemplate.opsForValue().set(key, status,
                RedisConstants.TTL_TRAIN_STATUS, java.util.concurrent.TimeUnit.SECONDS);

        String heartbeatKey = RedisConstants.KEY_PREFIX_TRAIN_HEARTBEAT + status.getTrainId();
        redisTemplate.opsForValue().set(heartbeatKey, LocalDateTime.now(),
                RedisConstants.TTL_HEARTBEAT, java.util.concurrent.TimeUnit.SECONDS);

        ClusterMessage message = new ClusterMessage("TRAIN_STATUS_SYNC", currentNodeId, status);
        broadcastMessage(message);

        log.debug("Synced train status: {}", status.getTrainId());
    }

    public TrainStatus getTrainStatus(String trainId) {
        TrainStatus cached = clusterMessageListener.getTrainStatusCache().get(trainId);
        if (cached != null) {
            return cached;
        }

        String key = RedisConstants.KEY_PREFIX_TRAIN_STATUS + trainId;
        return (TrainStatus) redisTemplate.opsForValue().get(key);
    }

    public List<TrainStatus> getAllTrainStatus() {
        return new ArrayList<>(clusterMessageListener.getTrainStatusCache().values());
    }

    public List<ClusterNode> getAllNodes() {
        List<ClusterNode> nodes = new ArrayList<>();

        Map<String, ClusterNode> localNodes = clusterMessageListener.getClusterNodes();
        nodes.addAll(localNodes.values());

        try {
            List<String> nodeIds = redisTemplate.opsForSet()
                    .members(RedisConstants.KEY_NODE_LIST)
                    .stream()
                    .map(Object::toString)
                    .collect(Collectors.toList());

            for (String nodeId : nodeIds) {
                if (!localNodes.containsKey(nodeId)) {
                    String key = RedisConstants.KEY_PREFIX_NODE_STATUS + nodeId;
                    ClusterNode node = (ClusterNode) redisTemplate.opsForValue().get(key);
                    if (node != null) {
                        nodes.add(node);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Get nodes from Redis failed", e);
        }

        return nodes;
    }

    public ClusterNode getCurrentNode() {
        return currentNode;
    }

    private void broadcastMessage(ClusterMessage message) {
        try {
            message.setMessageId(IdGeneratorUtil.generateMessageId());
            String payload = JSON.toJSONString(message);
            redisTemplate.convertAndSend(RedisConstants.CHANNEL_CLUSTER_SYNC, payload);
            log.debug("Broadcast message: {}", message.getMessageType());
        } catch (Exception e) {
            log.warn("Broadcast message failed", e);
        }
    }

    public boolean isDuplicate(String trainId, long timestamp) {
        String key = RedisConstants.KEY_PREFIX_DUPLICATE_CHECK
                + IdGeneratorUtil.generateDupKey(trainId, timestamp);
        Boolean exists = redisTemplate.hasKey(key);
        if (exists != null && exists) {
            return true;
        }
        redisTemplate.opsForValue().set(key, "1",
                RedisConstants.TTL_DUPLICATE_CHECK, java.util.concurrent.TimeUnit.SECONDS);
        return false;
    }

    public boolean isDuplicate(String trainId, String protocolVersion, int sequence) {
        String key = RedisConstants.KEY_PREFIX_DUPLICATE_CHECK
                + IdGeneratorUtil.generateDupKey(trainId, protocolVersion, sequence);
        Boolean exists = redisTemplate.hasKey(key);
        if (exists != null && exists) {
            return true;
        }
        redisTemplate.opsForValue().set(key, "1",
                RedisConstants.TTL_DUPLICATE_CHECK, java.util.concurrent.TimeUnit.SECONDS);
        return false;
    }
}
