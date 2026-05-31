package com.research.sample.business.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
public class SampleCreateRequest {

    @NotNull
    private String sampleCode;

    @NotNull
    private String sampleName;

    private String sampleType;

    private String source;

    private LocalDate collectionDate;

    private String storageLocation;

    private BigDecimal volume;

    private String unit;

    private String description;

    private String department;
}
