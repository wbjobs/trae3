package com.specimen.data.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.specimen.common.entity.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("specimen_annotation")
public class SpecimenAnnotation extends TenantEntity {
    private Long specimenId;
    private Long imageId;
    private Integer annotationType;
    private String label;
    private BigDecimal confidence;
    private String coordinates;
    private String color;
    private String note;
    private Long annotatorId;
    private String annotatorName;
    private LocalDateTime annotationTime;
    private Integer status;
}
