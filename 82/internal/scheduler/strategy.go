package scheduler

import (
	"edge-platform/internal/model"
	"sort"
)

type LeastLoadStrategy struct{}

func (s *LeastLoadStrategy) Select(nodes []model.Node, task *model.Task) (*model.Node, error) {
	if len(nodes) == 0 {
		return nil, ErrNoAvailableNodes
	}
	sort.Slice(nodes, func(i, j int) bool {
		return nodes[i].CPUUsage+nodes[i].MemoryUsage < nodes[j].CPUUsage+nodes[j].MemoryUsage
	})
	return &nodes[0], nil
}

func (s *LeastLoadStrategy) Name() string { return "least_load" }

type LeastCPUStrategy struct{}

func (s *LeastCPUStrategy) Select(nodes []model.Node, task *model.Task) (*model.Node, error) {
	if len(nodes) == 0 {
		return nil, ErrNoAvailableNodes
	}
	sort.Slice(nodes, func(i, j int) bool {
		return nodes[i].CPUUsage < nodes[j].CPUUsage
	})
	return &nodes[0], nil
}

func (s *LeastCPUStrategy) Name() string { return "least_cpu" }

type AffinityStrategy struct{}

func (s *AffinityStrategy) Select(nodes []model.Node, task *model.Task) (*model.Node, error) {
	if len(nodes) == 0 {
		return nil, ErrNoAvailableNodes
	}
	if task.ClusterID != "" {
		for _, n := range nodes {
			if n.ClusterID == task.ClusterID {
				return &n, nil
			}
		}
	}
	sort.Slice(nodes, func(i, j int) bool {
		return nodes[i].CPUUsage+nodes[i].MemoryUsage < nodes[j].CPUUsage+nodes[j].MemoryUsage
	})
	return &nodes[0], nil
}

func (s *AffinityStrategy) Name() string { return "affinity" }

func GetStrategy(name string) DispatchStrategy {
	switch name {
	case "least_cpu":
		return &LeastCPUStrategy{}
	case "affinity":
		return &AffinityStrategy{}
	case "least_load":
		fallthrough
	default:
		return &LeastLoadStrategy{}
	}
}
