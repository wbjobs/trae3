package com.railway.config;

import com.railway.common.util.RateLimiter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RateLimitConfig {

    @Value("${app.rate-limit.global-qps:10000}")
    private double globalQps;

    @Value("${app.rate-limit.per-ip-qps:100}")
    private double perIpQps;

    @Value("${app.rate-limit.enabled:true}")
    private boolean enabled;

    @Bean
    public RateLimiter.MultiRateLimiter reportRateLimiter() {
        return new RateLimiter.MultiRateLimiter(globalQps, perIpQps);
    }

    @Bean
    public boolean rateLimitEnabled() {
        return enabled;
    }

    public double getGlobalQps() {
        return globalQps;
    }

    public double getPerIpQps() {
        return perIpQps;
    }

    public boolean isEnabled() {
        return enabled;
    }
}
