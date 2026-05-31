package com.ancient.platform.auth.controller;

import com.ancient.platform.auth.dto.RoleCreateRequest;
import com.ancient.platform.auth.dto.RoleUpdateRequest;
import com.ancient.platform.auth.entity.SysPermission;
import com.ancient.platform.auth.entity.SysRole;
import com.ancient.platform.auth.service.PermissionService;
import com.ancient.platform.auth.service.RoleService;
import com.ancient.platform.common.result.Result;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 管理员角色控制器
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminRoleController {

    private final RoleService roleService;
    private final PermissionService permissionService;

    @GetMapping("/roles")
    public Result<Page<SysRole>> listRoles(
            @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "10") int pageSize) {
        return roleService.listRoles(pageNum, pageSize);
    }

    @PostMapping("/roles")
    public Result<SysRole> createRole(@Valid @RequestBody RoleCreateRequest request) {
        return roleService.createRole(request);
    }

    @GetMapping("/roles/{id}")
    public Result<SysRole> getRole(@PathVariable Long id) {
        return roleService.getRoleById(id);
    }

    @PutMapping("/roles/{id}")
    public Result<SysRole> updateRole(@PathVariable Long id, @RequestBody RoleUpdateRequest request) {
        return roleService.updateRole(id, request);
    }

    @DeleteMapping("/roles/{id}")
    public Result<Void> deleteRole(@PathVariable Long id) {
        return roleService.deleteRole(id);
    }

    @GetMapping("/permissions")
    public Result<List<SysPermission>> getPermissions() {
        return permissionService.getPermissionTree();
    }

    @PutMapping("/roles/{id}/permissions")
    public Result<Void> assignPermissions(@PathVariable Long id, @RequestBody Map<String, List<Long>> body) {
        List<Long> permissionIds = body.get("permissionIds");
        return roleService.assignPermissions(id, permissionIds);
    }
}
