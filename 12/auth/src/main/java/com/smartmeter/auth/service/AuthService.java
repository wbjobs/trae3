package com.smartmeter.auth.service;

import com.smartmeter.auth.util.JwtTokenUtil;
import com.smartmeter.common.constant.ProtocolConstants;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
public class AuthService {

    private static final String TOKEN_BLACKLIST_PREFIX = "auth:token:blacklist:";
    private static final String USER_TOKEN_PREFIX = "auth:user:token:";

    @Autowired
    private JwtTokenUtil jwtTokenUtil;

    @Autowired
    private RedisTemplate<String, Object> redisTemplate;

    public String login(String username, String password) {
        if (!validateUserCredentials(username, password)) {
            log.warn("Invalid credentials for user: {}", username);
            throw new IllegalArgumentException("Invalid username or password");
        }

        Long userId = getUserIdByUsername(username);
        List<String> roles = getUserRoles(userId);

        String token = jwtTokenUtil.generateToken(userId, username, roles);

        String userTokenKey = USER_TOKEN_PREFIX + userId;
        redisTemplate.opsForValue().set(userTokenKey, token, 24, TimeUnit.HOURS);

        log.info("User login success, userId: {}, username: {}", userId, username);
        return token;
    }

    public void logout(String token) {
        if (token.startsWith(ProtocolConstants.JWT_TOKEN_PREFIX)) {
            token = token.substring(ProtocolConstants.JWT_TOKEN_PREFIX.length());
        }

        Long userId = jwtTokenUtil.getUserIdFromToken(token);
        if (userId != null) {
            String blacklistKey = TOKEN_BLACKLIST_PREFIX + token;
            redisTemplate.opsForValue().set(blacklistKey, "1", 24, TimeUnit.HOURS);

            String userTokenKey = USER_TOKEN_PREFIX + userId;
            redisTemplate.delete(userTokenKey);

            log.info("User logout success, userId: {}", userId);
        }
    }

    public boolean validateToken(String token) {
        if (token.startsWith(ProtocolConstants.JWT_TOKEN_PREFIX)) {
            token = token.substring(ProtocolConstants.JWT_TOKEN_PREFIX.length());
        }

        String blacklistKey = TOKEN_BLACKLIST_PREFIX + token;
        Boolean isBlacklisted = redisTemplate.hasKey(blacklistKey);
        if (Boolean.TRUE.equals(isBlacklisted)) {
            log.warn("Token is in blacklist");
            return false;
        }

        return jwtTokenUtil.validateToken(token);
    }

    public Long getUserIdFromToken(String token) {
        if (token.startsWith(ProtocolConstants.JWT_TOKEN_PREFIX)) {
            token = token.substring(ProtocolConstants.JWT_TOKEN_PREFIX.length());
        }
        return jwtTokenUtil.getUserIdFromToken(token);
    }

    public List<String> getRolesFromToken(String token) {
        if (token.startsWith(ProtocolConstants.JWT_TOKEN_PREFIX)) {
            token = token.substring(ProtocolConstants.JWT_TOKEN_PREFIX.length());
        }
        return jwtTokenUtil.getRolesFromToken(token);
    }

    public boolean checkPermission(String token, String requiredRole) {
        if (!validateToken(token)) {
            return false;
        }
        List<String> roles = getRolesFromToken(token);
        return roles.contains(requiredRole) || roles.contains("ADMIN");
    }

    public String refreshToken(String token) {
        if (token.startsWith(ProtocolConstants.JWT_TOKEN_PREFIX)) {
            token = token.substring(ProtocolConstants.JWT_TOKEN_PREFIX.length());
        }

        String newToken = jwtTokenUtil.refreshToken(token);
        if (newToken != null) {
            Long userId = jwtTokenUtil.getUserIdFromToken(token);
            if (userId != null) {
                String userTokenKey = USER_TOKEN_PREFIX + userId;
                redisTemplate.opsForValue().set(userTokenKey, newToken, 24, TimeUnit.HOURS);

                String blacklistKey = TOKEN_BLACKLIST_PREFIX + token;
                redisTemplate.opsForValue().set(blacklistKey, "1", 24, TimeUnit.HOURS);
            }
        }
        return newToken;
    }

    private boolean validateUserCredentials(String username, String password) {
        Map<String, String> users = new HashMap<>();
        users.put("admin", "admin123");
        users.put("user", "user123");
        users.put("api", "api123");

        String storedPassword = users.get(username);
        return storedPassword != null && storedPassword.equals(password);
    }

    private Long getUserIdByUsername(String username) {
        switch (username) {
            case "admin":
                return 1L;
            case "user":
                return 2L;
            case "api":
                return 3L;
            default:
                return null;
        }
    }

    private List<String> getUserRoles(Long userId) {
        if (userId == 1L) {
            return Arrays.asList("ADMIN", "USER", "API");
        } else if (userId == 2L) {
            return Arrays.asList("USER");
        } else if (userId == 3L) {
            return Arrays.asList("API");
        }
        return Collections.emptyList();
    }
}
