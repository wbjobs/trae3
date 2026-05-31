package com.research.sample.business.dto;

import lombok.Data;

import java.time.LocalDate;

@Data
public class SampleQueryRequest {

    private String sampleCode;

    private String sampleName;

    private String sampleType;

    private String status;

    private String department;

    private LocalDate collectionDateStart;

    private LocalDate collectionDateEnd;

    private int page = 0;

    private int size = 20;
}
