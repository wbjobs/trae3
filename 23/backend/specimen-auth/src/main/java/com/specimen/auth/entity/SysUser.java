package com.specimen.auth.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.specimen.common.entity.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("sys_user")
public class SysUser extends TenantEntity {

    private String username;

    private String password;

    private String nickname;

    private String email;

    private String phone;

    private String avatar;

    private Integer status;

    private String roleIds;
}
