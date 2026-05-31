package com.ancient.platform.auth.service;

import com.ancient.platform.auth.entity.SysPermission;
import com.ancient.platform.auth.mapper.SysPermissionMapper;
import com.ancient.platform.common.result.Result;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 权限服务
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PermissionService {

    private final SysPermissionMapper sysPermissionMapper;

    public Result<List<SysPermission>> getPermissionTree() {
        LambdaQueryWrapper<SysPermission> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysPermission::getStatus, 1);
        wrapper.orderByAsc(SysPermission::getId);
        List<SysPermission> allPermissions = sysPermissionMapper.selectList(wrapper);

        List<SysPermission> tree = buildTree(allPermissions, 0L);
        return Result.success(tree);
    }

    private List<SysPermission> buildTree(List<SysPermission> all, Long parentId) {
        Map<Long, List<SysPermission>> grouped = all.stream()
                .collect(Collectors.groupingBy(p -> p.getParentId() != null ? p.getParentId() : 0L));

        List<SysPermission> roots = grouped.getOrDefault(parentId, new ArrayList<>());
        return roots;
    }
}
