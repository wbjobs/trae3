package com.specimen.data.dto;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class AnnotationCreateDTO {
    private Long specimenId;
    private Long imageId;
    private Integer annotationType;
    private String label;
    private BigDecimal confidence;
    private String coordinates;
    private String color;
    private String note;
}
