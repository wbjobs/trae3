package com.specimen.data.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.specimen.common.entity.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("specimen_image")
public class SpecimenImage extends TenantEntity {
    private Long specimenId;
    private Long fileId;
    private String imageUrl;
    private String objectName;
    private Integer imageType;
    private Integer sort;
    private String description;
}
