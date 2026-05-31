package com.specimen.traceability.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.specimen.common.entity.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("traceability_index")
public class TraceabilityIndex extends TenantEntity {
    private Long specimenId;
    private String indexType;
    private String indexValue;
    private Integer weight;
}
