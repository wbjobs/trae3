package com.specimen.auth.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.specimen.common.entity.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("sys_role")
public class SysRole extends TenantEntity {

    private String name;

    private String code;

    private String description;

    private Integer status;
}
