package com.specimen.data.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.specimen.common.entity.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("specimen")
public class Specimen extends TenantEntity {
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
    private String tags;
    private String customFields;
    private Long fileId;
}
