package scheduler

import "errors"

var (
	ErrTaskNotPending  = errors.New("task is not in pending state")
	ErrNoAvailableNodes = errors.New("no available nodes in cluster")
)
