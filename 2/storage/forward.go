package storage

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"industrial-protocol-gateway/common"
	"industrial-protocol-gateway/logger"
	"industrial-protocol-gateway/protocol"
)

type ForwardTarget struct {
	ID       string            `json:"id"`
	Name     string            `json:"name"`
	URL      string            `json:"url"`
	Protocol string            `json:"protocol"`
	Headers  map[string]string `json:"headers"`
	Enabled  bool              `json:"enabled"`
	Timeout  int               `json:"timeout"`
}

type ForwardManager struct {
	targets      map[string]*ForwardTarget
	mu           sync.RWMutex
	client       *http.Client
	batchQueue   map[string][]*ForwardBatchItem
	batchMu      sync.Mutex
	batchTimer   *time.Ticker
	stopCh       chan struct{}
	maxBatchSize int
	maxBatchWait  time.Duration
	targetStats  map[string]*ForwardTargetStats
	statsMu      sync.RWMutex
}

type ForwardBatchItem struct {
	Data     map[string]interface{}
	RawData  []byte
	Result   *protocol.ParseResult
	CreateTime time.Time
}

type ForwardTargetStats struct {
	TotalSent     int64         `json:"total_sent"`
	TotalSuccess  int64         `json:"total_success"`
	TotalFailed   int64         `json:"total_failed"`
	TotalLatency  int64         `json:"total_latency_ms"`
	AvgLatency    time.Duration `json:"avg_latency_ms"`
	CurrentQueue  int           `json:"current_queue"`
	mu            sync.RWMutex
}

var (
	forwardManager *ForwardManager
	forwardOnce    sync.Once
)

func InitForwardManager() {
	forwardOnce.Do(func() {
		transport := &http.Transport{
			MaxIdleConns:        100,
			MaxIdleConnsPerHost: 10,
			MaxConnsPerHost:     100,
			IdleConnTimeout:     90 * time.Second,
			DisableCompression:  false,
			ForceAttemptHTTP2:   true,
		}

		forwardManager = &ForwardManager{
			targets:      make(map[string]*ForwardTarget),
			batchQueue:   make(map[string][]*ForwardBatchItem),
			targetStats:  make(map[string]*ForwardTargetStats),
			stopCh:       make(chan struct{}),
			maxBatchSize: 100,
			maxBatchWait:  500 * time.Millisecond,
			client: &http.Client{
				Transport: transport,
				Timeout:   30 * time.Second,
			},
		}

		go forwardManager.startBatchProcessor()
		logger.Info("forward manager initialized with connection pooling")
	})
}

func (fm *ForwardManager) getTargetStats(targetID string) *ForwardTargetStats {
	fm.statsMu.RLock()
	stats, exists := fm.targetStats[targetID]
	fm.statsMu.RUnlock()

	if !exists {
		fm.statsMu.Lock()
		stats, exists = fm.targetStats[targetID]
		if !exists {
			stats = &ForwardTargetStats{}
			fm.targetStats[targetID] = stats
		}
		fm.statsMu.Unlock()
	}
	return stats
}

func (fm *ForwardManager) recordStats(targetID string, success bool, latency time.Duration) {
	stats := fm.getTargetStats(targetID)
	stats.mu.Lock()
	defer stats.mu.Unlock()

	stats.TotalSent++
	if success {
		stats.TotalSuccess++
	} else {
		stats.TotalFailed++
	}
	stats.TotalLatency += latency.Milliseconds()
	if stats.TotalSent > 0 {
		stats.AvgLatency = time.Duration(stats.TotalLatency/stats.TotalSent) * time.Millisecond
	}
}

func GetForwardManager() *ForwardManager {
	return forwardManager
}

func (fm *ForwardManager) AddTarget(target *ForwardTarget) {
	fm.mu.Lock()
	defer fm.mu.Unlock()
	fm.targets[target.ID] = target
	logger.Infof("forward target added: %s (%s)", target.Name, target.URL)
}

func (fm *ForwardManager) RemoveTarget(targetID string) {
	fm.mu.Lock()
	defer fm.mu.Unlock()
	delete(fm.targets, targetID)
	logger.Infof("forward target removed: %s", targetID)
}

func (fm *ForwardManager) GetTargets() []*ForwardTarget {
	fm.mu.RLock()
	defer fm.mu.RUnlock()

	targets := make([]*ForwardTarget, 0, len(fm.targets))
	for _, t := range fm.targets {
		targets = append(targets, t)
	}
	return targets
}

func (fm *ForwardManager) Forward(result *protocol.ParseResult, rawData []byte) error {
	fm.mu.RLock()
	targets := make([]*ForwardTarget, 0, len(fm.targets))
	for _, t := range fm.targets {
		if t.Enabled && (t.Protocol == "" || t.Protocol == string(result.Protocol)) {
			targets = append(targets, t)
		}
	}
	fm.mu.RUnlock()

	if len(targets) == 0 {
		return nil
	}

	forwardData := map[string]interface{}{
		"timestamp": result.Timestamp,
		"protocol":  result.Protocol,
		"device_id": result.DeviceID,
		"slave_id":  result.SlaveID,
		"function":  result.Function,
		"raw_data":  common.BytesToHex(rawData),
		"data":      result.DataPoints,
	}

	var wg sync.WaitGroup
	var errs []error
	var errMu sync.Mutex

	for _, target := range targets {
		wg.Add(1)
		go func(t *ForwardTarget) {
			defer wg.Done()

			if err := fm.sendToTarget(t, forwardData); err != nil {
				errMu.Lock()
				errs = append(errs, fmt.Errorf("forward to %s failed: %w", t.Name, err))
				errMu.Unlock()
			}
		}(target)
	}

	wg.Wait()

	if len(errs) > 0 {
		return fmt.Errorf("forward errors: %v", errs)
	}

	logger.Infof("forwarded data to %d targets successfully", len(targets))
	return nil
}

func (fm *ForwardManager) startBatchProcessor() {
	fm.batchTimer = time.NewTicker(fm.maxBatchWait)
	defer fm.batchTimer.Stop()

	for {
		select {
		case <-fm.batchTimer.C:
			fm.processBatches()
		case <-fm.stopCh:
			return
		}
	}
}

func (fm *ForwardManager) processBatches() {
	fm.batchMu.Lock()
	targetIDs := make([]string, 0, len(fm.batchQueue))
	for id := range fm.batchQueue {
		targetIDs = append(targetIDs, id)
	}
	fm.batchMu.Unlock()

	for _, targetID := range targetIDs {
		fm.batchMu.Lock()
		items, exists := fm.batchQueue[targetID]
		if exists {
			delete(fm.batchQueue, targetID)
		}
		fm.batchMu.Unlock()

		if exists && len(items) > 0 {
			go fm.sendBatch(targetID, items)
		}
	}
}

func (fm *ForwardManager) sendBatch(targetID string, items []*ForwardBatchItem) {
	fm.mu.RLock()
	target, exists := fm.targets[targetID]
	fm.mu.RUnlock()

	if !exists || !target.Enabled {
		return
	}

	if len(items) == 1 {
		fm.sendToTarget(target, items[0].Data)
		return
	}

	batchData := map[string]interface{}{
		"batch_size":  len(items),
		"timestamp":   time.Now(),
		"items":       make([]interface{}, 0, len(items)),
	}

	for _, item := range items {
		batchData["items"] = append(batchData["items"].([]interface{}), item.Data)
	}

	start := time.Now()
	if err := fm.sendToTarget(target, batchData); err != nil {
		logger.Errorf("batch forward to %s failed: %v, items: %d", target.Name, err, len(items))
		fm.recordStats(targetID, false, time.Since(start))

		for _, item := range items {
			fm.queueForRetry(target, item)
		}
	} else {
		fm.recordStats(targetID, true, time.Since(start))
		logger.Infof("batch forward to %s completed: %d items in %v", target.Name, len(items), time.Since(start))
	}
}

func (fm *ForwardManager) queueForRetry(target *ForwardTarget, item *ForwardBatchItem) {
	fm.batchMu.Lock()
	defer fm.batchMu.Unlock()

	if _, exists := fm.batchQueue[target.ID]; !exists {
		fm.batchQueue[target.ID] = make([]*ForwardBatchItem, 0, fm.maxBatchSize)
	}

	if len(fm.batchQueue[target.ID]) < fm.maxBatchSize {
		fm.batchQueue[target.ID] = append(fm.batchQueue[target.ID], item)
	}
}

func (fm *ForwardManager) sendToTarget(target *ForwardTarget, data map[string]interface{}) error {
	jsonData, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("marshal data failed: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(target.Timeout)*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "POST", target.URL, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("create request failed: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Connection", "keep-alive")
	for k, v := range target.Headers {
		req.Header.Set(k, v)
	}

	start := time.Now()
	resp, err := fm.client.Do(req)
	latency := time.Since(start)

	if err != nil {
		return fmt.Errorf("send request failed: %w", err)
	}
	defer resp.Body.Close()

	fm.recordStats(target.ID, resp.StatusCode < 400, latency)

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("target returned status %d: %s", resp.StatusCode, string(body))
	}

	logger.Debugf("data forwarded to %s successfully in %v", target.Name, latency)
	return nil
}

func ForwardData(result *protocol.ParseResult, rawData []byte) error {
	if forwardManager == nil {
		InitForwardManager()
	}
	return forwardManager.Forward(result, rawData)
}

func AddForwardTarget(target *ForwardTarget) {
	if forwardManager == nil {
		InitForwardManager()
	}
	forwardManager.AddTarget(target)
}

func RemoveForwardTarget(targetID string) {
	if forwardManager != nil {
		forwardManager.RemoveTarget(targetID)
	}
}

func GetForwardTargets() []*ForwardTarget {
	if forwardManager == nil {
		InitForwardManager()
	}
	return forwardManager.GetTargets()
}

type ForwardResult struct {
	TargetID   string        `json:"target_id"`
	TargetName string        `json:"target_name"`
	Success    bool          `json:"success"`
	Latency    time.Duration `json:"latency_ms"`
	Error      string        `json:"error,omitempty"`
}

func (fm *ForwardManager) ForwardWithDetails(result *protocol.ParseResult, rawData []byte) []*ForwardResult {
	fm.mu.RLock()
	targets := make([]*ForwardTarget, 0, len(fm.targets))
	for _, t := range fm.targets {
		if t.Enabled && (t.Protocol == "" || t.Protocol == string(result.Protocol)) {
			targets = append(targets, t)
		}
	}
	fm.mu.RUnlock()

	results := make([]*ForwardResult, 0, len(targets))
	var wg sync.WaitGroup
	var mu sync.Mutex

	forwardData := map[string]interface{}{
		"timestamp": result.Timestamp,
		"protocol":  result.Protocol,
		"device_id": result.DeviceID,
		"slave_id":  result.SlaveID,
		"function":  result.Function,
		"raw_data":  common.BytesToHex(rawData),
		"data":      result.DataPoints,
	}

	batchItem := &ForwardBatchItem{
		Data:       forwardData,
		RawData:    rawData,
		Result:     result,
		CreateTime: time.Now(),
	}

	for _, target := range targets {
		wg.Add(1)
		go func(t *ForwardTarget) {
			defer wg.Done()
			start := time.Now()

			fr := &ForwardResult{
				TargetID:   t.ID,
				TargetName: t.Name,
				Success:    false,
			}

			fm.batchMu.Lock()
			if _, exists := fm.batchQueue[t.ID]; !exists {
				fm.batchQueue[t.ID] = make([]*ForwardBatchItem, 0, fm.maxBatchSize)
			}
			fm.batchQueue[t.ID] = append(fm.batchQueue[t.ID], batchItem)
			queueLen := len(fm.batchQueue[t.ID])
			stats := fm.getTargetStats(t.ID)
			stats.mu.Lock()
			stats.CurrentQueue = queueLen
			stats.mu.Unlock()
			shouldProcessNow := queueLen >= fm.maxBatchSize
			fm.batchMu.Unlock()

			if shouldProcessNow {
				fm.batchMu.Lock()
				items, exists := fm.batchQueue[t.ID]
				if exists {
					delete(fm.batchQueue, t.ID)
				}
				fm.batchMu.Unlock()

				if exists {
					fm.sendBatch(t.ID, items)
				}
				fr.Success = true
			} else {
				fr.Success = true
				fr.Latency = time.Since(start)
			}

			mu.Lock()
			results = append(results, fr)
			mu.Unlock()
		}(target)
	}

	wg.Wait()
	return results
}

func (fm *ForwardManager) FlushBatches() {
	fm.batchMu.Lock()
	targetIDs := make([]string, 0, len(fm.batchQueue))
	for id := range fm.batchQueue {
		targetIDs = append(targetIDs, id)
	}
	fm.batchMu.Unlock()

	for _, targetID := range targetIDs {
		fm.batchMu.Lock()
		items, exists := fm.batchQueue[targetID]
		if exists {
			delete(fm.batchQueue, targetID)
		}
		fm.batchMu.Unlock()

		if exists && len(items) > 0 {
			fm.sendBatch(targetID, items)
		}
	}
}

func (fm *ForwardManager) GetForwardStats() map[string]interface{} {
	fm.statsMu.RLock()
	defer fm.statsMu.RUnlock()

	stats := make(map[string]interface{})
	for id, targetStats := range fm.targetStats {
		fm.mu.RLock()
		target, exists := fm.targets[id]
		fm.mu.RUnlock()

		name := id
		if exists {
			name = target.Name
		}

		targetStats.mu.RLock()
		stats[id] = map[string]interface{}{
			"name":          name,
			"total_sent":    targetStats.TotalSent,
			"total_success": targetStats.TotalSuccess,
			"total_failed":  targetStats.TotalFailed,
			"avg_latency":   targetStats.AvgLatency.Milliseconds(),
			"current_queue": targetStats.CurrentQueue,
		}
		targetStats.mu.RUnlock()
	}

	return stats
}

func (fm *ForwardManager) Close() {
	select {
	case <-fm.stopCh:
	default:
		close(fm.stopCh)
	}

	fm.FlushBatches()
	logger.Info("forward manager closed")
}
