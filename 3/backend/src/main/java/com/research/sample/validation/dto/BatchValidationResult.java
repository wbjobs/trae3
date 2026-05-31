package com.research.sample.validation.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class BatchValidationResult {

    private String sampleCode;
    private boolean valid;
    private List<ValidationResult> results;
    private int totalErrors;
}
