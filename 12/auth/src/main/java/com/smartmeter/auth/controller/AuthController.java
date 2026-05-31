package com.smartmeter.auth.controller;

import com.smartmeter.common.dto.LoginRequest;
import com.smartmeter.common.dto.LoginResponse;
import com.smartmeter.auth.service.AuthService;
import com.smartmeter.common.constant.ProtocolConstants;
import com.smartmeter.common.result.Result;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @Value("${jwt.expiration:86400}")
    private Long expiration;

    @Autowired
    private AuthService authService;

    @PostMapping("/login")
    public Result<LoginResponse> login(@RequestBody LoginRequest request) {
        try {
            log.info("Login request, username: {}", request.getUsername());
            String token = authService.login(request.getUsername(), request.getPassword());
            Long userId = authService.getUserIdFromToken(token);
            List<String> roles = authService.getRolesFromToken(token);

            LoginResponse response = new LoginResponse(
                    token,
                    "Bearer",
                    expiration,
                    request.getUsername(),
                    roles,
                    userId
            );
            return Result.success(response);
        } catch (Exception e) {
            log.error("Login failed, username: {}, error: {}", request.getUsername(), e.getMessage(), e);
            return Result.fail("Login failed: " + e.getMessage());
        }
    }

    @PostMapping("/logout")
    public Result<Void> logout(@RequestHeader("Authorization") String token) {
        try {
            authService.logout(token);
            return Result.success();
        } catch (Exception e) {
            log.error("Logout failed, error: {}", e.getMessage(), e);
            return Result.fail("Logout failed: " + e.getMessage());
        }
    }

    @PostMapping("/validate")
    public Result<Map<String, Object>> validateToken(@RequestHeader("Authorization") String token) {
        try {
            boolean valid = authService.validateToken(token);
            Map<String, Object> result = new HashMap<>();
            result.put("valid", valid);
            if (valid) {
                result.put("userId", authService.getUserIdFromToken(token));
                result.put("roles", authService.getRolesFromToken(token));
            }
            return Result.success(result);
        } catch (Exception e) {
            log.error("Validate token failed, error: {}", e.getMessage(), e);
            return Result.fail("Validate token failed: " + e.getMessage());
        }
    }

    @PostMapping("/refresh")
    public Result<Map<String, Object>> refreshToken(@RequestHeader("Authorization") String token) {
        try {
            String newToken = authService.refreshToken(token);
            Map<String, Object> result = new HashMap<>();
            result.put("token", newToken);
            result.put("tokenType", "Bearer");
            result.put("expiresIn", expiration);
            return Result.success(result);
        } catch (Exception e) {
            log.error("Refresh token failed, error: {}", e.getMessage(), e);
            return Result.fail("Refresh token failed: " + e.getMessage());
        }
    }

    @PostMapping("/check-permission")
    public Result<Boolean> checkPermission(
            @RequestHeader("Authorization") String token,
            @RequestParam String role) {
        try {
            boolean hasPermission = authService.checkPermission(token, role);
            return Result.success(hasPermission);
        } catch (Exception e) {
            log.error("Check permission failed, error: {}", e.getMessage(), e);
            return Result.fail("Check permission failed: " + e.getMessage());
        }
    }

    @GetMapping("/user-info")
    public Result<Map<String, Object>> getUserInfo(@RequestHeader("Authorization") String token) {
        try {
            if (!authService.validateToken(token)) {
                return Result.fail(401, "Invalid token");
            }
            Map<String, Object> userInfo = new HashMap<>();
            userInfo.put("userId", authService.getUserIdFromToken(token));
            userInfo.put("roles", authService.getRolesFromToken(token));
            return Result.success(userInfo);
        } catch (Exception e) {
            log.error("Get user info failed, error: {}", e.getMessage(), e);
            return Result.fail("Get user info failed: " + e.getMessage());
        }
    }
}
