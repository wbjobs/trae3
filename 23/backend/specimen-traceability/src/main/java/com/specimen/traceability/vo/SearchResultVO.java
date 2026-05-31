package com.specimen.traceability.vo;

import lombok.Data;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Data
public class SearchResultVO {
    private Long specimenId;
    private String specimenNo;
    private String name;
    private Integer type;
    private String typeName;
    private String classification;
    private String description;
    private String location;
    private Double longitude;
    private Double latitude;
    private String collector;
    private LocalDateTime collectTime;
    private List<String> tags;
    private List<String> annotations;
    private LocalDateTime createTime;
    private Map<String, String> highlightFields;
    private Float score;
}
