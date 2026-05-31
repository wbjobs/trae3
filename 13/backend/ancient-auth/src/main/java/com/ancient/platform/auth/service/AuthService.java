package com.ancient.platform.auth.service;

import cn.hutool.core.util.StrUtil;
import cn.hutool.crypto.SecureUtil;
import com.ancient.platform.auth.dto.*;
import com.ancient.platform.auth.entity.SysUser;
import com.ancient.platform.auth.entity.SysUserRole;
import com.ancient.platform.auth.mapper.SysUserMapper;
import com.ancient.platform.auth.mapper.SysUserRoleMapper;
import com.ancient.platform.common.config.JwtConfig;
import com.ancient.platform.common.result.Result;
import com.ancient.platform.common.utils.JwtUtils;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 认证服务
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final SysUserMapper sysUserMapper;
    private final SysUserRoleMapper sysUserRoleMapper;
    private final JwtUtils jwtUtils;
    private final JwtConfig jwtConfig;

    public Result<LoginResponse> login(LoginRequest request) {
        SysUser user = sysUserMapper.findByUsername(request.getUsername());
        if (user == null) {
            return Result.error("用户不存在");
        }
        if (user.getStatus() != 1) {
            return Result.error("用户已被禁用");
        }
        if (!StrUtil.equals(user.getPassword(), SecureUtil.md5(request.getPassword()))) {
            return Result.error("密码错误");
        }

        user.setLastLoginTime(LocalDateTime.now());
        sysUserMapper.updateById(user);

        String roles = getUserRolesString(user.getId());
        String accessToken = jwtUtils.generateToken(user.getId(), user.getUsername(), roles);
        String refreshToken = jwtUtils.generateRefreshToken(user.getId(), user.getUsername());

        LoginResponse response = LoginResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .tokenType("Bearer")
                .expiresIn(jwtConfig.getExpire())
                .userInfo(buildUserInfo(user))
                .build();
        return Result.success(response);
    }

    public Result<LoginResponse> refreshToken(String refreshToken) {
        if (jwtUtils.isTokenExpired(refreshToken)) {
            return Result.error("刷新令牌已过期");
        }
        Long userId = jwtUtils.getUserIdFromToken(refreshToken);
        String username = jwtUtils.getUsernameFromToken(refreshToken);
        if (userId == null || username == null) {
            return Result.error("无效的刷新令牌");
        }

        SysUser user = sysUserMapper.selectById(userId);
        if (user == null || user.getStatus() != 1) {
            return Result.error("用户不存在或已被禁用");
        }

        String roles = getUserRolesString(userId);
        String newAccessToken = jwtUtils.generateToken(userId, username, roles);
        String newRefreshToken = jwtUtils.generateRefreshToken(userId, username);

        LoginResponse response = LoginResponse.builder()
                .accessToken(newAccessToken)
                .refreshToken(newRefreshToken)
                .tokenType("Bearer")
                .expiresIn(jwtConfig.getExpire())
                .userInfo(buildUserInfo(user))
                .build();
        return Result.success(response);
    }

    public Result<Void> logout(String token) {
        return Result.success();
    }

    public Result<UserInfoDTO> getCurrentUser(Long userId) {
        SysUser user = sysUserMapper.selectById(userId);
        if (user == null) {
            return Result.error("用户不存在");
        }
        return Result.success(buildUserInfo(user));
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<Void> register(RegisterRequest request) {
        if (!StrUtil.equals(request.getPassword(), request.getConfirmPassword())) {
            return Result.error("两次密码不一致");
        }
        SysUser exists = sysUserMapper.findByUsername(request.getUsername());
        if (exists != null) {
            return Result.error("用户名已存在");
        }

        SysUser user = new SysUser();
        user.setUsername(request.getUsername());
        user.setPassword(SecureUtil.md5(request.getPassword()));
        user.setNickname(StrUtil.isNotBlank(request.getNickname()) ? request.getNickname() : request.getUsername());
        user.setEmail(request.getEmail());
        user.setStatus(1);
        user.setDeleted(0);
        sysUserMapper.insert(user);
        return Result.success();
    }

    private UserInfoDTO buildUserInfo(SysUser user) {
        List<Map<String, Object>> roleMaps = sysUserMapper.findRolesByUserId(user.getId());
        List<String> roleCodes = roleMaps.stream()
                .map(m -> (String) m.get("code"))
                .collect(Collectors.toList());

        List<Map<String, Object>> permMaps = sysUserMapper.findPermissionsByUserId(user.getId());
        List<String> permCodes = permMaps.stream()
                .map(m -> (String) m.get("code"))
                .collect(Collectors.toList());

        return UserInfoDTO.builder()
                .id(user.getId())
                .username(user.getUsername())
                .nickname(user.getNickname())
                .avatar(user.getAvatar())
                .email(user.getEmail())
                .phone(user.getPhone())
                .roles(roleCodes)
                .permissions(permCodes)
                .build();
    }

    private String getUserRolesString(Long userId) {
        List<Map<String, Object>> roleMaps = sysUserMapper.findRolesByUserId(userId);
        return roleMaps.stream()
                .map(m -> (String) m.get("code"))
                .collect(Collectors.joining(","));
    }
}
