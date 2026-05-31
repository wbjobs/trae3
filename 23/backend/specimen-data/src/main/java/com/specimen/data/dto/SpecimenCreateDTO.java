package com.specimen.data.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Data
public class SpecimenCreateDTO {
    private String specimenNo;
    private String name;
    private Integer type;
    private String classification;
    private String description;
    private String location;
    private BigDecimal longitude;
    private BigDecimal latitude;
    private String collector;
    private LocalDateTime collectTime;
    private String storageMethod;
    private Integer status;
    private List<String> tags;
    private String customFields;
    private Long fileId;
    private List<Long> imageFileIds;
}
