package scheduler

import (
	"edge-platform/internal/db"
	"edge-platform/internal/discovery"
	"edge-platform/internal/model"
	"context"
	"fmt"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Service struct {
	db        *db.Databases
	discovery *discovery.Service
	strategy  DispatchStrategy
}

func NewService(d *db.Databases, disc *discovery.Service) *Service {
	return &Service{
		db:        d,
		discovery: disc,
		strategy:  &LeastLoadStrategy{},
	}
}

func (s *Service) SetStrategy(strategy DispatchStrategy) {
	s.strategy = strategy
}

func (s *Service) SetStrategyByName(name string) {
	s.strategy = GetStrategy(name)
}

func (s *Service) CreateTask(task *model.Task) error {
	task.Status = StatusPending
	task.RetryCount = 0
	if task.MaxRetries == 0 {
		task.MaxRetries = 3
	}
	if task.Priority == 0 {
		task.Priority = PriorityMedium
	}
	return s.db.ConfigDB.Create(task).Error
}

func (s *Service) GetTask(taskID string) (*model.Task, error) {
	var task model.Task
	if err := s.db.ConfigDB.Where("id = ?", taskID).First(&task).Error; err != nil {
		return nil, err
	}
	return &task, nil
}

func (s *Service) ListTasks(clusterID, status string, priority int, page, pageSize int) ([]model.Task, int64, error) {
	var tasks []model.Task
	var total int64
	q := s.db.ConfigDB.Model(&model.Task{})
	if clusterID != "" {
		q = q.Where("cluster_id = ?", clusterID)
	}
	if status != "" {
		q = q.Where("status = ?", status)
	}
	if priority > 0 {
		q = q.Where("priority >= ?", priority)
	}
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	offset := (page - 1) * pageSize
	if err := q.Offset(offset).Limit(pageSize).Order("priority DESC, created_at ASC").Find(&tasks).Error; err != nil {
		return nil, 0, err
	}
	return tasks, total, nil
}

func (s *Service) DispatchTask(taskID string) (*model.Task, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var task model.Task
	err := s.db.ConfigDB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ?", taskID).First(&task).Error; err != nil {
			return err
		}
		if task.Status != StatusPending {
			return ErrTaskNotPending
		}

		node, err := s.findNodeForTask(&task)
		if err != nil {
			return err
		}

		now := time.Now()
		task.NodeID = node.ID
		task.ClusterID = node.ClusterID
		task.Status = StatusRunning
		task.StartedAt = &now
		return tx.Save(&task).Error
	})

	if err != nil {
		return nil, err
	}
	return &task, nil
}

func (s *Service) findNodeForTask(task *model.Task) (*model.Node, error) {
	nodes, err := s.discovery.GetAvailableNodes(task.ClusterID)
	if err != nil {
		return nil, err
	}
	if len(nodes) > 0 {
		return s.strategy.Select(nodes, task)
	}

	var allNodes []model.Node
	if err := s.db.ConfigDB.Where("status = ?", "online").
		Order("cpu_usage ASC, memory_usage ASC").Find(&allNodes).Error; err != nil {
		return nil, err
	}
	if len(allNodes) > 0 {
		return s.strategy.Select(allNodes, task)
	}

	return nil, ErrNoAvailableNodes
}

func (s *Service) RecoverStuckTasks(timeout time.Duration) (int, error) {
	if timeout <= 0 {
		timeout = DefaultTaskTimeout
	}
	cutoff := time.Now().Add(-timeout)

	var tasks []model.Task
	if err := s.db.ConfigDB.Where("status = ? AND started_at < ?", StatusRunning, cutoff).
		Limit(MaxStuckTasks).Find(&tasks).Error; err != nil {
		return 0, err
	}

	recovered := 0
	for _, task := range tasks {
		task.RetryCount++
		if task.RetryCount >= task.MaxRetries {
			task.Status = StatusLost
			now := time.Now()
			task.FinishedAt = &now
			task.Result = fmt.Sprintf("task timed out after %v, exceeded max retries", timeout)
		} else {
			task.Status = StatusPending
			task.NodeID = ""
			task.StartedAt = nil
		}
		if err := s.db.ConfigDB.Save(&task).Error; err == nil {
			recovered++
		}
	}
	return recovered, nil
}

func (s *Service) MigrateTasksFromNode(nodeID string) (int, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var node model.Node
	if err := s.db.ConfigDB.Where("id = ?", nodeID).First(&node).Error; err != nil {
		return 0, fmt.Errorf("node %s not found: %w", nodeID, err)
	}

	var tasks []model.Task
	if err := s.db.ConfigDB.WithContext(ctx).Where("node_id = ? AND status = ?", nodeID, StatusRunning).
		Order("priority DESC, created_at ASC").Find(&tasks).Error; err != nil {
		return 0, err
	}

	if len(tasks) == 0 {
		return 0, nil
	}

	node.Status = "offline"
	s.db.ConfigDB.Save(&node)

	migrated := 0
	for _, task := range tasks {
		task.Status = StatusMigrating
		task.NodeID = ""
		task.StartedAt = nil
		s.db.ConfigDB.Save(&task)

		node, err := s.findNodeForTask(&task)
		if err != nil {
			task.RetryCount++
			if task.RetryCount >= task.MaxRetries {
				task.Status = StatusFailed
				now := time.Now()
				task.FinishedAt = &now
				task.Result = "migration failed: no available nodes"
			} else {
				task.Status = StatusPending
			}
			s.db.ConfigDB.Save(&task)
			continue
		}

		now := time.Now()
		task.NodeID = node.ID
		task.ClusterID = node.ClusterID
		task.Status = StatusRunning
		task.StartedAt = &now
		s.db.ConfigDB.Save(&task)
		migrated++
	}
	return migrated, nil
}

func (s *Service) MigrateFaultyNodes() (int, error) {
	var nodes []model.Node
	heartbeatCutoff := time.Now().Add(-5 * time.Minute)
	if err := s.db.ConfigDB.Where("status = ? AND last_heartbeat < ?", "online", heartbeatCutoff).
		Find(&nodes).Error; err != nil {
		return 0, err
	}

	totalMigrated := 0
	for _, node := range nodes {
		migrated, err := s.MigrateTasksFromNode(node.ID)
		if err != nil {
			continue
		}
		totalMigrated += migrated
	}
	return totalMigrated, nil
}

func (s *Service) CompleteTask(taskID string, result string) (*model.Task, error) {
	var task model.Task
	if err := s.db.ConfigDB.Where("id = ?", taskID).First(&task).Error; err != nil {
		return nil, err
	}
	now := time.Now()
	task.Status = StatusCompleted
	task.Result = result
	task.FinishedAt = &now
	if err := s.db.ConfigDB.Save(&task).Error; err != nil {
		return nil, err
	}
	return &task, nil
}

func (s *Service) FailTask(taskID string, reason string) (*model.Task, error) {
	var task model.Task
	if err := s.db.ConfigDB.Where("id = ?", taskID).First(&task).Error; err != nil {
		return nil, err
	}
	task.RetryCount++
	if task.RetryCount >= task.MaxRetries {
		task.Status = StatusFailed
		now := time.Now()
		task.FinishedAt = &now
	} else {
		task.Status = StatusPending
		task.NodeID = ""
		task.StartedAt = nil
	}
	task.Result = reason
	if err := s.db.ConfigDB.Save(&task).Error; err != nil {
		return nil, err
	}
	return &task, nil
}

func (s *Service) CancelTask(taskID string) error {
	return s.db.ConfigDB.Model(&model.Task{}).Where("id = ? AND status = ?", taskID, StatusPending).
		Update("status", StatusFailed).Error
}

func (s *Service) BatchDispatch(clusterID string) (int, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var tasks []model.Task
	if err := s.db.ConfigDB.WithContext(ctx).Where("cluster_id = ? AND status = ?", clusterID, StatusPending).
		Order("priority DESC, created_at ASC").Find(&tasks).Error; err != nil {
		return 0, err
	}

	dispatched := 0
	for _, task := range tasks {
		if _, err := s.DispatchTask(task.ID); err == nil {
			dispatched++
		}
	}
	return dispatched, nil
}

func (s *Service) DispatchByPriority(limit int) (int, error) {
	if limit <= 0 {
		limit = 50
	}
	var tasks []model.Task
	if err := s.db.ConfigDB.Where("status = ?", StatusPending).
		Order("priority DESC, created_at ASC").Limit(limit).Find(&tasks).Error; err != nil {
		return 0, err
	}

	dispatched := 0
	for _, task := range tasks {
		if _, err := s.DispatchTask(task.ID); err == nil {
			dispatched++
		}
	}
	return dispatched, nil
}

func (s *Service) Ping() error {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	sqlDB, err := s.db.ConfigDB.DB()
	if err != nil {
		return err
	}
	return sqlDB.PingContext(ctx)
}

func (s *Service) GetDB() *gorm.DB {
	return s.db.ConfigDB
}
