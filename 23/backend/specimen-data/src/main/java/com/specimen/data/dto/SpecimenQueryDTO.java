package com.specimen.data.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class SpecimenQueryDTO {
    private Integer page = 1;
    private Integer size = 10;
    private Integer type;
    private String keyword;
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private BigDecimal minLongitude;
    private BigDecimal maxLongitude;
    private BigDecimal minLatitude;
    private BigDecimal maxLatitude;
    private Integer status;
    private String tag;
    private String collector;
}
