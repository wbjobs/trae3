package common

import "errors"

var (
	ErrInvalidProtocol    = errors.New("invalid protocol type")
	ErrInvalidPacket      = errors.New("invalid packet data")
	ErrChecksumMismatch   = errors.New("checksum mismatch")
	ErrParseFailed        = errors.New("packet parse failed")
	ErrConnectionPoolFull = errors.New("connection pool is full")
	ErrConnectionClosed   = errors.New("connection is closed")
	ErrTimeout            = errors.New("operation timeout")
	ErrUnauthorized       = errors.New("unauthorized access")
	ErrForbidden          = errors.New("forbidden")
	ErrRateLimitExceeded  = errors.New("rate limit exceeded")
	ErrNotFound           = errors.New("resource not found")
	ErrInvalidParameter   = errors.New("invalid parameter")
	ErrClusterSyncFailed  = errors.New("cluster sync failed")
	ErrStorageFailed      = errors.New("storage operation failed")
	ErrQueueFull          = errors.New("task queue is full")
	ErrTaskNotFound       = errors.New("task not found")
	ErrCompressionFailed  = errors.New("data compression failed")
	ErrPoolWarmupFailed   = errors.New("connection pool warmup failed")
	ErrHealthCheckFailed  = errors.New("health check failed")
)

type ErrorCode int

const (
	CodeSuccess           ErrorCode = 0
	CodeInvalidProtocol   ErrorCode = 1001
	CodeInvalidPacket     ErrorCode = 1002
	CodeChecksumMismatch  ErrorCode = 1003
	CodeParseFailed       ErrorCode = 1004
	CodePoolFull          ErrorCode = 2001
	CodeConnectionClosed  ErrorCode = 2002
	CodeTimeout           ErrorCode = 2003
	CodeUnauthorized      ErrorCode = 4001
	CodeForbidden         ErrorCode = 4002
	CodeRateLimitExceeded ErrorCode = 4003
	CodeNotFound          ErrorCode = 4004
	CodeInvalidParameter  ErrorCode = 4005
	CodeClusterSyncFailed ErrorCode = 5001
	CodeStorageFailed     ErrorCode = 5002
	CodeInternalError     ErrorCode = 5000
	CodeQueueFull         ErrorCode = 5003
	CodeTaskNotFound      ErrorCode = 5004
	CodeCompressionFailed ErrorCode = 5005
)

type APIError struct {
	Code    ErrorCode `json:"code"`
	Message string    `json:"message"`
	Details string    `json:"details,omitempty"`
}

func NewAPIError(code ErrorCode, message string) *APIError {
	return &APIError{
		Code:    code,
		Message: message,
	}
}

func NewAPIErrorWithDetails(code ErrorCode, message, details string) *APIError {
	return &APIError{
		Code:    code,
		Message: message,
		Details: details,
	}
}

func (e *APIError) Error() string {
	if e.Details != "" {
		return e.Message + ": " + e.Details
	}
	return e.Message
}

func ErrorFromError(err error) *APIError {
	switch {
	case errors.Is(err, ErrInvalidProtocol):
		return NewAPIError(CodeInvalidProtocol, err.Error())
	case errors.Is(err, ErrInvalidPacket):
		return NewAPIError(CodeInvalidPacket, err.Error())
	case errors.Is(err, ErrChecksumMismatch):
		return NewAPIError(CodeChecksumMismatch, err.Error())
	case errors.Is(err, ErrParseFailed):
		return NewAPIError(CodeParseFailed, err.Error())
	case errors.Is(err, ErrConnectionPoolFull):
		return NewAPIError(CodePoolFull, err.Error())
	case errors.Is(err, ErrConnectionClosed):
		return NewAPIError(CodeConnectionClosed, err.Error())
	case errors.Is(err, ErrTimeout):
		return NewAPIError(CodeTimeout, err.Error())
	case errors.Is(err, ErrUnauthorized):
		return NewAPIError(CodeUnauthorized, err.Error())
	case errors.Is(err, ErrForbidden):
		return NewAPIError(CodeForbidden, err.Error())
	case errors.Is(err, ErrRateLimitExceeded):
		return NewAPIError(CodeRateLimitExceeded, err.Error())
	case errors.Is(err, ErrNotFound):
		return NewAPIError(CodeNotFound, err.Error())
	case errors.Is(err, ErrInvalidParameter):
		return NewAPIError(CodeInvalidParameter, err.Error())
	case errors.Is(err, ErrClusterSyncFailed):
		return NewAPIError(CodeClusterSyncFailed, err.Error())
	case errors.Is(err, ErrStorageFailed):
		return NewAPIError(CodeStorageFailed, err.Error())
	case errors.Is(err, ErrQueueFull):
		return NewAPIError(CodeQueueFull, err.Error())
	case errors.Is(err, ErrTaskNotFound):
		return NewAPIError(CodeTaskNotFound, err.Error())
	case errors.Is(err, ErrCompressionFailed):
		return NewAPIError(CodeCompressionFailed, err.Error())
	default:
		return NewAPIError(CodeInternalError, "internal server error")
	}
}
