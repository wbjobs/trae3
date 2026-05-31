package com.specimen.data.vo;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Data
public class SpecimenVO {
    private Long id;
    private Long tenantId;
    private String specimenNo;
    private String name;
    private Integer type;
    private String typeName;
    private String classification;
    private String description;
    private String location;
    private BigDecimal longitude;
    private BigDecimal latitude;
    private String collector;
    private LocalDateTime collectTime;
    private String storageMethod;
    private Integer status;
    private String tags;
    private String customFields;
    private Long fileId;
    private String fileUrl;
    private List<SpecimenImageVO> images;
    private Long createBy;
    private LocalDateTime createTime;
    private Long updateBy;
    private LocalDateTime updateTime;
}
