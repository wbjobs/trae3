package com.specimen.traceability.dto;

import lombok.Data;
import java.time.LocalDateTime;
import java.util.List;

@Data
public class TraceabilitySearchDTO {
    private String keyword;
    private Integer specimenType;
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private Double minLongitude;
    private Double maxLongitude;
    private Double minLatitude;
    private Double maxLatitude;
    private List<String> tags;
    private Integer pageNum = 1;
    private Integer pageSize = 10;
}
