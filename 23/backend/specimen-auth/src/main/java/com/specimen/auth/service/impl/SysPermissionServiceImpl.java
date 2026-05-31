package com.specimen.auth.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.specimen.auth.entity.SysPermission;
import com.specimen.auth.mapper.SysPermissionMapper;
import com.specimen.auth.service.SysPermissionService;
import org.springframework.stereotype.Service;

@Service
public class SysPermissionServiceImpl extends ServiceImpl<SysPermissionMapper, SysPermission> implements SysPermissionService {
}
