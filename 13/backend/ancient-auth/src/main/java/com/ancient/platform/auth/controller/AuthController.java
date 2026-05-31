package com.ancient.platform.auth.controller;

import java.util.Map;

import com.ancient.platform.auth.dto.LoginRequest;
import com.ancient.platform.auth.dto.LoginResponse;
import com.ancient.platform.auth.dto.RegisterRequest;
import com.ancient.platform.auth.dto.UserInfoDTO;
import com.ancient.platform.auth.service.AuthService;
import com.ancient.platform.common.result.Result;
import com.ancient.platform.common.utils.JwtUtils;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/**
 * 认证控制器
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final JwtUtils jwtUtils;

    @PostMapping("/login")
    public Result<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }

    @PostMapping("/refresh")
    public Result<LoginResponse> refresh(@RequestBody Map<String, String> body) {
        String refreshToken = body.get("refreshToken");
        return authService.refreshToken(refreshToken);
    }

    @PostMapping("/logout")
    public Result<Void> logout(HttpServletRequest request) {
        String token = jwtUtils.getTokenFromRequest(request);
        return authService.logout(token);
    }

    @GetMapping("/me")
    public Result<UserInfoDTO> me(HttpServletRequest request) {
        String token = jwtUtils.getTokenFromRequest(request);
        Long userId = jwtUtils.getUserIdFromToken(token);
        return authService.getCurrentUser(userId);
    }

    @PostMapping("/register")
    public Result<Void> register(@Valid @RequestBody RegisterRequest request) {
        return authService.register(request);
    }
}
