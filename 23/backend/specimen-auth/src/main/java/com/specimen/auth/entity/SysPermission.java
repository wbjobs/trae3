package com.specimen.auth.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.specimen.common.entity.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("sys_permission")
public class SysPermission extends TenantEntity {

    private String name;

    private String code;

    private Integer type;

    private Long parentId;

    private String path;

    private String component;

    private String icon;

    private Integer sort;
}
