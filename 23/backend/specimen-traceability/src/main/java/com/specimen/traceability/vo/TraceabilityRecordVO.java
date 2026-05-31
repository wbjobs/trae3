package com.specimen.traceability.vo;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class TraceabilityRecordVO {
    private Long id;
    private Long specimenId;
    private Integer operationType;
    private String operationTypeName;
    private Long operatorId;
    private String operatorName;
    private LocalDateTime operationTime;
    private String location;
    private String remark;
    private Object beforeData;
    private Object afterData;
    private String ipAddress;
    private String userAgent;
    private LocalDateTime createTime;
}
