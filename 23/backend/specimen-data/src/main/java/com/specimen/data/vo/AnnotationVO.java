package com.specimen.data.vo;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class AnnotationVO {
    private Long id;
    private Long tenantId;
    private Long specimenId;
    private Long imageId;
    private Integer annotationType;
    private String annotationTypeName;
    private String label;
    private BigDecimal confidence;
    private String coordinates;
    private String color;
    private String note;
    private Long annotatorId;
    private String annotatorName;
    private LocalDateTime annotationTime;
    private Integer status;
    private LocalDateTime createTime;
}
