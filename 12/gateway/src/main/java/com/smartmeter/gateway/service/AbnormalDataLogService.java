package com.smartmeter.gateway.service;

import com.alibaba.fastjson.JSON;
import com.smartmeter.common.dto.AbnormalDataLog;
import com.smartmeter.common.constant.ErrorConstants;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import javax.servlet.http.HttpServletRequest;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
public class AbnormalDataLogService {

    private static final String ABNORMAL_LOG_KEY = "abnormal:data:log";
    private static final int MAX_LOG_SIZE = 1000;
    private static final long LOG_EXPIRE_HOURS = 72;

    private final List<AbnormalDataLog> localBuffer = new ArrayList<>();

    public AbnormalDataLog recordAbnormalData(String protocolType, String rawData,
                                                String errorType, String errorMessage,
                                                HttpServletRequest request) {
        AbnormalDataLog logEntry = AbnormalDataLog.builder()
                .id(UUID.randomUUID().toString().replace("-", ""))
                .protocolType(protocolType)
                .rawData(truncateRawData(rawData))
                .errorType(errorType)
                .errorMessage(truncateMessage(errorMessage))
                .occurTime(LocalDateTime.now())
                .clientIp(getClientIp(request))
                .source("gateway")
                .build();

        logAbnormal(logEntry);
        return logEntry;
    }

    public AbnormalDataLog recordAbnormalData(String meterId, String protocolType, String rawData,
                                                String errorType, String errorMessage) {
        AbnormalDataLog logEntry = AbnormalDataLog.builder()
                .id(UUID.randomUUID().toString().replace("-", ""))
                .meterId(meterId)
                .protocolType(protocolType)
                .rawData(truncateRawData(rawData))
                .errorType(errorType)
                .errorMessage(truncateMessage(errorMessage))
                .occurTime(LocalDateTime.now())
                .source("gateway")
                .build();

        logAbnormal(logEntry);
        return logEntry;
    }

    private void logAbnormal(AbnormalDataLog logEntry) {
        log.warn("[ABNORMAL_DATA] type={}, meterId={}, protocol={}, error={}, rawLen={}",
                logEntry.getErrorType(),
                logEntry.getMeterId(),
                logEntry.getProtocolType(),
                logEntry.getErrorMessage(),
                logEntry.getRawData() != null ? logEntry.getRawData().length() : 0);

        synchronized (localBuffer) {
            localBuffer.add(logEntry);
            if (localBuffer.size() > MAX_LOG_SIZE) {
                localBuffer.remove(0);
            }
        }
    }

    @Async
    public void flushToRedis(RedisTemplate<String, Object> redisTemplate) {
        if (redisTemplate == null || localBuffer.isEmpty()) {
            return;
        }
        synchronized (localBuffer) {
            try {
                for (AbnormalDataLog logEntry : localBuffer) {
                    String key = ABNORMAL_LOG_KEY + ":" + logEntry.getId();
                    redisTemplate.opsForValue().set(key, logEntry, LOG_EXPIRE_HOURS, TimeUnit.HOURS);
                }
                int flushed = localBuffer.size();
                localBuffer.clear();
                log.debug("Flushed {} abnormal data logs to Redis", flushed);
            } catch (Exception e) {
                log.error("Flush abnormal data logs to Redis failed: {}", e.getMessage());
            }
        }
    }

    public List<AbnormalDataLog> getRecentAbnormalLogs() {
        synchronized (localBuffer) {
            return new ArrayList<>(localBuffer);
        }
    }

    public long getAbnormalCount() {
        synchronized (localBuffer) {
            return localBuffer.size();
        }
    }

    private String truncateRawData(String rawData) {
        if (rawData == null) {
            return null;
        }
        return rawData.length() > 512 ? rawData.substring(0, 512) + "...(truncated)" : rawData;
    }

    private String truncateMessage(String message) {
        if (message == null) {
            return null;
        }
        return message.length() > 200 ? message.substring(0, 200) + "..." : message;
    }

    private String getClientIp(HttpServletRequest request) {
        if (request == null) {
            return null;
        }
        String ip = request.getHeader("X-Forwarded-For");
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("X-Real-IP");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getRemoteAddr();
        }
        if (ip != null && ip.contains(",")) {
            ip = ip.split(",")[0].trim();
        }
        return ip;
    }
}
