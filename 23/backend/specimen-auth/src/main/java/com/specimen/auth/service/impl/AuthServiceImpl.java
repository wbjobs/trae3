package com.specimen.auth.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.specimen.auth.dto.LoginDTO;
import com.specimen.auth.dto.RegisterDTO;
import com.specimen.auth.entity.SysRole;
import com.specimen.auth.entity.SysTenant;
import com.specimen.auth.entity.SysUser;
import com.specimen.auth.mapper.SysUserMapper;
import com.specimen.auth.service.AuthService;
import com.specimen.auth.service.SysRoleService;
import com.specimen.auth.service.SysTenantService;
import com.specimen.auth.vo.TokenVO;
import com.specimen.common.constants.SecurityConstants;
import com.specimen.common.context.TenantContext;
import com.specimen.common.exception.BusinessException;
import com.specimen.common.utils.JwtUtil;
import com.specimen.common.utils.PasswordUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
public class AuthServiceImpl extends ServiceImpl<SysUserMapper, SysUser> implements AuthService {

    private final SysTenantService sysTenantService;
    private final SysRoleService sysRoleService;
    private final StringRedisTemplate stringRedisTemplate;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public TokenVO login(LoginDTO loginDTO) {
        SysTenant tenant = sysTenantService.getOne(
            new LambdaQueryWrapper<SysTenant>()
                .eq(SysTenant::getCode, loginDTO.getTenantCode())
        );
        if (tenant == null) {
            throw new BusinessException("租户不存在");
        }
        if (tenant.getStatus() != 1) {
            throw new BusinessException("租户已被禁用");
        }
        if (tenant.getExpireTime() != null && tenant.getExpireTime().isBefore(LocalDateTime.now())) {
            throw new BusinessException("租户已过期");
        }

        TenantContext.setTenantId(tenant.getId());
        SysUser user = getOne(
            new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getUsername, loginDTO.getUsername())
        );
        if (user == null) {
            throw new BusinessException("用户名或密码错误");
        }
        if (user.getStatus() != 1) {
            throw new BusinessException("用户已被禁用");
        }
        if (!PasswordUtil.matches(loginDTO.getPassword(), user.getPassword())) {
            throw new BusinessException("用户名或密码错误");
        }

        String token = JwtUtil.generateToken(user.getId(), user.getUsername(), tenant.getId());
        long expiresIn = SecurityConstants.EXPIRATION / 1000;
        stringRedisTemplate.opsForValue().set(
            "auth:token:" + token,
            user.getId().toString(),
            SecurityConstants.EXPIRATION,
            TimeUnit.MILLISECONDS
        );

        return TokenVO.builder()
            .accessToken(token)
            .tokenType("Bearer")
            .expiresIn(expiresIn)
            .userId(user.getId())
            .username(user.getUsername())
            .tenantId(tenant.getId())
            .tenantName(tenant.getName())
            .build();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void register(RegisterDTO registerDTO) {
        SysTenant existingTenant = sysTenantService.getOne(
            new LambdaQueryWrapper<SysTenant>()
                .eq(SysTenant::getCode, registerDTO.getTenantCode())
        );
        if (existingTenant != null) {
            throw new BusinessException("租户编码已存在");
        }

        SysTenant tenant = new SysTenant();
        tenant.setName(registerDTO.getTenantName());
        tenant.setCode(registerDTO.getTenantCode());
        tenant.setStatus(1);
        tenant.setContactName(registerDTO.getNickname());
        sysTenantService.save(tenant);

        TenantContext.setTenantId(tenant.getId());
        SysUser existingUser = getOne(
            new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getUsername, registerDTO.getUsername())
        );
        if (existingUser != null) {
            throw new BusinessException("用户名已存在");
        }

        SysRole adminRole = new SysRole();
        adminRole.setTenantId(tenant.getId());
        adminRole.setName("管理员");
        adminRole.setCode("ADMIN");
        adminRole.setDescription("租户管理员角色");
        adminRole.setStatus(1);
        sysRoleService.save(adminRole);

        SysUser user = new SysUser();
        user.setTenantId(tenant.getId());
        user.setUsername(registerDTO.getUsername());
        user.setPassword(PasswordUtil.encode(registerDTO.getPassword()));
        user.setNickname(registerDTO.getNickname());
        user.setEmail(registerDTO.getEmail());
        user.setStatus(1);
        user.setRoleIds(adminRole.getId().toString());
        save(user);
    }

    @Override
    public void logout() {
        String token = TenantContext.getUsername();
        if (token != null) {
            stringRedisTemplate.delete("auth:token:" + token);
        }
        TenantContext.clear();
    }

    @Override
    public SysUser getUserInfo() {
        Long userId = TenantContext.getUserId();
        if (userId == null) {
            throw new BusinessException("用户未登录");
        }
        return getById(userId);
    }
}
