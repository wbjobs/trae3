package com.smartmeter.gateway.exception;

import com.alibaba.fastjson.JSON;
import com.smartmeter.common.constant.ErrorConstants;
import com.smartmeter.common.exception.BusinessException;
import com.smartmeter.common.result.Result;
import com.smartmeter.common.dto.AbnormalDataLog;
import com.smartmeter.gateway.service.AbnormalDataLogService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.validation.BindException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.NoHandlerFoundException;

import javax.servlet.http.HttpServletRequest;
import java.util.concurrent.atomic.AtomicLong;

@Slf4j
@RestControllerAdvice(basePackages = "com.smartmeter.gateway")
public class GlobalExceptionHandler {

    private final AtomicLong errorCounter = new AtomicLong(0);

    @Autowired
    private AbnormalDataLogService abnormalDataLogService;

    @ExceptionHandler(BusinessException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Result<Void> handleBusinessException(BusinessException e, HttpServletRequest request) {
        log.warn("[BusinessException] code={}, type={}, msg={}, path={}",
                e.getCode(), e.getErrorType(), e.getMessage(), request.getRequestURI());

        abnormalDataLogService.recordAbnormalData(
                null, null, null,
                e.getErrorType(), e.getMessage(), request);

        return Result.fail(e.getCode(), e.getMessage());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Result<Void> handleIllegalArgumentException(IllegalArgumentException e, HttpServletRequest request) {
        log.warn("[IllegalArgumentException] msg={}, path={}", e.getMessage(), request.getRequestURI());

        String errorType = ErrorConstants.ERROR_TYPE_DATA_VALIDATION;
        if (e.getMessage() != null) {
            if (e.getMessage().contains("protocol") || e.getMessage().contains("Protocol")) {
                errorType = ErrorConstants.ERROR_TYPE_PROTOCOL_PARSE;
            } else if (e.getMessage().contains("CRC") || e.getMessage().contains("checksum")) {
                errorType = ErrorConstants.ERROR_TYPE_CRC_CHECK;
            } else if (e.getMessage().contains("length") || e.getMessage().contains("Length")) {
                errorType = ErrorConstants.ERROR_TYPE_DATA_LENGTH;
            } else if (e.getMessage().contains("frame") || e.getMessage().contains("Frame")) {
                errorType = ErrorConstants.ERROR_TYPE_FRAME_FORMAT;
            }
        }

        abnormalDataLogService.recordAbnormalData(
                null, null, null,
                errorType, e.getMessage(), request);

        return Result.fail(ErrorConstants.CODE_BAD_REQUEST, e.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Result<Void> handleValidationException(MethodArgumentNotValidException e, HttpServletRequest request) {
        String message = e.getBindingResult().getFieldErrors().stream()
                .map(error -> error.getField() + ": " + error.getDefaultMessage())
                .reduce((a, b) -> a + "; " + b)
                .orElse("Validation failed");

        log.warn("[ValidationException] msg={}, path={}", message, request.getRequestURI());

        abnormalDataLogService.recordAbnormalData(
                null, null, null,
                ErrorConstants.ERROR_TYPE_DATA_VALIDATION, message, request);

        return Result.fail(ErrorConstants.CODE_BAD_REQUEST, message);
    }

    @ExceptionHandler(BindException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Result<Void> handleBindException(BindException e, HttpServletRequest request) {
        String message = e.getFieldErrors().stream()
                .map(error -> error.getField() + ": " + error.getDefaultMessage())
                .reduce((a, b) -> a + "; " + b)
                .orElse("Binding failed");

        abnormalDataLogService.recordAbnormalData(
                null, null, null,
                ErrorConstants.ERROR_TYPE_DATA_VALIDATION, message, request);

        return Result.fail(ErrorConstants.CODE_BAD_REQUEST, message);
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Result<Void> handleMissingParamException(MissingServletRequestParameterException e, HttpServletRequest request) {
        String message = "Missing parameter: " + e.getParameterName();

        abnormalDataLogService.recordAbnormalData(
                null, null, null,
                ErrorConstants.ERROR_TYPE_DATA_VALIDATION, message, request);

        return Result.fail(ErrorConstants.CODE_BAD_REQUEST, message);
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    @ResponseStatus(HttpStatus.METHOD_NOT_ALLOWED)
    public Result<Void> handleMethodNotSupported(HttpRequestMethodNotSupportedException e, HttpServletRequest request) {
        return Result.fail(405, "Method not supported: " + e.getMethod());
    }

    @ExceptionHandler(NoHandlerFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public Result<Void> handleNotFoundException(NoHandlerFoundException e, HttpServletRequest request) {
        return Result.fail(404, "API not found: " + e.getRequestURL());
    }

    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public Result<Void> handleGenericException(Exception e, HttpServletRequest request) {
        long errorId = errorCounter.incrementAndGet();
        log.error("[UnhandledException#{}] path={}, error={}", errorId, request.getRequestURI(), e.getMessage(), e);

        abnormalDataLogService.recordAbnormalData(
                null, null, null,
                "UNHANDLED_ERROR", "Error#" + errorId + ": " + e.getMessage(), request);

        return Result.fail(ErrorConstants.CODE_SERVER_ERROR,
                "Internal server error, reference: #" + errorId);
    }
}
