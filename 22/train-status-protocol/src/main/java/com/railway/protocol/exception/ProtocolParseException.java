package com.railway.protocol.exception;

public class ProtocolParseException extends RuntimeException {

    private final String errorCode;

    public ProtocolParseException(String message) {
        super(message);
        this.errorCode = "PROTOCOL_PARSE_ERROR";
    }

    public ProtocolParseException(String errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }

    public ProtocolParseException(String message, Throwable cause) {
        super(message, cause);
        this.errorCode = "PROTOCOL_PARSE_ERROR";
    }

    public String getErrorCode() {
        return errorCode;
    }
}
