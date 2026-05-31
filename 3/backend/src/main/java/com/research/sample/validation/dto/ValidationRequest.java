package com.research.sample.validation.dto;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ValidationRequest {

    private String fieldName;
    private Object fieldValue;
    private String sampleCode;
}
