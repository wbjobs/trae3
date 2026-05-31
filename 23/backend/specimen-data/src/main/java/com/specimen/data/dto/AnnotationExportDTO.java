package com.specimen.data.dto;

import lombok.Data;

import java.util.List;

@Data
public class AnnotationExportDTO {
    private List<Long> specimenIds;
    private Long specimenId;
    private Long imageId;
    private String format;
}
