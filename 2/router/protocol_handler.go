package router

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"industrial-protocol-gateway/cluster"
	"industrial-protocol-gateway/common"
	"industrial-protocol-gateway/logger"
	"industrial-protocol-gateway/protocol"
	"industrial-protocol-gateway/storage"
)

type ParseRequest struct {
	Protocol   protocol.ProtocolType `json:"protocol" binding:"required"`
	Data       string                `json:"data" binding:"required"`
	DeviceID   string                `json:"device_id"`
	AutoDetect bool                  `json:"auto_detect"`
	Async      bool                  `json:"async"`
}

type ParseResponse struct {
	*protocol.ParseResult
	ForwardResults []*storage.ForwardResult `json:"forward_results,omitempty"`
	TaskID         string                   `json:"task_id,omitempty"`
	Status         string                   `json:"status,omitempty"`
}

type BatchParseRequest struct {
	Requests []ParseRequest `json:"requests" binding:"required,min=1,max=100"`
	Async    bool           `json:"async"`
}

type BatchParseResponse struct {
	TaskID    string                  `json:"task_id,omitempty"`
	Status    string                  `json:"status"`
	Results   []*ParseResponse        `json:"results,omitempty"`
	Total     int                     `json:"total"`
	Succeeded int                     `json:"succeeded"`
	Failed    int                     `json:"failed"`
}

type AsyncTaskResponse struct {
	TaskID    string                 `json:"task_id"`
	Status    string                 `json:"status"`
	Progress  float64                `json:"progress,omitempty"`
	Result    *protocol.ParseResult  `json:"result,omitempty"`
	Error     string                 `json:"error,omitempty"`
	CreatedAt time.Time              `json:"created_at"`
	StartedAt *time.Time             `json:"started_at,omitempty"`
	EndedAt   *time.Time             `json:"ended_at,omitempty"`
}

var (
	asyncTasks    = make(map[string]*AsyncTask)
	asyncTasksMu  sync.RWMutex
)

type AsyncTask struct {
	ID        string
	Status    string
	Progress  float64
	Request   *ParseRequest
	Result    *protocol.ParseResult
	Error     error
	CreatedAt time.Time
	StartedAt *time.Time
	EndedAt   *time.Time
	ForwardResults []*storage.ForwardResult
}

type SendRequest struct {
	Protocol protocol.ProtocolType `json:"protocol" binding:"required,oneof=modbus iec104"`
	DeviceID string               `json:"device_id" binding:"required"`
	SlaveID  uint8                `json:"slave_id" binding:"required,min=1,max=247"`
	Function protocol.FunctionCode `json:"function" binding:"required"`
	Address  uint16               `json:"address"`
	Quantity uint16               `json:"quantity"`
	Value    interface{}          `json:"value"`
	Values   []interface{}        `json:"values"`
	Host     string               `json:"host"`
	Port     int                  `json:"port"`
}

type ForwardTargetRequest struct {
	Name     string            `json:"name" binding:"required"`
	URL      string            `json:"url" binding:"required,url"`
	Protocol string            `json:"protocol"`
	Headers  map[string]string `json:"headers"`
	Enabled  bool              `json:"enabled"`
	Timeout  int               `json:"timeout" binding:"min=1,max=300"`
}

func ParsePacket(c *gin.Context) {
	start := time.Now()
	traceID := GetTraceID(c)
	clientIP := getClientIP(c)

	var req ParseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		elapsed := time.Since(start).Milliseconds()
		logger.Warnf("invalid parse request: %v, ip: %s, trace_id: %s", err, clientIP, traceID)
		logger.LogAudit(&logger.AuditLog{
			Action:   "parse_request_invalid",
			IP:       clientIP,
			Resource: string(req.Protocol),
			Details:  map[string]interface{}{"error": err.Error(), "trace_id": traceID},
		})
		c.JSON(http.StatusBadRequest, common.ErrorResponse(common.ErrInvalidParameter, traceID, elapsed))
		return
	}

	if req.Async {
		taskID := processParseAsync(c, &req, traceID, clientIP)
		elapsed := time.Since(start).Milliseconds()
		c.JSON(http.StatusAccepted, common.SuccessResponse(&ParseResponse{
			TaskID: taskID,
			Status: "queued",
		}, traceID, elapsed))
		return
	}

	result, forwardResults, err := processParseSync(&req, traceID, clientIP)
	elapsed := time.Since(start).Milliseconds()
	if err != nil {
		c.JSON(http.StatusBadRequest, common.ErrorResponse(err, traceID, elapsed))
		return
	}

	response := &ParseResponse{
		ParseResult:    result,
		ForwardResults: forwardResults,
		Status:         "completed",
	}

	c.JSON(http.StatusOK, common.SuccessResponse(response, traceID, elapsed))
}

func processParseSync(req *ParseRequest, traceID, clientIP string) (
	*protocol.ParseResult, []*storage.ForwardResult, error) {

	protocolType := req.Protocol
	if req.AutoDetect {
		data, err := common.HexToBytes(req.Data)
		if err == nil {
			detected := protocol.DetectProtocol(data)
			if detected != "" {
				logger.Infof("protocol auto-detected: %s -> %s, trace_id: %s",
					req.Protocol, detected, traceID)
				protocolType = detected
			} else {
				logger.Warnf("protocol auto-detect failed for data: %s, trace_id: %s",
					req.Data[:min(64, len(req.Data))], traceID)
				logger.LogAbnormalPacket(string(req.Protocol), data, "protocol_detect_failed", req.DeviceID, nil)
			}
		}
	}

	rawData, err := common.HexToBytes(req.Data)
	if err != nil {
		logger.Warnf("invalid hex data: %v, data: %s, ip: %s, trace_id: %s",
			err, req.Data[:min(64, len(req.Data))], clientIP, traceID)
		logger.LogAudit(&logger.AuditLog{
			Action:   "parse_invalid_hex",
			IP:       clientIP,
			Resource: string(protocolType),
			Details:  map[string]interface{}{"error": err.Error(), "trace_id": traceID, "device_id": req.DeviceID},
		})
		return nil, nil, common.ErrInvalidParameter
	}

	logger.LogProtocol(string(protocolType), "receive", req.DeviceID, rawData)

	result, err := protocol.Parse(protocolType, rawData)
	if err != nil {
		logger.Errorf("parse %s failed: %v, data: %X, ip: %s, trace_id: %s",
			protocolType, err, rawData, clientIP, traceID)
		logger.LogAbnormalPacket(string(protocolType), rawData, "parse_failed", req.DeviceID, err)
		logger.LogAudit(&logger.AuditLog{
			Action:   "parse_failed",
			IP:       clientIP,
			Resource: string(protocolType),
			Details:  map[string]interface{}{"error": err.Error(), "trace_id": traceID, "device_id": req.DeviceID},
		})
		return nil, nil, err
	}

	result.DeviceID = req.DeviceID

	storageTask := &common.Task{
		ID:        fmt.Sprintf("storage-%d", common.GenerateID()),
		TaskType:  "storage",
		Timeout:   30 * time.Second,
		CreatedAt: time.Now(),
		Func: func(ctx context.Context) error {
			return storage.SaveParseResult(result, rawData)
		},
	}
	if err := common.GetStoragePool().Submit(storageTask); err != nil {
		logger.Errorf("submit storage task failed: %v, trace_id: %s", err, traceID)
		go storage.SaveParseResult(result, rawData)
	}

	forwardTask := &common.Task{
		ID:        fmt.Sprintf("forward-%d", common.GenerateID()),
		TaskType:  "forward",
		Timeout:   30 * time.Second,
		CreatedAt: time.Now(),
		Func: func(ctx context.Context) error {
			results := storage.GetForwardManager().ForwardWithDetails(result, rawData)
			for _, fr := range results {
				if !fr.Success {
					logger.Warnf("forward to %s failed: %v, trace_id: %s", fr.TargetName, fr.Error, traceID)
				}
			}
			return nil
		},
	}
	if err := common.GetForwardPool().Submit(forwardTask); err != nil {
		logger.Errorf("submit forward task failed: %v, trace_id: %s", err, traceID)
	}

	forwardResults := storage.GetForwardManager().ForwardWithDetails(result, rawData)
	for _, fr := range forwardResults {
		if !fr.Success {
			logger.Warnf("forward to %s failed: %v, trace_id: %s", fr.TargetName, fr.Error, traceID)
		}
	}

	if err := cluster.GetManager().SyncParseResult(result, rawData); err != nil {
		logger.Errorf("cluster sync failed: %v, trace_id: %s", err, traceID)
	}

	logger.Infof("parse %s success: %d data points, device: %s, trace_id: %s",
		protocolType, len(result.DataPoints), req.DeviceID, traceID)

	return result, forwardResults, nil
}

func processParseAsync(c *gin.Context, req *ParseRequest, traceID, clientIP string) string {
	taskID := fmt.Sprintf("async-%d", common.GenerateID())

	task := &AsyncTask{
		ID:        taskID,
		Status:    "queued",
		Request:   req,
		CreatedAt: time.Now(),
	}

	asyncTasksMu.Lock()
	asyncTasks[taskID] = task
	asyncTasksMu.Unlock()

	parseTask := &common.Task{
		ID:        taskID,
		TaskType:  "async_parse",
		Timeout:   60 * time.Second,
		CreatedAt: time.Now(),
		Func: func(ctx context.Context) error {
			asyncTasksMu.Lock()
			task.Status = "processing"
			now := time.Now()
			task.StartedAt = &now
			asyncTasksMu.Unlock()

			result, forwardResults, err := processParseSync(req, traceID, clientIP)

			asyncTasksMu.Lock()
			defer asyncTasksMu.Unlock()

			now = time.Now()
			task.EndedAt = &now
			if err != nil {
				task.Status = "failed"
				task.Error = err
				task.Progress = 1.0
			} else {
				task.Status = "completed"
				task.Result = result
				task.ForwardResults = forwardResults
				task.Progress = 1.0
			}

			go func(tid string) {
				time.Sleep(1 * time.Hour)
				asyncTasksMu.Lock()
				delete(asyncTasks, tid)
				asyncTasksMu.Unlock()
			}(taskID)

			return err
		},
	}

	if err := common.GetParsePool().Submit(parseTask); err != nil {
		asyncTasksMu.Lock()
		task.Status = "failed"
		task.Error = err
		now := time.Now()
		task.EndedAt = &now
		asyncTasksMu.Unlock()
	}

	return taskID
}

func BatchParsePacket(c *gin.Context) {
	start := time.Now()
	traceID := GetTraceID(c)
	clientIP := getClientIP(c)

	var req BatchParseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		elapsed := time.Since(start).Milliseconds()
		c.JSON(http.StatusBadRequest, common.ErrorResponse(common.ErrInvalidParameter, traceID, elapsed))
		return
	}

	if req.Async {
		taskID := fmt.Sprintf("batch-%d", common.GenerateID())

		batchTask := &AsyncTask{
			ID:        taskID,
			Status:    "queued",
			CreatedAt: time.Now(),
		}

		asyncTasksMu.Lock()
		asyncTasks[taskID] = batchTask
		asyncTasksMu.Unlock()

		go func() {
			asyncTasksMu.Lock()
			batchTask.Status = "processing"
			now := time.Now()
			batchTask.StartedAt = &now
			asyncTasksMu.Unlock()

			results := make([]*ParseResponse, 0, len(req.Requests))
			succeeded := 0
			failed := 0
			total := len(req.Requests)

			for i, r := range req.Requests {
				result, forwardResults, err := processParseSync(&r, traceID, clientIP)

				resp := &ParseResponse{
					Status: "completed",
				}
				if err != nil {
					resp.Status = "failed"
					failed++
				} else {
					resp.ParseResult = result
					resp.ForwardResults = forwardResults
					succeeded++
				}
				results = append(results, resp)

				asyncTasksMu.Lock()
				batchTask.Progress = float64(i+1) / float64(total)
				asyncTasksMu.Unlock()
			}

			asyncTasksMu.Lock()
			batchTask.Status = "completed"
			batchTask.Progress = 1.0
			now = time.Now()
			batchTask.EndedAt = &now
			asyncTasksMu.Unlock()

			go func(tid string) {
				time.Sleep(1 * time.Hour)
				asyncTasksMu.Lock()
				delete(asyncTasks, tid)
				asyncTasksMu.Unlock()
			}(taskID)
		}()

		elapsed := time.Since(start).Milliseconds()
		c.JSON(http.StatusAccepted, common.SuccessResponse(&BatchParseResponse{
			TaskID: taskID,
			Status: "queued",
			Total:  len(req.Requests),
		}, traceID, elapsed))
		return
	}

	results := make([]*ParseResponse, 0, len(req.Requests))
	succeeded := 0
	failed := 0

	for _, r := range req.Requests {
		result, forwardResults, err := processParseSync(&r, traceID, clientIP)

		resp := &ParseResponse{
			Status: "completed",
		}
		if err != nil {
			resp.Status = "failed"
			failed++
		} else {
			resp.ParseResult = result
			resp.ForwardResults = forwardResults
			succeeded++
		}
		results = append(results, resp)
	}

	elapsed := time.Since(start).Milliseconds()
	response := &BatchParseResponse{
		Status:    "completed",
		Results:   results,
		Total:     len(req.Requests),
		Succeeded: succeeded,
		Failed:    failed,
	}

	c.JSON(http.StatusOK, common.SuccessResponse(response, traceID, elapsed))
}

func GetAsyncTask(c *gin.Context) {
	start := time.Now()
	traceID := GetTraceID(c)
	taskID := c.Param("task_id")

	asyncTasksMu.RLock()
	task, exists := asyncTasks[taskID]
	asyncTasksMu.RUnlock()

	if !exists {
		elapsed := time.Since(start).Milliseconds()
		c.JSON(http.StatusNotFound, common.ErrorResponse(common.ErrTaskNotFound, traceID, elapsed))
		return
	}

	resp := &AsyncTaskResponse{
		TaskID:    task.ID,
		Status:    task.Status,
		Progress:  task.Progress,
		Result:    task.Result,
		CreatedAt: task.CreatedAt,
		StartedAt: task.StartedAt,
		EndedAt:   task.EndedAt,
	}
	if task.Error != nil {
		resp.Error = task.Error.Error()
	}

	elapsed := time.Since(start).Milliseconds()
	c.JSON(http.StatusOK, common.SuccessResponse(resp, traceID, elapsed))
}

func GetWorkerPoolStats(c *gin.Context) {
	start := time.Now()
	traceID := GetTraceID(c)

	stats := map[string]interface{}{
		"parse_pool":   common.GetParsePool().GetStats(),
		"storage_pool": common.GetStoragePool().GetStats(),
		"forward_pool": common.GetForwardPool().GetStats(),
	}

	elapsed := time.Since(start).Milliseconds()
	c.JSON(http.StatusOK, common.SuccessResponse(stats, traceID, elapsed))
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func DetectProtocol(c *gin.Context) {
	start := time.Now()
	traceID := GetTraceID(c)

	var req struct {
		Data string `json:"data" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		elapsed := time.Since(start).Milliseconds()
		c.JSON(http.StatusBadRequest, common.ErrorResponse(common.ErrInvalidParameter, traceID, elapsed))
		return
	}

	rawData, err := common.HexToBytes(req.Data)
	if err != nil {
		elapsed := time.Since(start).Milliseconds()
		c.JSON(http.StatusBadRequest, common.ErrorResponseWithCode(
			common.CodeInvalidParameter, "invalid hex data", traceID, elapsed,
		))
		return
	}

	detected := protocol.DetectProtocol(rawData)
	valid := false
	if detected != "" {
		valid = protocol.Validate(detected, rawData)
	}

	elapsed := time.Since(start).Milliseconds()
	c.JSON(http.StatusOK, common.SuccessResponse(map[string]interface{}{
		"protocol":    detected,
		"valid":       valid,
		"supported":   protocol.GetSupportedProtocols(),
		"data_length": len(rawData),
	}, traceID, elapsed))
}

func SendCommand(c *gin.Context) {
	start := time.Now()
	traceID := GetTraceID(c)

	var req SendRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		elapsed := time.Since(start).Milliseconds()
		c.JSON(http.StatusBadRequest, common.ErrorResponse(common.ErrInvalidParameter, traceID, elapsed))
		return
	}

	request := &protocol.Request{
		Protocol:  req.Protocol,
		SlaveID:   req.SlaveID,
		Function:  req.Function,
		Address:   req.Address,
		Quantity:  req.Quantity,
		Value:     req.Value,
		Values:    req.Values,
		DeviceID:  req.DeviceID,
		Timestamp: time.Now(),
	}

	cmdData, err := protocol.BuildRequest(request)
	if err != nil {
		elapsed := time.Since(start).Milliseconds()
		c.JSON(http.StatusBadRequest, common.ErrorResponse(err, traceID, elapsed))
		return
	}

	elapsed := time.Since(start).Milliseconds()
	c.JSON(http.StatusOK, common.SuccessResponse(map[string]interface{}{
		"command_hex": common.BytesToHex(cmdData),
		"device_id":   req.DeviceID,
		"protocol":    req.Protocol,
		"function":    req.Function,
	}, traceID, elapsed))
}

func GetSupportedProtocols(c *gin.Context) {
	start := time.Now()
	traceID := GetTraceID(c)
	elapsed := time.Since(start).Milliseconds()

	c.JSON(http.StatusOK, common.SuccessResponse(map[string]interface{}{
		"protocols": protocol.GetSupportedProtocols(),
		"functions": map[string]interface{}{
			"modbus": []protocol.FunctionCode{
				protocol.FuncReadCoils,
				protocol.FuncReadDiscreteInputs,
				protocol.FuncReadHoldingRegs,
				protocol.FuncReadInputRegs,
				protocol.FuncWriteSingleCoil,
				protocol.FuncWriteSingleReg,
				protocol.FuncWriteMultipleCoils,
				protocol.FuncWriteMultipleRegs,
			},
		},
	}, traceID, elapsed))
}

func ValidatePacket(c *gin.Context) {
	start := time.Now()
	traceID := GetTraceID(c)

	var req struct {
		Protocol protocol.ProtocolType `json:"protocol" binding:"required,oneof=modbus iec104"`
		Data     string               `json:"data" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		elapsed := time.Since(start).Milliseconds()
		c.JSON(http.StatusBadRequest, common.ErrorResponse(common.ErrInvalidParameter, traceID, elapsed))
		return
	}

	rawData, err := common.HexToBytes(req.Data)
	if err != nil {
		elapsed := time.Since(start).Milliseconds()
		c.JSON(http.StatusBadRequest, common.ErrorResponseWithCode(
			common.CodeInvalidParameter, "invalid hex data", traceID, elapsed,
		))
		return
	}

	valid := protocol.Validate(req.Protocol, rawData)

	elapsed := time.Since(start).Milliseconds()
	c.JSON(http.StatusOK, common.SuccessResponse(map[string]interface{}{
		"valid":    valid,
		"protocol": req.Protocol,
	}, traceID, elapsed))
}

func AddForwardTarget(c *gin.Context) {
	start := time.Now()
	traceID := GetTraceID(c)

	var req ForwardTargetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		elapsed := time.Since(start).Milliseconds()
		c.JSON(http.StatusBadRequest, common.ErrorResponse(common.ErrInvalidParameter, traceID, elapsed))
		return
	}

	if req.Timeout == 0 {
		req.Timeout = 30
	}

	target := &storage.ForwardTarget{
		ID:       fmt.Sprintf("%d", common.GenerateID()),
		Name:     req.Name,
		URL:      req.URL,
		Protocol: req.Protocol,
		Headers:  req.Headers,
		Enabled:  req.Enabled,
		Timeout:  req.Timeout,
	}

	cmd := &cluster.SyncCommand{
		Type: cluster.CmdForwardTargetAdd,
	}
	cmd.Data, _ = json.Marshal(target)

	if err := cluster.BroadcastCommand(cmd); err != nil {
		logger.Errorf("sync forward target failed: %v", err)
	}

	storage.AddForwardTarget(target)

	elapsed := time.Since(start).Milliseconds()
	c.JSON(http.StatusOK, common.SuccessResponse(target, traceID, elapsed))
}

func RemoveForwardTarget(c *gin.Context) {
	start := time.Now()
	traceID := GetTraceID(c)
	targetID := c.Param("id")

	cmd := &cluster.SyncCommand{
		Type: cluster.CmdForwardTargetRemove,
	}
	cmd.Data, _ = json.Marshal(targetID)

	if err := cluster.BroadcastCommand(cmd); err != nil {
		logger.Errorf("sync remove forward target failed: %v", err)
	}

	storage.RemoveForwardTarget(targetID)

	elapsed := time.Since(start).Milliseconds()
	c.JSON(http.StatusOK, common.SuccessResponse(map[string]interface{}{
		"id":      targetID,
		"message": "forward target removed",
	}, traceID, elapsed))
}

func GetForwardTargets(c *gin.Context) {
	start := time.Now()
	traceID := GetTraceID(c)

	targets := storage.GetForwardTargets()

	elapsed := time.Since(start).Milliseconds()
	c.JSON(http.StatusOK, common.SuccessResponse(map[string]interface{}{
		"total":   len(targets),
		"targets": targets,
	}, traceID, elapsed))
}

func SetupProtocolRoutes(r *gin.RouterGroup) {
	proto := r.Group("/protocol", AuthRequired())
	{
		proto.POST("/parse", ParsePacket)
		proto.POST("/parse/batch", BatchParsePacket)
		proto.GET("/parse/task/:task_id", GetAsyncTask)
		proto.POST("/detect", DetectProtocol)
		proto.POST("/validate", ValidatePacket)
		proto.POST("/send", SendCommand)
		proto.GET("/supported", GetSupportedProtocols)
		proto.GET("/workers", GetWorkerPoolStats)

		forward := proto.Group("/forward")
		{
			forward.GET("", GetForwardTargets)
			forward.POST("", RoleRequired("admin", "readwrite"), AddForwardTarget)
			forward.DELETE("/:id", RoleRequired("admin", "readwrite"), RemoveForwardTarget)
		}
	}
}
