package com.specimen.data.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.specimen.common.entity.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("specimen_tag")
public class SpecimenTag extends TenantEntity {
    private String name;
    private String color;
    private String description;
    private Integer count;
}
