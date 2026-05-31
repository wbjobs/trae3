package com.smartmeter.common.exception;

import lombok.Getter;

@Getter
public class BusinessException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final int code;

    private final String errorType;

    public BusinessException(String message) {
        super(message);
        this.code = 500;
        this.errorType = "BUSINESS_ERROR";
    }

    public BusinessException(int code, String message) {
        super(message);
        this.code = code;
        this.errorType = "BUSINESS_ERROR";
    }

    public BusinessException(int code, String errorType, String message) {
        super(message);
        this.code = code;
        this.errorType = errorType;
    }

    public BusinessException(String errorType, String message) {
        super(message);
        this.code = 400;
        this.errorType = errorType;
    }
}
