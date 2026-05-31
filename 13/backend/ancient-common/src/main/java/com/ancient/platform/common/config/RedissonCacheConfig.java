package com.ancient.platform.common.config;

import com.ancient.platform.common.cache.CacheNames;
import org.redisson.Redisson;
import org.redisson.api.RedissonClient;
import org.redisson.config.Config;
import org.redisson.spring.cache.CacheConfig;
import org.redisson.spring.cache.RedissonSpringCacheManager;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.CacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.HashMap;
import java.util.Map;

@Configuration
public class RedissonCacheConfig {

    @Value("${spring.data.redis.host:localhost}")
    private String redisHost;

    @Value("${spring.data.redis.port:6379}")
    private int redisPort;

    @Value("${spring.data.redis.password:}")
    private String redisPassword;

    @Value("${spring.data.redis.database:0}")
    private int redisDatabase;

    @Value("${cache.ttl.search-result:600000}")
    private long searchResultTtl;

    @Value("${cache.ttl.search-suggest:1800000}")
    private long searchSuggestTtl;

    @Value("${cache.ttl.hot-keywords:3600000}")
    private long hotKeywordsTtl;

    @Bean(destroyMethod = "shutdown")
    public RedissonClient redissonClient() {
        Config config = new Config();
        String address = "redis://" + redisHost + ":" + redisPort;
        config.useSingleServer()
                .setAddress(address)
                .setDatabase(redisDatabase);
        if (redisPassword != null && !redisPassword.isEmpty()) {
            config.useSingleServer().setPassword(redisPassword);
        }
        return Redisson.create(config);
    }

    @Bean
    public CacheManager cacheManager(RedissonClient redissonClient) {
        Map<String, CacheConfig> config = new HashMap<>();

        CacheConfig searchResultConfig = new CacheConfig(searchResultTtl, 0);
        config.put(CacheNames.SEARCH_RESULT, searchResultConfig);

        CacheConfig searchSuggestConfig = new CacheConfig(searchSuggestTtl, 0);
        config.put(CacheNames.SEARCH_SUGGEST, searchSuggestConfig);

        CacheConfig searchHotkeyConfig = new CacheConfig(hotKeywordsTtl, 0);
        config.put(CacheNames.SEARCH_HOTKEY, searchHotkeyConfig);

        CacheConfig pageIndexConfig = new CacheConfig(3600000, 0);
        config.put(CacheNames.PAGE_INDEX, pageIndexConfig);

        CacheConfig searchFiltersConfig = new CacheConfig(7200000, 0);
        config.put(CacheNames.SEARCH_FILTERS, searchFiltersConfig);

        return new RedissonSpringCacheManager(redissonClient, config);
    }
}
