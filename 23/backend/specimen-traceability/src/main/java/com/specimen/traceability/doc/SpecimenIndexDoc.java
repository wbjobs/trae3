package com.specimen.traceability.doc;

import lombok.Data;
import java.time.LocalDateTime;
import java.util.List;

@Data
public class SpecimenIndexDoc {
    private Long specimenId;
    private Long tenantId;
    private String specimenNo;
    private String name;
    private Integer type;
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
}
