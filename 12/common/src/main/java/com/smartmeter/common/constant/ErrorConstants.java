package com.smartmeter.common.constant;

public class ErrorConstants {

    public static final String ERROR_TYPE_PROTOCOL_PARSE = "PROTOCOL_PARSE_ERROR";
    public static final String ERROR_TYPE_DATA_VALIDATION = "DATA_VALIDATION_ERROR";
    public static final String ERROR_TYPE_CRC_CHECK = "CRC_CHECK_ERROR";
    public static final String ERROR_TYPE_DATA_LENGTH = "DATA_LENGTH_ERROR";
    public static final String ERROR_TYPE_FRAME_FORMAT = "FRAME_FORMAT_ERROR";
    public static final String ERROR_TYPE_METER_ID_EMPTY = "METER_ID_EMPTY_ERROR";
    public static final String ERROR_TYPE_DATA_VALUE_INVALID = "DATA_VALUE_INVALID_ERROR";
    public static final String ERROR_TYPE_AUTH = "AUTHENTICATION_ERROR";
    public static final String ERROR_TYPE_PERMISSION = "PERMISSION_DENIED_ERROR";
    public static final String ERROR_TYPE_SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE_ERROR";

    public static final int CODE_BAD_REQUEST = 400;
    public static final int CODE_UNAUTHORIZED = 401;
    public static final int CODE_FORBIDDEN = 403;
    public static final int CODE_NOT_FOUND = 404;
    public static final int CODE_SERVER_ERROR = 500;
    public static final int CODE_SERVICE_UNAVAILABLE = 503;
}
