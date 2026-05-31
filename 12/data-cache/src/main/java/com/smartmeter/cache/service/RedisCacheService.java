package com.smartmeter.cache.service;

import com.smartmeter.common.constant.ProtocolConstants;
import com.smartmeter.common.dto.MeterDataDTO;
import com.smartmeter.common.entity.MeterDevice;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
public class RedisCacheService {

    @Autowired
    private RedisTemplate<String, Object> redisTemplate;

    private static final String NULL_PLACEHOLDER = "##NULL##";

    public void cacheLatestData(String meterId, MeterDataDTO data) {
        String key = ProtocolConstants.CACHE_KEY_LATEST + meterId;
        try {
            redisTemplate.opsForValue().set(key, data, ProtocolConstants.CACHE_EXPIRE_SECONDS, TimeUnit.SECONDS);
            log.debug("Cached latest data for meter: {}, TTL: {}s", meterId, ProtocolConstants.CACHE_EXPIRE_SECONDS);
        } catch (Exception e) {
            log.error("Cache latest data failed, meterId: {}, error: {}", meterId, e.getMessage());
        }
    }

    public MeterDataDTO getLatestData(String meterId) {
        String key = ProtocolConstants.CACHE_KEY_LATEST + meterId;
        try {
            Object obj = redisTemplate.opsForValue().get(key);
            if (obj != null) {
                if (NULL_PLACEHOLDER.equals(obj)) {
                    log.debug("Null cache hit for meter: {}", meterId);
                    return null;
                }
                return (MeterDataDTO) obj;
            }
        } catch (Exception e) {
            log.error("Get latest data failed, meterId: {}, error: {}", meterId, e.getMessage());
        }
        return null;
    }

    public void cacheNullPlaceholder(String meterId) {
        String key = ProtocolConstants.CACHE_KEY_LATEST + meterId;
        try {
            redisTemplate.opsForValue().set(key, NULL_PLACEHOLDER,
                    ProtocolConstants.CACHE_EXPIRE_NULL_SECONDS, TimeUnit.SECONDS);
            log.debug("Cached null placeholder for meter: {}, TTL: {}s",
                    meterId, ProtocolConstants.CACHE_EXPIRE_NULL_SECONDS);
        } catch (Exception e) {
            log.error("Cache null placeholder failed, meterId: {}, error: {}", meterId, e.getMessage());
        }
    }

    public void addHistoryData(String meterId, MeterDataDTO data) {
        String key = ProtocolConstants.CACHE_KEY_HISTORY + meterId;
        try {
            redisTemplate.opsForList().leftPush(key, data);
            redisTemplate.opsForList().trim(key, 0, 999);
            redisTemplate.expire(key, ProtocolConstants.CACHE_EXPIRE_SECONDS * 24, TimeUnit.SECONDS);
            log.debug("Added history data for meter: {}", meterId);
        } catch (Exception e) {
            log.error("Add history data failed, meterId: {}, error: {}", meterId, e.getMessage());
        }
    }

    public List<Object> getHistoryData(String meterId, int count) {
        String key = ProtocolConstants.CACHE_KEY_HISTORY + meterId;
        try {
            return redisTemplate.opsForList().range(key, 0, count - 1);
        } catch (Exception e) {
            log.error("Get history data failed, meterId: {}, error: {}", meterId, e.getMessage());
            return null;
        }
    }

    public void cacheDevice(String meterId, MeterDevice device) {
        String key = ProtocolConstants.CACHE_KEY_DEVICE + meterId;
        try {
            if (device != null) {
                redisTemplate.opsForValue().set(key, device,
                        ProtocolConstants.CACHE_EXPIRE_DEVICE_SECONDS, TimeUnit.SECONDS);
                log.debug("Cached device for meter: {}, TTL: {}s", meterId, ProtocolConstants.CACHE_EXPIRE_DEVICE_SECONDS);
            } else {
                redisTemplate.opsForValue().set(key, NULL_PLACEHOLDER,
                        ProtocolConstants.CACHE_EXPIRE_NULL_SECONDS, TimeUnit.SECONDS);
            }
        } catch (Exception e) {
            log.error("Cache device failed, meterId: {}, error: {}", meterId, e.getMessage());
        }
    }

    public MeterDevice getDevice(String meterId) {
        String key = ProtocolConstants.CACHE_KEY_DEVICE + meterId;
        try {
            Object obj = redisTemplate.opsForValue().get(key);
            if (obj != null) {
                if (NULL_PLACEHOLDER.equals(obj)) {
                    return null;
                }
                return (MeterDevice) obj;
            }
        } catch (Exception e) {
            log.error("Get device from cache failed, meterId: {}, error: {}", meterId, e.getMessage());
        }
        return null;
    }

    public void deleteData(String meterId) {
        String latestKey = ProtocolConstants.CACHE_KEY_LATEST + meterId;
        String historyKey = ProtocolConstants.CACHE_KEY_HISTORY + meterId;
        String deviceKey = ProtocolConstants.CACHE_KEY_DEVICE + meterId;
        try {
            redisTemplate.delete(latestKey);
            redisTemplate.delete(historyKey);
            redisTemplate.delete(deviceKey);
            log.info("Deleted cache for meter: {}", meterId);
        } catch (Exception e) {
            log.error("Delete cache failed, meterId: {}, error: {}", meterId, e.getMessage());
        }
    }

    public Set<String> getAllCachedMeterIds() {
        String pattern = ProtocolConstants.CACHE_KEY_LATEST + "*";
        try {
            Set<String> keys = redisTemplate.keys(pattern);
            return keys;
        } catch (Exception e) {
            log.error("Get all cached meter ids failed, error: {}", e.getMessage());
            return null;
        }
    }

    public boolean exists(String meterId) {
        String key = ProtocolConstants.CACHE_KEY_LATEST + meterId;
        try {
            Boolean exists = redisTemplate.hasKey(key);
            return Boolean.TRUE.equals(exists);
        } catch (Exception e) {
            log.error("Check cache exists failed, meterId: {}, error: {}", meterId, e.getMessage());
            return false;
        }
    }

    public boolean tryAcquireLock(String lockKey, long expireMs) {
        try {
            Boolean success = redisTemplate.opsForValue().setIfAbsent(lockKey, "1", expireMs, TimeUnit.MILLISECONDS);
            return Boolean.TRUE.equals(success);
        } catch (Exception e) {
            log.error("Try acquire lock failed, key: {}, error: {}", lockKey, e.getMessage());
            return false;
        }
    }

    public void releaseLock(String lockKey) {
        try {
            redisTemplate.delete(lockKey);
        } catch (Exception e) {
            log.error("Release lock failed, key: {}, error: {}", lockKey, e.getMessage());
        }
    }
}
