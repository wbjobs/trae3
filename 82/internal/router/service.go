package router

import (
	"edge-platform/internal/db"
	"edge-platform/internal/model"
	"errors"
	"sort"
	"sync"
	"time"

	"gorm.io/gorm"
)

var (
	ErrRuleVersionMismatch = errors.New("rule version mismatch, please refresh and retry")
)

const (
	StrategyRoundRobin  = "round_robin"
	StrategyLeastCPU    = "least_cpu"
	StrategyLeastMemory = "least_memory"
	StrategyWeighted    = "weighted"

	cacheTTL = 5 * time.Second
)

type ruleCacheEntry struct {
	rules     []model.RouteRule
	timestamp time.Time
}

type Service struct {
	db         *db.Databases
	ruleCache  map[string]ruleCacheEntry
	cacheMutex sync.RWMutex
}

func NewService(d *db.Databases) *Service {
	return &Service{
		db:        d,
		ruleCache: make(map[string]ruleCacheEntry),
	}
}

func (s *Service) ListRules(clusterID string) ([]model.RouteRule, error) {
	s.cacheMutex.RLock()
	if entry, ok := s.ruleCache[clusterID]; ok && time.Since(entry.timestamp) < cacheTTL {
		s.cacheMutex.RUnlock()
		return entry.rules, nil
	}
	s.cacheMutex.RUnlock()

	var rules []model.RouteRule
	q := s.db.ConfigDB.Model(&model.RouteRule{})
	if clusterID != "" {
		q = q.Where("cluster_id = ?", clusterID)
	}
	if err := q.Order("priority DESC").Find(&rules).Error; err != nil {
		return nil, err
	}

	s.cacheMutex.Lock()
	s.ruleCache[clusterID] = ruleCacheEntry{
		rules:     rules,
		timestamp: time.Now(),
	}
	s.cacheMutex.Unlock()

	return rules, nil
}

func (s *Service) invalidateCache(clusterID string) {
	s.cacheMutex.Lock()
	delete(s.ruleCache, clusterID)
	delete(s.ruleCache, "")
	s.cacheMutex.Unlock()
}

func (s *Service) CreateRule(rule *model.RouteRule) error {
	err := s.db.ConfigDB.Transaction(func(tx *gorm.DB) error {
		var maxPriority int
		if err := tx.Model(&model.RouteRule{}).Where("cluster_id = ?", rule.ClusterID).
			Select("COALESCE(MAX(priority), 0)").Scan(&maxPriority).Error; err != nil {
			return err
		}
		if rule.Priority <= 0 {
			rule.Priority = maxPriority + 10
		}
		return tx.Create(rule).Error
	})
	if err == nil {
		s.invalidateCache(rule.ClusterID)
	}
	return err
}

func (s *Service) UpdateRule(rule *model.RouteRule) error {
	err := s.db.ConfigDB.Transaction(func(tx *gorm.DB) error {
		var existing model.RouteRule
		if err := tx.Clauses().Where("id = ?", rule.ID).First(&existing).Error; err != nil {
			return err
		}
		if rule.Version > 0 && existing.Version != rule.Version {
			return ErrRuleVersionMismatch
		}

		rule.Version = existing.Version + 1
		return tx.Model(&existing).Updates(map[string]interface{}{
			"name":      rule.Name,
			"priority":  rule.Priority,
			"strategy":  rule.Strategy,
			"condition": rule.Condition,
			"enabled":   rule.Enabled,
			"version":   rule.Version,
		}).Error
	})
	if err == nil {
		s.invalidateCache(rule.ClusterID)
	}
	return err
}

func (s *Service) DeleteRule(ruleID string) error {
	var rule model.RouteRule
	if err := s.db.ConfigDB.Where("id = ?", ruleID).First(&rule).Error; err != nil {
		return err
	}
	if err := s.db.ConfigDB.Delete(&rule).Error; err != nil {
		return err
	}
	s.invalidateCache(rule.ClusterID)
	return nil
}

func (s *Service) SelectNode(clusterID string, strategy string) (*model.Node, error) {
	var nodes []model.Node
	if err := s.db.ConfigDB.Where("cluster_id = ? AND status = ?", clusterID, "online").
		Find(&nodes).Error; err != nil {
		return nil, err
	}
	if len(nodes) == 0 {
		return nil, ErrNoNodesAvailable
	}

	switch strategy {
	case StrategyLeastCPU:
		return s.leastCPU(nodes), nil
	case StrategyLeastMemory:
		return s.leastMemory(nodes), nil
	case StrategyWeighted:
		return s.weighted(nodes), nil
	case StrategyRoundRobin:
		fallthrough
	default:
		return s.roundRobin(nodes), nil
	}
}

func (s *Service) RouteTask(task *model.Task) (*model.Node, error) {
	var rules []model.RouteRule
	if err := s.db.ConfigDB.Where("cluster_id = ? AND enabled = ?", task.ClusterID, true).
		Order("priority DESC").Find(&rules).Error; err != nil {
		return nil, err
	}
	strategy := StrategyRoundRobin
	if len(rules) > 0 {
		strategy = rules[0].Strategy
	}
	return s.SelectNode(task.ClusterID, strategy)
}

func (s *Service) leastCPU(nodes []model.Node) *model.Node {
	sort.Slice(nodes, func(i, j int) bool {
		return nodes[i].CPUUsage < nodes[j].CPUUsage
	})
	return &nodes[0]
}

func (s *Service) leastMemory(nodes []model.Node) *model.Node {
	sort.Slice(nodes, func(i, j int) bool {
		return nodes[i].MemoryUsage < nodes[j].MemoryUsage
	})
	return &nodes[0]
}

func (s *Service) roundRobin(nodes []model.Node) *model.Node {
	type nodeLoad struct {
		node  model.Node
		count int64
	}
	loads := make([]nodeLoad, len(nodes))
	for i, n := range nodes {
		var count int64
		s.db.ConfigDB.Model(&model.Task{}).Where("node_id = ? AND status = ?", n.ID, "running").Count(&count)
		loads[i] = nodeLoad{node: n, count: count}
	}
	sort.Slice(loads, func(i, j int) bool {
		return loads[i].count < loads[j].count
	})
	return &loads[0].node
}

func (s *Service) weighted(nodes []model.Node) *model.Node {
	sort.Slice(nodes, func(i, j int) bool {
		scoreI := nodes[i].CPUUsage*0.4 + nodes[i].MemoryUsage*0.3 + nodes[i].DiskUsage*0.3
		scoreJ := nodes[j].CPUUsage*0.4 + nodes[j].MemoryUsage*0.3 + nodes[j].DiskUsage*0.3
		return scoreI < scoreJ
	})
	return &nodes[0]
}
