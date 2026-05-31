package com.railway.auth.service;

import com.railway.auth.util.JwtUtil;
import com.railway.common.constant.RedisConstants;
import com.railway.common.dto.LoginRequestDTO;
import com.railway.common.dto.LoginResponseDTO;
import com.railway.common.dto.Result;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import jakarta.annotation.Resource;
import java.util.concurrent.TimeUnit;

@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    @Value("${auth.default-username:admin}")
    private String defaultUsername;

    @Value("${auth.default-password:admin123}")
    private String defaultPassword;

    @Resource
    private JwtUtil jwtUtil;

    @Resource
    private RedisTemplate<String, Object> redisTemplate;

    public Result<LoginResponseDTO> login(LoginRequestDTO request) {
        if (request == null) {
            return Result.error(400, "Login request is null");
        }

        String username = request.getUsername();
        String password = request.getPassword();

        if (username == null || username.trim().isEmpty()) {
            return Result.error(400, "Username is required");
        }

        if (password == null || password.trim().isEmpty()) {
            return Result.error(400, "Password is required");
        }

        if (!defaultUsername.equals(username) || !defaultPassword.equals(password)) {
            log.warn("Login failed: invalid credentials, username: {}", username);
            return Result.error(401, "Invalid username or password");
        }

        String role = "ADMIN";
        String token = jwtUtil.generateToken(username, role);

        String tokenKey = RedisConstants.KEY_PREFIX_AUTH_TOKEN + username;
        redisTemplate.opsForValue().set(tokenKey, token,
                RedisConstants.TTL_AUTH_TOKEN, TimeUnit.SECONDS);

        log.info("Login success, username: {}", username);

        LoginResponseDTO response = new LoginResponseDTO(token, jwtUtil.getExpireSeconds());
        return Result.success("Login success", response);
    }

    public Result<Void> logout(String username) {
        if (username == null || username.trim().isEmpty()) {
            return Result.error(400, "Username is required");
        }

        String tokenKey = RedisConstants.KEY_PREFIX_AUTH_TOKEN + username;
        redisTemplate.delete(tokenKey);

        log.info("Logout success, username: {}", username);
        return Result.success("Logout success");
    }

    public Result<Boolean> validateToken(String token) {
        if (token == null || token.trim().isEmpty()) {
            return Result.error(400, "Token is required");
        }

        boolean valid = jwtUtil.validateToken(token);
        return Result.success(valid);
    }

    public Result<String> getCurrentUser(String username) {
        if (username == null || username.trim().isEmpty()) {
            return Result.error(401, "Not logged in");
        }
        return Result.success(username);
    }
}
