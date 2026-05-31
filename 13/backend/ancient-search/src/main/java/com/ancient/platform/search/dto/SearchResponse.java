package com.ancient.platform.search.dto;

import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
public class SearchResponse {

    private Long totalHits;

    private Integer pageNum;

    private Integer pageSize;

    private List<SearchHit> records;

    private Map<String, List<AggregationItem>> aggregations;

    @Data
    public static class SearchHit {

        private String id;

        private Long pageId;

        private Long projectId;

        private String projectName;

        private Integer pageNumber;

        private String recognizedText;

        private String collatedText;

        private String normalizedText;

        private String dynasty;

        private String author;

        private Integer status;

        private Integer currentVersion;

        private java.time.LocalDateTime lastEditTime;

        private Map<String, List<String>> highlights;
    }

    @Data
    public static class AggregationItem {

        private String key;

        private Long count;
    }
}
