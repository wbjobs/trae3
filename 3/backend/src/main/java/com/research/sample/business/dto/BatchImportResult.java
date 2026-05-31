package com.research.sample.business.dto;

import lombok.Data;

import java.util.List;

@Data
public class BatchImportResult {

    private int totalCount;
    private int successCount;
    private int failCount;
    private List<String> errors;
    private long elapsedMs;
}
