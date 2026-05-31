package com.specimen.data.vo;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class SpecimenImageVO {
    private Long id;
    private Long tenantId;
    private Long specimenId;
    private Long fileId;
    private String imageUrl;
    private String previewUrl;
    private Integer imageType;
    private String imageTypeName;
    private Integer sort;
    private String description;
    private Long createBy;
    private LocalDateTime createTime;
}
