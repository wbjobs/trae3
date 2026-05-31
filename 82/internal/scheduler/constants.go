package scheduler

import (
	"edge-platform/internal/model"
	"time"
)

const (
	PriorityCritical = 100
	PriorityHigh     = 75
	PriorityMedium   = 50
	PriorityLow      = 25

	StatusPending   = "pending"
	StatusRunning   = "running"
	StatusCompleted = "completed"
	StatusFailed    = "failed"
	StatusLost      = "lost"
	StatusMigrating = "migrating"

	DefaultTaskTimeout = 30 * time.Minute
	MaxStuckTasks      = 100
)

func PriorityLabel(p int) string {
	switch {
	case p >= PriorityCritical:
		return "critical"
	case p >= PriorityHigh:
		return "high"
	case p >= PriorityMedium:
		return "medium"
	default:
		return "low"
	}
}

type DispatchStrategy interface {
	Select(nodes []model.Node, task *model.Task) (*model.Node, error)
	Name() string
}
