package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Node struct {
	ID          string    `gorm:"primaryKey" json:"id"`
	Name        string    `json:"name"`
	ClusterID   string    `json:"cluster_id"`
	Address     string    `json:"address"`
	Status      string    `json:"status"`
	CPUUsage    float64   `json:"cpu_usage"`
	MemoryUsage float64   `json:"memory_usage"`
	DiskUsage   float64   `json:"disk_usage"`
	LastHeartbeat time.Time `json:"last_heartbeat"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (n *Node) BeforeCreate(tx *gorm.DB) error {
	if n.ID == "" {
		n.ID = uuid.New().String()
	}
	return nil
}

type Task struct {
	ID          string    `gorm:"primaryKey" json:"id"`
	Name        string    `json:"name"`
	Type        string    `json:"type"`
	Payload     string    `json:"payload"`
	Status      string    `json:"status"`
	Priority    int       `json:"priority"`
	NodeID      string    `json:"node_id"`
	ClusterID   string    `json:"cluster_id"`
	RetryCount  int       `json:"retry_count"`
	MaxRetries  int       `json:"max_retries"`
	Result      string    `json:"result"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	StartedAt   *time.Time `json:"started_at"`
	FinishedAt  *time.Time `json:"finished_at"`
}

func (t *Task) BeforeCreate(tx *gorm.DB) error {
	if t.ID == "" {
		t.ID = uuid.New().String()
	}
	return nil
}

type Cluster struct {
	ID          string    `gorm:"primaryKey" json:"id"`
	Name        string    `json:"name"`
	Address     string    `json:"address"`
	Status      string    `json:"status"`
	NodeCount   int       `json:"node_count"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (c *Cluster) BeforeCreate(tx *gorm.DB) error {
	if c.ID == "" {
		c.ID = uuid.New().String()
	}
	return nil
}

type RouteRule struct {
	ID          string    `gorm:"primaryKey" json:"id"`
	Name        string    `json:"name"`
	ClusterID   string    `json:"cluster_id"`
	Priority    int       `json:"priority"`
	Strategy    string    `json:"strategy"`
	Condition   string    `json:"condition"`
	Enabled     bool      `json:"enabled"`
	Version     int64     `json:"version" gorm:"default:1"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (r *RouteRule) BeforeCreate(tx *gorm.DB) error {
	if r.ID == "" {
		r.ID = uuid.New().String()
	}
	r.Version = 1
	return nil
}
