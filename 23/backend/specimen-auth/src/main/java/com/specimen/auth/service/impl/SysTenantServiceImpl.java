package com.specimen.auth.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.specimen.auth.entity.SysTenant;
import com.specimen.auth.mapper.SysTenantMapper;
import com.specimen.auth.service.SysTenantService;
import org.springframework.stereotype.Service;

@Service
public class SysTenantServiceImpl extends ServiceImpl<SysTenantMapper, SysTenant> implements SysTenantService {
}
