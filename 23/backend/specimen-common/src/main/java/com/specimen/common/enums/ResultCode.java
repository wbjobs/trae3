package com.specimen.common.enums;

import lombok.Getter;

@Getter
public enum ResultCode {
    SUCCESS(200, "操作成功"),
    FAIL(500, "操作失败"),
    UNAUTHORIZED(401, "未授权"),
    FORBIDDEN(403, "禁止访问"),
    NOT_FOUND(404, "资源不存在"),
    PARAM_ERROR(400, "参数错误"),
    TOKEN_EXPIRED(40101, "Token已过期"),
    TOKEN_INVALID(40102, "Token无效"),
    USER_NOT_FOUND(40401, "用户不存在"),
    PASSWORD_ERROR(40001, "密码错误"),
    TENANT_NOT_FOUND(40402, "租户不存在"),
    FILE_UPLOAD_ERROR(50001, "文件上传失败"),
    FILE_DOWNLOAD_ERROR(50002, "文件下载失败"),
    PERMISSION_DENIED(40301, "权限不足"),
    DATA_NOT_FOUND(40403, "数据不存在"),
    DUPLICATE_DATA(40002, "数据重复");

    private final Integer code;
    private final String message;

    ResultCode(Integer code, String message) {
        this.code = code;
        this.message = message;
    }
}
