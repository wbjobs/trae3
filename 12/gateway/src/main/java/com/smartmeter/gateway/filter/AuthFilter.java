package com.smartmeter.gateway.filter;

import com.alibaba.fastjson.JSON;
import com.smartmeter.common.constant.ProtocolConstants;
import com.smartmeter.common.result.Result;
import com.smartmeter.gateway.feign.AuthClient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Slf4j
@Component
public class AuthFilter implements HandlerInterceptor {

    private static final String CACHE_PREFIX = "gateway:auth:";

    @Autowired
    private AuthClient authClient;

    @Autowired
    private RedisTemplate<String, Object> redisTemplate;

    @Value("${gateway.auth-enabled:true}")
    private boolean authEnabled;

    @Value("${gateway.auth-cache-ttl:60}")
    private int authCacheTtl;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        if (!authEnabled) {
            return true;
        }

        String path = request.getRequestURI();
        if (path.contains("/api/auth/login") || path.contains("/actuator")) {
            return true;
        }

        String token = request.getHeader("Authorization");
        if (token == null || token.isEmpty()) {
            sendUnauthorized(response, "Missing authorization token");
            return false;
        }

        String cacheKey = CACHE_PREFIX + token;
        try {
            Boolean cached = redisTemplate.hasKey(cacheKey);
            if (Boolean.TRUE.equals(cached)) {
                log.debug("Auth cache hit for token");
                return true;
            }
        } catch (Exception e) {
            log.warn("Redis auth cache check failed: {}", e.getMessage());
        }

        try {
            Result<Map<String, Object>> result = authClient.validateToken(token);
            if (result != null && result.isSuccess() && result.getData() != null) {
                Boolean valid = (Boolean) result.getData().get("valid");
                if (Boolean.TRUE.equals(valid)) {
                    try {
                        redisTemplate.opsForValue().set(cacheKey, "1", authCacheTtl, TimeUnit.SECONDS);
                    } catch (Exception e) {
                        log.warn("Redis auth cache set failed: {}", e.getMessage());
                    }
                    return true;
                }
            }
            sendUnauthorized(response, "Invalid or expired token");
        } catch (Exception e) {
            log.error("Auth service call failed: {}", e.getMessage(), e);
            sendUnauthorized(response, "Auth service unavailable");
        }

        return false;
    }

    private void sendUnauthorized(HttpServletResponse response, String message) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json;charset=UTF-8");
        Result<Void> result = Result.fail(401, message);
        response.getWriter().write(JSON.toJSONString(result));
    }
}
