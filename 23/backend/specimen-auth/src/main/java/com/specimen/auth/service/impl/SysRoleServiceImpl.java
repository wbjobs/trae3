package com.specimen.auth.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.specimen.auth.entity.SysRole;
import com.specimen.auth.mapper.SysRoleMapper;
import com.specimen.auth.service.SysRoleService;
import org.springframework.stereotype.Service;

@Service
public class SysRoleServiceImpl extends ServiceImpl<SysRoleMapper, SysRole> implements SysRoleService {
}
