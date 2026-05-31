package com.specimen.traceability.vo;

import lombok.Data;
import java.util.List;

@Data
public class TraceabilityChainVO {
    private Long specimenId;
    private String specimenNo;
    private String specimenName;
    private Integer specimenType;
    private String specimenTypeName;
    private String classification;
    private String description;
    private String location;
    private String collector;
    private String collectTime;
    private List<String> tags;
    private List<TraceabilityRecordVO> records;
}
