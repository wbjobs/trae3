package com.railway.controller;

import com.railway.auth.annotation.RequireAuth;
import com.railway.auth.context.UserContext;
import com.railway.auth.service.AuthService;
import com.railway.common.dto.LoginRequestDTO;
import com.railway.common.dto.LoginResponseDTO;
import com.railway.common.dto.Result;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import jakarta.annotation.Resource;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);

    @Resource
    private AuthService authService;

    @PostMapping("/login")
    @RequireAuth(required = false)
    public Result<LoginResponseDTO> login(@RequestBody LoginRequestDTO request) {
        return authService.login(request);
    }

    @PostMapping("/logout")
    public Result<Void> logout() {
        String username = UserContext.getUsername();
        return authService.logout(username);
    }

    @GetMapping("/me")
    public Result<String> getCurrentUser() {
        String username = UserContext.getUsername();
        return authService.getCurrentUser(username);
    }

    @GetMapping("/validate")
    @RequireAuth(required = false)
    public Result<Boolean> validateToken(@RequestParam String token) {
        return authService.validateToken(token);
    }
}
