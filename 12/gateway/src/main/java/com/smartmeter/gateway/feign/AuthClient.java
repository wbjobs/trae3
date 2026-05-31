package com.smartmeter.gateway.feign;

import com.smartmeter.common.dto.LoginRequest;
import com.smartmeter.common.dto.LoginResponse;
import com.smartmeter.common.result.Result;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@FeignClient(name = "auth-service")
public interface AuthClient {

    @PostMapping("/api/auth/login")
    Result<LoginResponse> login(@RequestBody LoginRequest request);

    @PostMapping("/api/auth/logout")
    Result<Void> logout(@RequestHeader("Authorization") String token);

    @PostMapping("/api/auth/validate")
    Result<Map<String, Object>> validateToken(@RequestHeader("Authorization") String token);

    @PostMapping("/api/auth/refresh")
    Result<Map<String, Object>> refreshToken(@RequestHeader("Authorization") String token);

    @GetMapping("/api/auth/user-info")
    Result<Map<String, Object>> getUserInfo(@RequestHeader("Authorization") String token);

    @PostMapping("/api/auth/check-permission")
    Result<Boolean> checkPermission(
            @RequestHeader("Authorization") String token,
            @RequestParam("role") String role);
}
