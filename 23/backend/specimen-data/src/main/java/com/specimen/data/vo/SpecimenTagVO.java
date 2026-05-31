package com.specimen.data.vo;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class SpecimenTagVO {
    private Long id;
    private Long tenantId;
    private String name;
    private String color;
    private String description;
    private Integer count;
    private LocalDateTime createTime;
}
