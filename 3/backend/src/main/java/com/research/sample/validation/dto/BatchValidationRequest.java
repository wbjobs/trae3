package com.research.sample.validation.dto;

import lombok.Getter;
import lombok.Setter;

import java.util.Map;

@Getter
@Setter
public class BatchValidationRequest {

    private String sampleCode;
    private Map<String, Object> fields;
}
