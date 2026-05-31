package com.specimen.data.vo;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class SpecimenListVO {
    private Long id;
    private String specimenNo;
    private String name;
    private Integer type;
    private String typeName;
    private String classification;
    private String location;
    private BigDecimal longitude;
    private BigDecimal latitude;
    private String collector;
    private LocalDateTime collectTime;
    private Integer status;
    private String tags;
    private String coverImageUrl;
    private LocalDateTime createTime;
}
