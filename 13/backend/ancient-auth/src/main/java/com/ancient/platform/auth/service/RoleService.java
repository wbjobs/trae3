package com.ancient.platform.auth.service;

import com.ancient.platform.auth.dto.RoleCreateRequest;
import com.ancient.platform.auth.dto.RoleUpdateRequest;
import com.ancient.platform.auth.entity.SysRole;
import com.ancient.platform.auth.entity.SysRolePermission;
import com.ancient.platform.auth.mapper.SysRoleMapper;
import com.ancient.platform.auth.mapper.SysRolePermissionMapper;
import com.ancient.platform.common.result.Result;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 角色服务
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RoleService {

    private final SysRoleMapper sysRoleMapper;
    private final SysRolePermissionMapper sysRolePermissionMapper;

    public Result<Page<SysRole>> listRoles(int pageNum, int pageSize) {
        Page<SysRole> page = new Page<>(pageNum, pageSize);
        LambdaQueryWrapper<SysRole> wrapper = new LambdaQueryWrapper<>();
        wrapper.orderByAsc(SysRole::getSort);
        Page<SysRole> result = sysRoleMapper.selectPage(page, wrapper);
        return Result.success(result);
    }

    public Result<SysRole> getRoleById(Long id) {
        SysRole role = sysRoleMapper.selectById(id);
        if (role == null) {
            return Result.error("角色不存在");
        }
        return Result.success(role);
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<SysRole> createRole(RoleCreateRequest request) {
        LambdaQueryWrapper<SysRole> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysRole::getCode, request.getCode());
        if (sysRoleMapper.selectCount(wrapper) > 0) {
            return Result.error("角色编码已存在");
        }

        SysRole role = new SysRole();
        role.setName(request.getName());
        role.setCode(request.getCode());
        role.setDescription(request.getDescription());
        role.setSort(request.getSort() != null ? request.getSort() : 0);
        role.setStatus(request.getStatus() != null ? request.getStatus() : 1);
        sysRoleMapper.insert(role);
        return Result.success(role);
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<SysRole> updateRole(Long id, RoleUpdateRequest request) {
        SysRole role = sysRoleMapper.selectById(id);
        if (role == null) {
            return Result.error("角色不存在");
        }

        if (request.getName() != null) {
            role.setName(request.getName());
        }
        if (request.getCode() != null) {
            LambdaQueryWrapper<SysRole> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(SysRole::getCode, request.getCode());
            wrapper.ne(SysRole::getId, id);
            if (sysRoleMapper.selectCount(wrapper) > 0) {
                return Result.error("角色编码已存在");
            }
            role.setCode(request.getCode());
        }
        if (request.getDescription() != null) {
            role.setDescription(request.getDescription());
        }
        if (request.getSort() != null) {
            role.setSort(request.getSort());
        }
        if (request.getStatus() != null) {
            role.setStatus(request.getStatus());
        }
        sysRoleMapper.updateById(role);
        return Result.success(role);
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<Void> deleteRole(Long id) {
        SysRole role = sysRoleMapper.selectById(id);
        if (role == null) {
            return Result.error("角色不存在");
        }
        sysRoleMapper.deleteById(id);
        return Result.success();
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<Void> assignPermissions(Long roleId, List<Long> permissionIds) {
        SysRole role = sysRoleMapper.selectById(roleId);
        if (role == null) {
            return Result.error("角色不存在");
        }

        LambdaQueryWrapper<SysRolePermission> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysRolePermission::getRoleId, roleId);
        sysRolePermissionMapper.delete(wrapper);

        for (Long permissionId : permissionIds) {
            SysRolePermission rolePermission = new SysRolePermission();
            rolePermission.setRoleId(roleId);
            rolePermission.setPermissionId(permissionId);
            sysRolePermissionMapper.insert(rolePermission);
        }
        return Result.success();
    }
}
