package com.specimen.traceability.dto;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class TraceabilityQueryDTO {
    private Long specimenId;
    private Integer operationType;
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private Long operatorId;
    private String operatorName;
    private Integer pageNum = 1;
    private Integer pageSize = 10;
}
