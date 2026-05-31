package com.research.sample.validation.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ValidationResult {

    private boolean valid;
    private String fieldName;
    private String errorMessage;
    private String ruleCode;
}
