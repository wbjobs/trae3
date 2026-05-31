package com.specimen.data.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;

@Slf4j
@Component
@RequiredArgsConstructor
public class DistributedLock {

    private final StringRedisTemplate redisTemplate;

    public boolean tryLock(String key, String value, long expireSeconds) {
        Boolean result = redisTemplate.opsForValue().setIfAbsent(key, value, expireSeconds, TimeUnit.SECONDS);
        return Boolean.TRUE.equals(result);
    }

    public boolean unlock(String key, String value) {
        String currentValue = redisTemplate.opsForValue().get(key);
        if (value.equals(currentValue)) {
            redisTemplate.delete(key);
            return true;
        }
        return false;
    }

    public boolean tryLockAnnotation(Long specimenId, Long imageId, Long userId) {
        String key = String.format("lock:annotation:%d:%d", specimenId, imageId);
        String value = String.valueOf(userId);
        return tryLock(key, value, 300);
    }

    public void unlockAnnotation(Long specimenId, Long imageId, Long userId) {
        String key = String.format("lock:annotation:%d:%d", specimenId, imageId);
        unlock(key, String.valueOf(userId));
    }
}
