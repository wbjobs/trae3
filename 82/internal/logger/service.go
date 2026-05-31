package logger

import (
	"edge-platform/internal/db"
	"edge-platform/internal/model"
	"fmt"
	"sync"
	"time"

	"gorm.io/gorm"
)

const (
	DefaultLogRetentionDays = 30
	DefaultBatchSize        = 100
	DefaultFlushInterval    = 2 * time.Second
	MaxBatchSize            = 1000
)

type Service struct {
	db            *db.Databases
	buffer        []model.RuntimeLog
	bufferMutex   sync.Mutex
	flushChan     chan struct{}
	flushTimer    *time.Ticker
	stopChan      chan struct{}
	wg            sync.WaitGroup
	retentionDays int
	batchSize     int
}

func NewService(d *db.Databases) *Service {
	svc := &Service{
		db:            d,
		buffer:        make([]model.RuntimeLog, 0, DefaultBatchSize),
		flushChan:     make(chan struct{}, 1),
		flushTimer:    time.NewTicker(DefaultFlushInterval),
		stopChan:      make(chan struct{}),
		retentionDays: DefaultLogRetentionDays,
		batchSize:     DefaultBatchSize,
	}
	svc.wg.Add(1)
	go svc.flushLoop()
	return svc
}

func (s *Service) flushLoop() {
	defer s.wg.Done()
	for {
		select {
		case <-s.flushChan:
			s.flush()
		case <-s.flushTimer.C:
			s.flush()
		case <-s.stopChan:
			s.flush()
			return
		}
	}
}

func (s *Service) flush() {
	s.bufferMutex.Lock()
	if len(s.buffer) == 0 {
		s.bufferMutex.Unlock()
		return
	}
	logs := s.buffer
	s.buffer = make([]model.RuntimeLog, 0, s.batchSize)
	s.bufferMutex.Unlock()

	if err := s.db.LogDB.CreateInBatches(logs, len(logs)).Error; err != nil {
		fmt.Printf("error flushing logs: %v\n", err)
	}
}

func (s *Service) Close() {
	s.flushTimer.Stop()
	close(s.stopChan)
	s.wg.Wait()
}

func (s *Service) WriteLog(log *model.RuntimeLog) error {
	if log.CreatedAt.IsZero() {
		log.CreatedAt = time.Now()
	}

	s.bufferMutex.Lock()
	s.buffer = append(s.buffer, *log)
	shouldFlush := len(s.buffer) >= s.batchSize
	s.bufferMutex.Unlock()

	if shouldFlush {
		select {
		case s.flushChan <- struct{}{}:
		default:
		}
	}
	return nil
}

func (s *Service) WriteLogsBatch(logs []model.RuntimeLog) error {
	now := time.Now()
	for i := range logs {
		if logs[i].CreatedAt.IsZero() {
			logs[i].CreatedAt = now
		}
	}
	return s.db.LogDB.CreateInBatches(logs, MaxBatchSize).Error
}

func (s *Service) CleanupOldLogs(retentionDays int) (int64, error) {
	if retentionDays <= 0 {
		retentionDays = s.retentionDays
	}
	cutoff := time.Now().AddDate(0, 0, -retentionDays)

	result := s.db.LogDB.Where("created_at < ?", cutoff).Delete(&model.RuntimeLog{})
	if result.Error != nil {
		return 0, result.Error
	}

	s.db.LogDB.Where("stat_date < ?", cutoff.Format("2006-01-02")).Delete(&model.TaskStat{})
	s.db.LogDB.Where("stat_date < ?", cutoff.Format("2006-01-02")).Delete(&model.NodeStat{})

	return result.RowsAffected, nil
}

func (s *Service) QueryLogs(params LogQueryParams) ([]model.RuntimeLog, int64, error) {
	var logs []model.RuntimeLog
	var total int64
	q := s.db.LogDB.Model(&model.RuntimeLog{})
	if params.Level != "" {
		q = q.Where("level = ?", params.Level)
	}
	if params.Module != "" {
		q = q.Where("module = ?", params.Module)
	}
	if params.NodeID != "" {
		q = q.Where("node_id = ?", params.NodeID)
	}
	if params.ClusterID != "" {
		q = q.Where("cluster_id = ?", params.ClusterID)
	}
	if params.TaskID != "" {
		q = q.Where("task_id = ?", params.TaskID)
	}
	if params.StartTime != "" {
		q = q.Where("created_at >= ?", params.StartTime)
	}
	if params.EndTime != "" {
		q = q.Where("created_at <= ?", params.EndTime)
	}
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	offset := (params.Page - 1) * params.PageSize
	if err := q.Offset(offset).Limit(params.PageSize).Order("created_at DESC").Find(&logs).Error; err != nil {
		return nil, 0, err
	}
	return logs, total, nil
}

func (s *Service) GetTaskStats(clusterID, statDate string) ([]model.TaskStat, error) {
	var stats []model.TaskStat
	q := s.db.LogDB.Model(&model.TaskStat{})
	if clusterID != "" {
		q = q.Where("cluster_id = ?", clusterID)
	}
	if statDate != "" {
		q = q.Where("stat_date = ?", statDate)
	}
	if err := q.Order("stat_date DESC").Find(&stats).Error; err != nil {
		return nil, err
	}
	return stats, nil
}

func (s *Service) GetNodeStats(nodeID, statDate string) ([]model.NodeStat, error) {
	var stats []model.NodeStat
	q := s.db.LogDB.Model(&model.NodeStat{})
	if nodeID != "" {
		q = q.Where("node_id = ?", nodeID)
	}
	if statDate != "" {
		q = q.Where("stat_date = ?", statDate)
	}
	if err := q.Order("stat_date DESC").Find(&stats).Error; err != nil {
		return nil, err
	}
	return stats, nil
}

func (s *Service) AggregateTaskStats(clusterID string) (*model.TaskStat, error) {
	today := time.Now().Format("2006-01-02")
	var total, pending, running, completed, failed int64
	var avgDur float64

	q := s.db.ConfigDB.Model(&model.Task{})
	if clusterID != "" {
		q = q.Where("cluster_id = ?", clusterID)
	}
	q.Count(&total)
	s.db.ConfigDB.Model(&model.Task{}).Where("cluster_id = ? AND status = ?", clusterID, "pending").Count(&pending)
	s.db.ConfigDB.Model(&model.Task{}).Where("cluster_id = ? AND status = ?", clusterID, "running").Count(&running)
	s.db.ConfigDB.Model(&model.Task{}).Where("cluster_id = ? AND status = ?", clusterID, "completed").Count(&completed)
	s.db.ConfigDB.Model(&model.Task{}).Where("cluster_id = ? AND status = ?", clusterID, "failed").Count(&failed)

	var completedTasks []model.Task
	s.db.ConfigDB.Where("cluster_id = ? AND status = ? AND started_at IS NOT NULL AND finished_at IS NOT NULL", clusterID, "completed").Find(&completedTasks)
	var totalDur float64
	for _, t := range completedTasks {
		if t.StartedAt != nil && t.FinishedAt != nil {
			totalDur += t.FinishedAt.Sub(*t.StartedAt).Seconds()
		}
	}
	if len(completedTasks) > 0 {
		avgDur = totalDur / float64(len(completedTasks))
	}

	stat := &model.TaskStat{
		ClusterID:      clusterID,
		TotalTasks:     total,
		PendingTasks:   pending,
		RunningTasks:   running,
		CompletedTasks: completed,
		FailedTasks:    failed,
		AvgDurationSec: avgDur,
		StatDate:       today,
	}

	s.db.LogDB.Where("cluster_id = ? AND stat_date = ?", clusterID, today).FirstOrCreate(stat)
	s.db.LogDB.Save(stat)

	return stat, nil
}

func (s *Service) AggregateNodeStats(nodeID string) (*model.NodeStat, error) {
	today := time.Now().Format("2006-01-02")
	var node model.Node
	if err := s.db.ConfigDB.Where("id = ?", nodeID).First(&node).Error; err != nil {
		return nil, err
	}

	var activeTasks int64
	s.db.ConfigDB.Model(&model.Task{}).Where("node_id = ? AND status = ?", nodeID, "running").Count(&activeTasks)

	stat := &model.NodeStat{
		NodeID:       nodeID,
		ClusterID:    node.ClusterID,
		CPUUsage:     node.CPUUsage,
		MemoryUsage:  node.MemoryUsage,
		DiskUsage:    node.DiskUsage,
		ActiveTasks:  int(activeTasks),
		StatDate:     today,
	}

	s.db.LogDB.Where("node_id = ? AND stat_date = ?", nodeID, today).FirstOrCreate(stat)
	s.db.LogDB.Save(stat)

	return stat, nil
}

type LogQueryParams struct {
	Level     string `form:"level"`
	Module    string `form:"module"`
	NodeID    string `form:"node_id"`
	ClusterID string `form:"cluster_id"`
	TaskID    string `form:"task_id"`
	StartTime string `form:"start_time"`
	EndTime   string `form:"end_time"`
	Page      int    `form:"page"`
	PageSize  int    `form:"page_size"`
}

func (s *Service) GetConfigDB() *gorm.DB {
	return s.db.ConfigDB
}
