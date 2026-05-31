package com.mine.ventilation.common;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class Result<T> implements Serializable {

    private static final long serialVersionUID = 1L;

    private Integer code;
    private String message;
    private T data;
    private String timestamp;
    private Long duration;
    private String traceId;

    public static final int SUCCESS_CODE = 200;
    public static final int ERROR_CODE = 500;
    public static final int BAD_REQUEST_CODE = 400;
    public static final int UNAUTHORIZED_CODE = 401;
    public static final int FORBIDDEN_CODE = 403;
    public static final int NOT_FOUND_CODE = 404;

    public static final String SUCCESS_MESSAGE = "操作成功";
    public static final String ERROR_MESSAGE = "操作失败";

    public Result() {
        this.timestamp = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
    }

    public Result(Integer code, String message, T data) {
        this();
        this.code = code;
        this.message = message;
        this.data = data;
    }

    public static <T> Result<T> success() {
        return new Result<>(SUCCESS_CODE, SUCCESS_MESSAGE, null);
    }

    public static <T> Result<T> success(T data) {
        return new Result<>(SUCCESS_CODE, SUCCESS_MESSAGE, data);
    }

    public static <T> Result<T> success(T data, String message) {
        return new Result<>(SUCCESS_CODE, message, data);
    }

    public static <T> Result<T> success(String message) {
        return new Result<>(SUCCESS_CODE, message, null);
    }

    public static <T> Result<T> error() {
        return new Result<>(ERROR_CODE, ERROR_MESSAGE, null);
    }

    public static <T> Result<T> error(String message) {
        return new Result<>(ERROR_CODE, message, null);
    }

    public static <T> Result<T> error(Integer code, String message) {
        return new Result<>(code, message, null);
    }

    public static <T> Result<T> error(T data, String message) {
        return new Result<>(ERROR_CODE, message, data);
    }

    public static <T> Result<T> badRequest(String message) {
        return new Result<>(BAD_REQUEST_CODE, message, null);
    }

    public static <T> Result<T> unauthorized(String message) {
        return new Result<>(UNAUTHORIZED_CODE, message != null ? message : "未授权访问", null);
    }

    public static <T> Result<T> forbidden(String message) {
        return new Result<>(FORBIDDEN_CODE, message != null ? message : "禁止访问", null);
    }

    public static <T> Result<T> notFound(String message) {
        return new Result<>(NOT_FOUND_CODE, message != null ? message : "资源不存在", null);
    }

    public boolean isSuccess() {
        return this.code != null && this.code == SUCCESS_CODE;
    }

    public boolean isError() {
        return !isSuccess();
    }

    public Integer getCode() {
        return code;
    }

    public Result<T> setCode(Integer code) {
        this.code = code;
        return this;
    }

    public String getMessage() {
        return message;
    }

    public Result<T> setMessage(String message) {
        this.message = message;
        return this;
    }

    public T getData() {
        return data;
    }

    public Result<T> setData(T data) {
        this.data = data;
        return this;
    }

    public String getTimestamp() {
        return timestamp;
    }

    public Result<T> setTimestamp(String timestamp) {
        this.timestamp = timestamp;
        return this;
    }

    public Long getDuration() {
        return duration;
    }

    public Result<T> setDuration(Long duration) {
        this.duration = duration;
        return this;
    }

    public String getTraceId() {
        return traceId;
    }

    public Result<T> setTraceId(String traceId) {
        this.traceId = traceId;
        return this;
    }

    @Override
    public String toString() {
        return "Result{" +
                "code=" + code +
                ", message='" + message + '\'' +
                ", data=" + data +
                ", timestamp='" + timestamp + '\'' +
                ", duration=" + duration +
                ", traceId='" + traceId + '\'' +
                '}';
    }
}
