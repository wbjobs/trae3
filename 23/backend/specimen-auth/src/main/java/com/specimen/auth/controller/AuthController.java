package com.specimen.auth.controller;

import com.specimen.auth.dto.LoginDTO;
import com.specimen.auth.dto.RegisterDTO;
import com.specimen.auth.entity.SysUser;
import com.specimen.auth.service.AuthService;
import com.specimen.auth.vo.TokenVO;
import com.specimen.common.annotation.TenantIgnore;
import com.specimen.common.result.Result;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@Tag(name = "认证管理", description = "用户认证相关接口")
@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @TenantIgnore
    @Operation(summary = "用户登录")
    @PostMapping("/login")
    public Result<TokenVO> login(@Valid @RequestBody LoginDTO loginDTO) {
        return Result.success(authService.login(loginDTO));
    }

    @TenantIgnore
    @Operation(summary = "用户注册")
    @PostMapping("/register")
    public Result<Void> register(@Valid @RequestBody RegisterDTO registerDTO) {
        authService.register(registerDTO);
        return Result.success();
    }

    @Operation(summary = "用户登出")
    @PostMapping("/logout")
    public Result<Void> logout() {
        authService.logout();
        return Result.success();
    }

    @Operation(summary = "获取用户信息")
    @GetMapping("/user-info")
    public Result<SysUser> getUserInfo() {
        return Result.success(authService.getUserInfo());
    }
}
