package com.smartmeter.gateway.filter;

import com.alibaba.fastjson.JSON;
import com.smartmeter.common.constant.ProtocolConstants;
import com.smartmeter.common.result.Result;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.LongAdder;

@Slf4j
@Component
public class RateLimitFilter implements HandlerInterceptor {

    @Value("${gateway.rate-limit.permits-per-second:1000}")
    private int permitsPerSecond;

    @Value("${gateway.rate-limit.enabled:true}")
    private boolean enabled;

    private final Map<String, TokenBucket> buckets = new ConcurrentHashMap<>();

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        if (!enabled) {
            return true;
        }

        String clientId = getClientId(request);
        TokenBucket bucket = buckets.computeIfAbsent(clientId, k -> new TokenBucket(permitsPerSecond));

        if (!bucket.tryConsume()) {
            log.warn("Rate limit exceeded for client: {}, path: {}", clientId, request.getRequestURI());
            sendTooManyRequests(response);
            return false;
        }

        return true;
    }

    private String getClientId(HttpServletRequest request) {
        String auth = request.getHeader("Authorization");
        if (auth != null && !auth.isEmpty()) {
            return auth.hashCode() + "";
        }
        String ip = request.getHeader("X-Real-IP");
        if (ip == null || ip.isEmpty()) {
            ip = request.getRemoteAddr();
        }
        return ip;
    }

    private void sendTooManyRequests(HttpServletResponse response) throws IOException {
        response.setStatus(429);
        response.setContentType("application/json;charset=UTF-8");
        Result<Void> result = Result.fail(429, "Too many requests, please try again later");
        response.getWriter().write(JSON.toJSONString(result));
    }

    private static class TokenBucket {
        private final long capacity;
        private final LongAdder used = new LongAdder();
        private final AtomicLong lastRefillTime = new AtomicLong(System.currentTimeMillis());
        private final long refillIntervalMs = 1000;

        TokenBucket(int permitsPerSecond) {
            this.capacity = permitsPerSecond;
        }

        boolean tryConsume() {
            refill();
            long currentUsed = used.sum();
            if (currentUsed < capacity) {
                used.increment();
                return true;
            }
            return false;
        }

        private void refill() {
            long now = System.currentTimeMillis();
            long last = lastRefillTime.get();
            if (now - last >= refillIntervalMs) {
                if (lastRefillTime.compareAndSet(last, now)) {
                    used.reset();
                }
            }
        }
    }
}
