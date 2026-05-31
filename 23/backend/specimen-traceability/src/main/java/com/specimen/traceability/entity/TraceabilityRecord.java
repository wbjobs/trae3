package com.specimen.traceability.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.specimen.common.entity.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("traceability_record")
public class TraceabilityRecord extends TenantEntity {
    private Long specimenId;
    private Integer operationType;
    private Long operatorId;
    private String operatorName;
    private LocalDateTime operationTime;
    private String location;
    private String remark;
    @TableField(value = "before_data", typeHandler = com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler.class)
    private Object beforeData;
    @TableField(value = "after_data", typeHandler = com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler.class)
    private Object afterData;
    private String ipAddress;
    private String userAgent;
}
