package com.specimen.data.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import com.alibaba.fastjson2.JSON;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Slf4j
@Component
@RequiredArgsConstructor
public class CollaborationNotifier {

    private final StringRedisTemplate redisTemplate;

    private static final String CHANNEL_PREFIX = "collaboration:";

    public void notifyAnnotationChange(Long tenantId, Long specimenId, Long imageId, String action, Long userId, String username) {
        Map<String, Object> event = new HashMap<>();
        event.put("type", "ANNOTATION_CHANGE");
        event.put("specimenId", specimenId);
        event.put("imageId", imageId);
        event.put("action", action);
        event.put("userId", userId);
        event.put("username", username);
        event.put("timestamp", System.currentTimeMillis());

        String channel = CHANNEL_PREFIX + tenantId;
        String message = JSON.toJSONString(event);
        redisTemplate.convertAndSend(channel, message);
    }

    public void notifySpecimenChange(Long tenantId, Long specimenId, String action, Long userId) {
        Map<String, Object> event = new HashMap<>();
        event.put("type", "SPECIMEN_CHANGE");
        event.put("specimenId", specimenId);
        event.put("action", action);
        event.put("userId", userId);
        event.put("timestamp", System.currentTimeMillis());

        String channel = CHANNEL_PREFIX + tenantId;
        String message = JSON.toJSONString(event);
        redisTemplate.convertAndSend(channel, message);
    }

    public void publishOnlineStatus(Long tenantId, Long userId, String username, boolean online) {
        String key = String.format("online:%d:%d", tenantId, userId);
        if (online) {
            Map<String, Object> status = new HashMap<>();
            status.put("userId", userId);
            status.put("username", username);
            status.put("lastActive", System.currentTimeMillis());
            redisTemplate.opsForValue().set(key, JSON.toJSONString(status), 60, TimeUnit.SECONDS);
        } else {
            redisTemplate.delete(key);
        }
    }

    public void heartbeat(Long tenantId, Long userId, String username) {
        publishOnlineStatus(tenantId, userId, username, true);
    }
}
