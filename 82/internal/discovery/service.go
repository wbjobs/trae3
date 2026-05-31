package discovery

import (
	"edge-platform/internal/db"
	"edge-platform/internal/model"
	"math/rand"
	"time"

	"gorm.io/gorm"
)

type Service struct {
	db *db.Databases
}

func NewService(d *db.Databases) *Service {
	return &Service{db: d}
}

func (s *Service) ListNodes(clusterID string, status string, page, pageSize int) ([]model.Node, int64, error) {
	var nodes []model.Node
	var total int64
	q := s.db.ConfigDB.Model(&model.Node{})
	if clusterID != "" {
		q = q.Where("cluster_id = ?", clusterID)
	}
	if status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	offset := (page - 1) * pageSize
	if err := q.Offset(offset).Limit(pageSize).Order("updated_at DESC").Find(&nodes).Error; err != nil {
		return nil, 0, err
	}
	return nodes, total, nil
}

func (s *Service) GetNode(nodeID string) (*model.Node, error) {
	var node model.Node
	if err := s.db.ConfigDB.Where("id = ?", nodeID).First(&node).Error; err != nil {
		return nil, err
	}
	return &node, nil
}

func (s *Service) RegisterNode(node *model.Node) error {
	node.Status = "online"
	node.LastHeartbeat = time.Now()
	return s.db.ConfigDB.Create(node).Error
}

func (s *Service) DeregisterNode(nodeID string) error {
	return s.db.ConfigDB.Model(&model.Node{}).Where("id = ?", nodeID).Update("status", "offline").Error
}

func (s *Service) ProbeNode(nodeID string) (*model.Node, error) {
	var node model.Node
	if err := s.db.ConfigDB.Where("id = ?", nodeID).First(&node).Error; err != nil {
		return nil, err
	}
	node.CPUUsage = roundFloat(rand.Float64() * 100)
	node.MemoryUsage = roundFloat(rand.Float64() * 100)
	node.DiskUsage = roundFloat(rand.Float64() * 100)
	node.LastHeartbeat = time.Now()
	node.Status = "online"
	if err := s.db.ConfigDB.Save(&node).Error; err != nil {
		return nil, err
	}
	return &node, nil
}

func (s *Service) ProbeCluster(clusterID string) ([]model.Node, error) {
	var nodes []model.Node
	if err := s.db.ConfigDB.Where("cluster_id = ?", clusterID).Find(&nodes).Error; err != nil {
		return nil, err
	}
	now := time.Now()
	for i := range nodes {
		nodes[i].CPUUsage = roundFloat(rand.Float64() * 100)
		nodes[i].MemoryUsage = roundFloat(rand.Float64() * 100)
		nodes[i].DiskUsage = roundFloat(rand.Float64() * 100)
		nodes[i].LastHeartbeat = now
		nodes[i].Status = "online"
	}
	if err := s.db.ConfigDB.Save(&nodes).Error; err != nil {
		return nil, err
	}
	return nodes, nil
}

func (s *Service) SyncClusterNodes(clusterID string, address string) (int, error) {
	var count int64
	s.db.ConfigDB.Model(&model.Node{}).Where("cluster_id = ?", clusterID).Count(&count)
	if count == 0 {
		seeds := generateSeedNodes(clusterID, address)
		if err := s.db.ConfigDB.Create(&seeds).Error; err != nil {
			return 0, err
		}
		return len(seeds), nil
	}
	return int(count), nil
}

func (s *Service) GetAvailableNodes(clusterID string) ([]model.Node, error) {
	var nodes []model.Node
	if err := s.db.ConfigDB.Where("cluster_id = ? AND status = ?", clusterID, "online").
		Order("cpu_usage ASC").Find(&nodes).Error; err != nil {
		return nil, err
	}
	return nodes, nil
}

func (s *Service) GetDB() *gorm.DB {
	return s.db.ConfigDB
}

func generateSeedNodes(clusterID, baseAddr string) []model.Node {
	now := time.Now()
	nodes := make([]model.Node, 3)
	for i := 0; i < 3; i++ {
		nodes[i] = model.Node{
			Name:          "node-" + clusterID + "-" + string(rune('A'+i)),
			ClusterID:     clusterID,
			Address:       baseAddr,
			Status:        "online",
			CPUUsage:      roundFloat(rand.Float64() * 100),
			MemoryUsage:   roundFloat(rand.Float64() * 100),
			DiskUsage:     roundFloat(rand.Float64() * 100),
			LastHeartbeat: now,
		}
	}
	return nodes
}

func roundFloat(f float64) float64 {
	return float64(int(f*100)) / 100
}
