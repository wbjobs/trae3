package com.specimen.auth.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.specimen.common.entity.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;
import java.time.LocalDateTime;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("sys_tenant")
public class SysTenant extends BaseEntity {

    private String name;

    private String code;

    private Integer status;

    private LocalDateTime expireTime;

    private String contactName;

    private String contactPhone;
}
