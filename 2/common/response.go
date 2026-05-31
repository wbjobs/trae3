package common

type Response struct {
	Code    ErrorCode   `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
	TraceID string      `json:"trace_id"`
	Timing  int64       `json:"timing_ms"`
}

type PagedResponse struct {
	Total    int64       `json:"total"`
	Page     int         `json:"page"`
	PageSize int         `json:"page_size"`
	Items    interface{} `json:"items"`
}

func SuccessResponse(data interface{}, traceID string, timing int64) *Response {
	return &Response{
		Code:    CodeSuccess,
		Message: "success",
		Data:    data,
		TraceID: traceID,
		Timing:  timing,
	}
}

func ErrorResponse(err error, traceID string, timing int64) *Response {
	apiErr := ErrorFromError(err)
	return &Response{
		Code:    apiErr.Code,
		Message: apiErr.Message,
		Data:    nil,
		TraceID: traceID,
		Timing:  timing,
	}
}

func ErrorResponseWithCode(code ErrorCode, message string, traceID string, timing int64) *Response {
	return &Response{
		Code:    code,
		Message: message,
		TraceID: traceID,
		Timing:  timing,
	}
}
