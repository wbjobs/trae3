package com.specimen.data.dto;

import lombok.Data;

@Data
public class AnnotationQueryDTO {
    private Integer page = 1;
    private Integer size = 10;
    private Long specimenId;
    private Long imageId;
    private Integer annotationType;
    private String label;
    private Integer status;
    private Long annotatorId;
}
