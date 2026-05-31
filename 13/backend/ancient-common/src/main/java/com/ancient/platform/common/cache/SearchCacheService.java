package com.ancient.platform.common.cache;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ZSetOperations;
import org.springframework.stereotype.Service;

import java.util.Set;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class SearchCacheService {

    private static final String HOT_KEYWORDS_ZSET_KEY = "search:hot:keywords";

    private final RedisTemplate<String, Object> redisTemplate;

    public void recordSearchHotkey(String keyword) {
        if (keyword == null || keyword.trim().isEmpty()) {
            return;
        }
        try {
            redisTemplate.opsForZSet().incrementScore(HOT_KEYWORDS_ZSET_KEY, keyword, 1);
            redisTemplate.expire(HOT_KEYWORDS_ZSET_KEY, 1, TimeUnit.HOURS);
            log.debug("记录搜索热词: {}", keyword);
        } catch (Exception e) {
            log.warn("记录搜索热词失败: {}", e.getMessage());
        }
    }

    public Set<String> getHotKeywords(int topN) {
        try {
            Set<Object> rawSet = redisTemplate.opsForZSet()
                    .reverseRange(HOT_KEYWORDS_ZSET_KEY, 0, topN - 1);
            if (rawSet == null) {
                return Set.of();
            }
            return rawSet.stream()
                    .map(Object::toString)
                    .collect(java.util.stream.Collectors.toSet());
        } catch (Exception e) {
            log.warn("获取热门搜索词失败: {}", e.getMessage());
            return Set.of();
        }
    }

    public Set<ZSetOperations.TypedTuple<Object>> getHotKeywordsWithScore(int topN) {
        try {
            return redisTemplate.opsForZSet()
                    .reverseRangeWithScores(HOT_KEYWORDS_ZSET_KEY, 0, topN - 1);
        } catch (Exception e) {
            log.warn("获取热门搜索词(带分数)失败: {}", e.getMessage());
            return Set.of();
        }
    }

    public void clearHotKeywords() {
        try {
            redisTemplate.delete(HOT_KEYWORDS_ZSET_KEY);
            log.info("清除搜索热词缓存成功");
        } catch (Exception e) {
            log.warn("清除搜索热词缓存失败: {}", e.getMessage());
        }
    }
}
