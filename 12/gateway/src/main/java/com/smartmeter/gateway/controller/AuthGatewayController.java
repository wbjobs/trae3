package com.smartmeter.gateway.controller;

import com.smartmeter.common.dto.LoginRequest;
import com.smartmeter.common.dto.LoginResponse;
import com.smartmeter.common.result.Result;
import com.smartmeter.gateway.feign.AuthClient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/auth")
public class AuthGatewayController {

    @Autowired
    private AuthClient authClient;

    @PostMapping("/login")
    public Result<LoginResponse> login(@RequestBody LoginRequest request) {
        try {
            log.info("Gateway login request, username: {}", request.getUsername());
            return authClient.login(request);
        } catch (Exception e) {
            log.error("Gateway login failed, error: {}", e.getMessage(), e);
            return Result.fail("Login failed: " + e.getMessage());
        }
    }

    @PostMapping("/logout")
    public Result<Void> logout(@RequestHeader("Authorization") String token) {
        try {
            return authClient.logout(token);
        } catch (Exception e) {
            log.error("Gateway logout failed, error: {}", e.getMessage(), e);
            return Result.fail("Logout failed: " + e.getMessage());
        }
    }

    @PostMapping("/refresh")
    public Result<Map<String, Object>> refreshToken(@RequestHeader("Authorization") String token) {
        try {
            return authClient.refreshToken(token);
        } catch (Exception e) {
            log.error("Gateway refresh token failed, error: {}", e.getMessage(), e);
            return Result.fail("Refresh token failed: " + e.getMessage());
        }
    }

    @GetMapping("/user-info")
    public Result<Map<String, Object>> getUserInfo(@RequestHeader("Authorization") String token) {
        try {
            return authClient.getUserInfo(token);
        } catch (Exception e) {
            log.error("Gateway get user info failed, error: {}", e.getMessage(), e);
            return Result.fail("Get user info failed: " + e.getMessage());
        }
    }
}
