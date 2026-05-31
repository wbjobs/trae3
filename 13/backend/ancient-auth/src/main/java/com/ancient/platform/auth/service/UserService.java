package com.ancient.platform.auth.service;

import cn.hutool.crypto.SecureUtil;
import com.ancient.platform.auth.dto.UserCreateRequest;
import com.ancient.platform.auth.dto.UserUpdateRequest;
import com.ancient.platform.auth.entity.SysUser;
import com.ancient.platform.auth.entity.SysUserRole;
import com.ancient.platform.auth.mapper.SysUserMapper;
import com.ancient.platform.auth.mapper.SysUserRoleMapper;
import com.ancient.platform.common.result.Result;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

/**
 * 用户服务
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class UserService {

    private final SysUserMapper sysUserMapper;
    private final SysUserRoleMapper sysUserRoleMapper;

    public Result<Page<SysUser>> listUsers(int pageNum, int pageSize) {
        Page<SysUser> page = new Page<>(pageNum, pageSize);
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<>();
        wrapper.orderByDesc(SysUser::getCreateTime);
        Page<SysUser> result = sysUserMapper.selectPage(page, wrapper);
        result.getRecords().forEach(u -> u.setPassword(null));
        return Result.success(result);
    }

    public Result<SysUser> getUserById(Long id) {
        SysUser user = sysUserMapper.selectById(id);
        if (user == null) {
            return Result.error("用户不存在");
        }
        user.setPassword(null);
        return Result.success(user);
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<SysUser> createUser(UserCreateRequest request) {
        SysUser exists = sysUserMapper.findByUsername(request.getUsername());
        if (exists != null) {
            return Result.error("用户名已存在");
        }

        SysUser user = new SysUser();
        user.setUsername(request.getUsername());
        user.setPassword(SecureUtil.md5(request.getPassword()));
        user.setNickname(request.getNickname());
        user.setAvatar(request.getAvatar());
        user.setEmail(request.getEmail());
        user.setPhone(request.getPhone());
        user.setGender(request.getGender());
        user.setStatus(request.getStatus() != null ? request.getStatus() : 1);
        user.setDeleted(0);
        sysUserMapper.insert(user);

        user.setPassword(null);
        return Result.success(user);
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<SysUser> updateUser(Long id, UserUpdateRequest request) {
        SysUser user = sysUserMapper.selectById(id);
        if (user == null) {
            return Result.error("用户不存在");
        }

        if (request.getNickname() != null) {
            user.setNickname(request.getNickname());
        }
        if (request.getAvatar() != null) {
            user.setAvatar(request.getAvatar());
        }
        if (request.getEmail() != null) {
            user.setEmail(request.getEmail());
        }
        if (request.getPhone() != null) {
            user.setPhone(request.getPhone());
        }
        if (request.getGender() != null) {
            user.setGender(request.getGender());
        }
        if (request.getStatus() != null) {
            user.setStatus(request.getStatus());
        }
        sysUserMapper.updateById(user);

        user.setPassword(null);
        return Result.success(user);
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<Void> deleteUser(Long id) {
        SysUser user = sysUserMapper.selectById(id);
        if (user == null) {
            return Result.error("用户不存在");
        }
        sysUserMapper.deleteById(id);
        return Result.success();
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<Void> resetPassword(Long id, String newPassword) {
        SysUser user = sysUserMapper.selectById(id);
        if (user == null) {
            return Result.error("用户不存在");
        }
        user.setPassword(SecureUtil.md5(newPassword));
        sysUserMapper.updateById(user);
        return Result.success();
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<Void> updateUserStatus(Long id, Integer status) {
        SysUser user = sysUserMapper.selectById(id);
        if (user == null) {
            return Result.error("用户不存在");
        }
        user.setStatus(status);
        sysUserMapper.updateById(user);
        return Result.success();
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<Void> assignRoles(Long userId, List<Long> roleIds) {
        SysUser user = sysUserMapper.selectById(userId);
        if (user == null) {
            return Result.error("用户不存在");
        }

        LambdaQueryWrapper<SysUserRole> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysUserRole::getUserId, userId);
        sysUserRoleMapper.delete(wrapper);

        for (Long roleId : roleIds) {
            SysUserRole userRole = new SysUserRole();
            userRole.setUserId(userId);
            userRole.setRoleId(roleId);
            sysUserRoleMapper.insert(userRole);
        }
        return Result.success();
    }
}
