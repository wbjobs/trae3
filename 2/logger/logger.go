package logger

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"industrial-protocol-gateway/config"

	"github.com/robfig/cron/v3"
	"github.com/sirupsen/logrus"
	"gopkg.in/natefinch/lumberjack.v2"
)

type contextKey string

const (
	TraceIDKey    contextKey = "trace_id"
	ModuleKey     contextKey = "module"
	RequestIDKey  contextKey = "request_id"
)

var (
	logger     *logrus.Logger
	once       sync.Once
	cronScheduler *cron.Cron
)

type Fields map[string]interface{}

func Init() error {
	var initErr error
	once.Do(func() {
		cfg := config.Get().Log

		if err := os.MkdirAll(filepath.Dir(cfg.FilePath), 0755); err != nil {
			initErr = fmt.Errorf("create log dir failed: %w", err)
			return
		}

		logger = logrus.New()

		level, err := logrus.ParseLevel(cfg.Level)
		if err != nil {
			level = logrus.InfoLevel
		}
		logger.SetLevel(level)

		logger.SetReportCaller(true)
		logger.SetFormatter(&logrus.JSONFormatter{
			TimestampFormat:  "2006-01-02 15:04:05.000",
			CallerPrettyfier: callerPrettyfier,
		})

		fileWriter := &lumberjack.Logger{
			Filename:   cfg.FilePath,
			MaxSize:    cfg.MaxSize,
			MaxBackups: cfg.MaxBackups,
			MaxAge:     cfg.MaxAge,
			Compress:   cfg.Compress,
		}

		consoleWriter := &logrus.TextFormatter{
			TimestampFormat:  "2006-01-02 15:04:05.000",
			FullTimestamp:    true,
			ForceColors:      true,
			CallerPrettyfier: callerPrettyfier,
		}

		mw := io.MultiWriter(os.Stdout, fileWriter)
		logger.SetOutput(mw)
		logger.SetFormatter(consoleWriter)

		if err := startLogArchive(); err != nil {
			Errorf("start log archive failed: %v", err)
		}
	})
	return initErr
}

func callerPrettyfier(frame *runtime.Frame) (string, string) {
	fileName := filepath.Base(frame.File)
	functionName := filepath.Base(frame.Function)
	return functionName, fmt.Sprintf("%s:%d", fileName, frame.Line)
}

func startLogArchive() error {
	cronScheduler = cron.New(cron.WithSeconds())

	_, err := cronScheduler.AddFunc("0 0 0 * * ?", func() {
		Info("starting daily log archive task")
		if err := archiveLogs(); err != nil {
			Errorf("log archive failed: %v", err)
		} else {
			Info("log archive completed successfully")
		}
	})
	if err != nil {
		return err
	}

	cronScheduler.Start()
	return nil
}

func archiveLogs() error {
	cfg := config.Get().Log
	logDir := filepath.Dir(cfg.FilePath)
	archiveDir := filepath.Join(logDir, "archive")

	if err := os.MkdirAll(archiveDir, 0755); err != nil {
		return err
	}

	dateStr := time.Now().AddDate(0, 0, -1).Format("2006-01-02")
	pattern := fmt.Sprintf("*.%s*.log*", dateStr)

	matches, err := filepath.Glob(filepath.Join(logDir, pattern))
	if err != nil {
		return err
	}

	for _, match := range matches {
		base := filepath.Base(match)
		dest := filepath.Join(archiveDir, base)
		if err := os.Rename(match, dest); err != nil {
			Errorf("move log file %s failed: %v", match, err)
			continue
		}
		Infof("archived log file: %s -> %s", match, dest)
	}

	return nil
}

func Sync() {
	if cronScheduler != nil {
		cronScheduler.Stop()
	}
}

func WithTraceID(ctx context.Context) *logrus.Entry {
	if traceID, ok := ctx.Value(TraceIDKey).(string); ok {
		return logger.WithField("trace_id", traceID)
	}
	return logger.WithField("trace_id", "unknown")
}

func WithModule(module string) *logrus.Entry {
	return logger.WithField("module", module)
}

func WithContext(ctx context.Context) *logrus.Entry {
	entry := logger.WithContext(ctx)
	if traceID, ok := ctx.Value(TraceIDKey).(string); ok {
		entry = entry.WithField("trace_id", traceID)
	}
	if module, ok := ctx.Value(ModuleKey).(string); ok {
		entry = entry.WithField("module", module)
	}
	if requestID, ok := ctx.Value(RequestIDKey).(string); ok {
		entry = entry.WithField("request_id", requestID)
	}
	return entry
}

func WithFields(fields Fields) *logrus.Entry {
	return logger.WithFields(logrus.Fields(fields))
}

func Info(args ...interface{}) {
	logger.Info(args...)
}

func Infof(format string, args ...interface{}) {
	logger.Infof(format, args...)
}

func Debug(args ...interface{}) {
	logger.Debug(args...)
}

func Debugf(format string, args ...interface{}) {
	logger.Debugf(format, args...)
}

func Warn(args ...interface{}) {
	logger.Warn(args...)
}

func Warnf(format string, args ...interface{}) {
	logger.Warnf(format, args...)
}

func Error(args ...interface{}) {
	logger.Error(args...)
}

func Errorf(format string, args ...interface{}) {
	logger.Errorf(format, args...)
}

func Fatal(args ...interface{}) {
	logger.Fatal(args...)
}

func Fatalf(format string, args ...interface{}) {
	logger.Fatalf(format, args...)
}

func Panic(args ...interface{}) {
	logger.Panic(args...)
}

func Panicf(format string, args ...interface{}) {
	logger.Panicf(format, args...)
}

func LogProtocol(protocol, direction, deviceID string, data []byte) {
	logger.WithFields(logrus.Fields{
		"type":      "protocol",
		"protocol":  protocol,
		"direction": direction,
		"device_id": deviceID,
		"data_len":  len(data),
		"data_hex":  fmt.Sprintf("%X", data),
	}).Info("protocol data")
}

func LogAPI(ctx context.Context, method, path string, statusCode int, latency time.Duration, clientIP string) {
	WithTraceID(ctx).WithFields(logrus.Fields{
		"type":        "api",
		"method":      method,
		"path":        path,
		"status_code": statusCode,
		"latency_ms":  latency.Milliseconds(),
		"client_ip":   clientIP,
	}).Info("api access")
}

func LogParse(protocol string, success bool, rawData []byte, result interface{}, err error) {
	fields := logrus.Fields{
		"type":     "parse",
		"protocol": protocol,
		"success":  success,
		"raw_hex":  fmt.Sprintf("%X", rawData),
	}
	if result != nil {
		fields["result"] = fmt.Sprintf("%+v", result)
	}
	if err != nil {
		fields["error"] = err.Error()
	}
	if success {
		logger.WithFields(fields).Info("protocol parse")
	} else {
		logger.WithFields(fields).Error("protocol parse failed")
	}
}

func LogAbnormalPacket(protocol string, rawData []byte, reason string, deviceID string, err error) {
	fields := logrus.Fields{
		"type":      "abnormal_packet",
		"protocol":  protocol,
		"raw_hex":   fmt.Sprintf("%X", rawData),
		"data_len":  len(rawData),
		"reason":    reason,
		"device_id": deviceID,
	}
	if err != nil {
		fields["error"] = err.Error()
	}
	logger.WithFields(fields).Error("abnormal packet detected")
}

func LogParseError(protocol string, rawData []byte, offset int, reason string, err error) {
	fields := logrus.Fields{
		"type":     "parse_error",
		"protocol": protocol,
		"raw_hex":  fmt.Sprintf("%X", rawData),
		"data_len": len(rawData),
		"offset":   offset,
		"reason":   reason,
	}
	if err != nil {
		fields["error"] = err.Error()
	}
	logger.WithFields(fields).Error("protocol parse error")
}

func LogStorage(operation string, success bool, points int, err error) {
	fields := logrus.Fields{
		"type":      "storage",
		"operation": operation,
		"success":   success,
		"points":    points,
	}
	if err != nil {
		fields["error"] = err.Error()
	}
	logger.WithFields(fields).Info("storage operation")
}

func LogCluster(operation, nodeID string, success bool, err error) {
	fields := logrus.Fields{
		"type":      "cluster",
		"operation": operation,
		"node_id":   nodeID,
		"success":   success,
	}
	if err != nil {
		fields["error"] = err.Error()
	}
	logger.WithFields(fields).Info("cluster operation")
}

type AuditLog struct {
	UserID    string                 `json:"user_id"`
	Action    string                 `json:"action"`
	Resource  string                 `json:"resource"`
	IP        string                 `json:"ip"`
	Timestamp time.Time              `json:"timestamp"`
	Details   map[string]interface{} `json:"details"`
}

func LogAudit(audit *AuditLog) {
	logger.WithFields(logrus.Fields{
		"type":      "audit",
		"user_id":   audit.UserID,
		"action":    audit.Action,
		"resource":  audit.Resource,
		"ip":        audit.IP,
		"timestamp": audit.Timestamp.Format(time.RFC3339),
		"details":   audit.Details,
	}).Info("audit log")
}

func ExtractTraceID(ctx context.Context) string {
	if traceID, ok := ctx.Value(TraceIDKey).(string); ok {
		return traceID
	}
	return ""
}

func NewContextWithTraceID(ctx context.Context, traceID string) context.Context {
	return context.WithValue(ctx, TraceIDKey, traceID)
}

func NewContextWithModule(ctx context.Context, module string) context.Context {
	return context.WithValue(ctx, ModuleKey, module)
}

func GetLogger() *logrus.Logger {
	return logger
}

type GinLogWriter struct{}

func (w *GinLogWriter) Write(p []byte) (n int, err error) {
	msg := strings.TrimSpace(string(p))
	if strings.Contains(msg, "[GIN]") {
		logger.Info(msg)
	} else {
		logger.Debug(msg)
	}
	return len(p), nil
}
