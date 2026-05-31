package com.specimen.data.dto;

import lombok.Data;
import java.util.List;

@Data
public class AnnotationBatchCreateDTO {
    private Long specimenId;
    private Long imageId;
    private List<AnnotationCreateDTO> annotations;
}
