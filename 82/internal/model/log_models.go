package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type RuntimeLog struct {
	ID        string    `gorm:"primaryKey" json:"id"`
	Level     string    `json:"level"`
	Module    string    `json:"module"`
	NodeID    string    `json:"node_id"`
	ClusterID string    `json:"cluster_id"`
	TaskID    string    `json:"task_id"`
	Message   string    `json:"message"`
	Metadata  string    `json:"metadata"`
	CreatedAt time.Time `json:"created_at" gorm:"index"`
}

func (r *RuntimeLog) BeforeCreate(tx *gorm.DB) error {
	if r.ID == "" {
		r.ID = uuid.New().String()
	}
	return nil
}

type TaskStat struct {
	ID              string    `gorm:"primaryKey" json:"id"`
	ClusterID       string    `json:"cluster_id"`
	TotalTasks      int64     `json:"total_tasks"`
	PendingTasks    int64     `json:"pending_tasks"`
	RunningTasks    int64     `json:"running_tasks"`
	CompletedTasks  int64     `json:"completed_tasks"`
	FailedTasks     int64     `json:"failed_tasks"`
	AvgDurationSec  float64   `json:"avg_duration_sec"`
	StatDate        string    `json:"stat_date" gorm:"index"`
	CreatedAt       time.Time `json:"created_at"`
}

func (t *TaskStat) BeforeCreate(tx *gorm.DB) error {
	if t.ID == "" {
		t.ID = uuid.New().String()
	}
	return nil
}

type NodeStat struct {
	ID             string    `gorm:"primaryKey" json:"id"`
	NodeID         string    `json:"node_id"`
	ClusterID      string    `json:"cluster_id"`
	CPUUsage       float64   `json:"cpu_usage"`
	MemoryUsage    float64   `json:"memory_usage"`
	DiskUsage      float64   `json:"disk_usage"`
	NetworkInMB    float64   `json:"network_in_mb"`
	NetworkOutMB   float64   `json:"network_out_mb"`
	ActiveTasks    int       `json:"active_tasks"`
	StatDate       string    `json:"stat_date" gorm:"index"`
	CreatedAt      time.Time `json:"created_at"`
}

func (n *NodeStat) BeforeCreate(tx *gorm.DB) error {
	if n.ID == "" {
		n.ID = uuid.New().String()
	}
	return nil
}
