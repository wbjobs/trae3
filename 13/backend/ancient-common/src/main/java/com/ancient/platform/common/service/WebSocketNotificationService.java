package com.ancient.platform.common.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class WebSocketNotificationService {

    private final SimpMessagingTemplate messagingTemplate;

    public void sendCompressionComplete(Long projectId, int total, int success, int failed) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("type", "COMPRESSION_COMPLETE");
        payload.put("projectId", projectId);
        payload.put("total", total);
        payload.put("success", success);
        payload.put("failed", failed);
        payload.put("timestamp", System.currentTimeMillis());

        String destination = "/topic/projects/" + projectId + "/compression";
        messagingTemplate.convertAndSend(destination, payload);
        log.info("发送压缩完成通知: projectId={}, total={}, success={}, failed={}", projectId, total, success, failed);
    }

    public void sendCompressionProgress(Long projectId, int current, int total, String fileName) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("type", "COMPRESSION_PROGRESS");
        payload.put("projectId", projectId);
        payload.put("current", current);
        payload.put("total", total);
        payload.put("fileName", fileName);
        payload.put("progress", (double) current / total * 100);
        payload.put("timestamp", System.currentTimeMillis());

        String destination = "/topic/projects/" + projectId + "/compression";
        messagingTemplate.convertAndSend(destination, payload);
        log.debug("发送压缩进度通知: projectId={}, current={}/{}, fileName={}", projectId, current, total, fileName);
    }

    public void sendNotification(String userId, String message) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("type", "NOTIFICATION");
        payload.put("message", message);
        payload.put("timestamp", System.currentTimeMillis());

        String destination = "/user/" + userId + "/queue/notifications";
        messagingTemplate.convertAndSend(destination, payload);
        log.info("发送用户通知: userId={}, message={}", userId, message);
    }
}
