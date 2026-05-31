package com.ancient.platform.search.dto;

import lombok.Data;

@Data
public class SearchRequest {

    private String keyword;

    private Long projectId;

    private String dynasty;

    private String author;

    private Integer pageNum = 1;

    private Integer pageSize = 10;
}
