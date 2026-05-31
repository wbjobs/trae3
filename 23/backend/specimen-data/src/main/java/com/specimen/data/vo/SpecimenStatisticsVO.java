package com.specimen.data.vo;

import lombok.Data;
import java.util.Map;

@Data
public class SpecimenStatisticsVO {
    private Long totalCount;
    private Long todayNewCount;
    private Long weekNewCount;
    private Long monthNewCount;
    private Map<String, Long> typeCount;
    private Map<String, Long> statusCount;
    private Long annotationCount;
    private Long unAnnotatedCount;
}
