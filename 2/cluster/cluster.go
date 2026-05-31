package cluster

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
	"industrial-protocol-gateway/config"
	"industrial-protocol-gateway/logger"
	"industrial-protocol-gateway/protocol"
	"industrial-protocol-gateway/storage"

	clientv3 "go.etcd.io/etcd/client/v3"
)

type ClusterMode string

const (
	ModeRaft ClusterMode = "raft"
	ModeEtcd ClusterMode = "etcd"
)

type NodeState string

const (
	StateLeader    NodeState = "leader"
	StateFollower  NodeState = "follower"
	StateCandidate NodeState = "candidate"
	StateUnknown   NodeState = "unknown"
)

type NodeInfo struct {
	ID       string    `json:"id"`
	Address  string    `json:"address"`
	HTTPAddr string    `json:"http_addr"`
	State    NodeState `json:"state"`
	JoinTime time.Time `json:"join_time"`
	LastSeen time.Time `json:"last_seen"`
}

type SyncCommandType string

const (
	CmdForwardTargetAdd     SyncCommandType = "forward_target_add"
	CmdForwardTargetRemove  SyncCommandType = "forward_target_remove"
	CmdProtocolConfigUpdate SyncCommandType = "protocol_config_update"
	CmdRateLimitUpdate      SyncCommandType = "ratelimit_update"
	CmdDeviceConnect        SyncCommandType = "device_connect"
	CmdDeviceDisconnect     SyncCommandType = "device_disconnect"
)

type SyncCommand struct {
	ID        string          `json:"id"`
	Type      SyncCommandType `json:"type"`
	Data      json.RawMessage `json:"data"`
	NodeID    string          `json:"node_id"`
	Timestamp time.Time       `json:"timestamp"`
}

type failedCommand struct {
	cmd       *SyncCommand
	nodeID    string
	retryCount int
	nextRetry time.Time
}

type ClusterManager struct {
	mode           ClusterMode
	nodeID         string
	state          NodeState
	nodes          map[string]*NodeInfo
	mu             sync.RWMutex
	etcdClient     *clientv3.Client
	dataChan       chan *SyncCommand
	stopCh         chan struct{}
	leaseID        clientv3.LeaseID
	config         config.ClusterConfig
	syncHandlers   map[SyncCommandType]func(*SyncCommand) error
	failedCommands []*failedCommand
	failedMu       sync.Mutex
	processedCmds  map[string]bool
	processedMu    sync.RWMutex
}

var (
	clusterManager *ClusterManager
	clusterOnce    sync.Once
)

func InitCluster() error {
	var initErr error
	clusterOnce.Do(func() {
		cfg := config.Get().Cluster

		mode := ClusterMode(cfg.Mode)
		if mode == "" {
			mode = ModeEtcd
		}

		clusterManager = &ClusterManager{
			mode:           mode,
			nodeID:         cfg.NodeID,
			state:          StateFollower,
			nodes:          make(map[string]*NodeInfo),
			config:         cfg,
			stopCh:         make(chan struct{}),
			dataChan:       make(chan *SyncCommand, 1000),
			syncHandlers:   make(map[SyncCommandType]func(*SyncCommand) error),
			failedCommands: make([]*failedCommand, 0),
			processedCmds:  make(map[string]bool),
		}

		clusterManager.registerDefaultHandlers()

		if mode == ModeEtcd {
			if err := clusterManager.initEtcd(); err != nil {
				initErr = err
				return
			}
		}

		go clusterManager.processCommands()
		go clusterManager.heartbeat()
		go clusterManager.watchCluster()
		go clusterManager.watchCommands()
		go clusterManager.retryFailedCommands()

		logger.LogCluster("init", cfg.NodeID, true, nil)
	})
	return initErr
}

func (cm *ClusterManager) registerDefaultHandlers() {
	cm.syncHandlers[CmdForwardTargetAdd] = cm.handleForwardTargetAdd
	cm.syncHandlers[CmdForwardTargetRemove] = cm.handleForwardTargetRemove
}

func (cm *ClusterManager) initEtcd() error {
	var err error
	cm.etcdClient, err = clientv3.New(clientv3.Config{
		Endpoints:   cm.config.EtcdEndpoints,
		DialTimeout: 5 * time.Second,
	})
	if err != nil {
		return fmt.Errorf("connect etcd failed: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := cm.etcdClient.Grant(ctx, 30)
	if err != nil {
		return fmt.Errorf("grant lease failed: %w", err)
	}
	cm.leaseID = resp.ID

	_, err = cm.etcdClient.KeepAlive(context.Background(), cm.leaseID)
	if err != nil {
		return fmt.Errorf("keepalive lease failed: %w", err)
	}

	nodeKey := fmt.Sprintf("/industrial-gateway/cluster/nodes/%s", cm.nodeID)
	nodeInfo := &NodeInfo{
		ID:       cm.nodeID,
		Address:  cm.config.BindAddr,
		HTTPAddr: cm.config.HTTPAddr,
		State:    StateFollower,
		JoinTime: time.Now(),
		LastSeen: time.Now(),
	}

	nodeData, _ := json.Marshal(nodeInfo)
	_, err = cm.etcdClient.Put(ctx, nodeKey, string(nodeData), clientv3.WithLease(cm.leaseID))
	if err != nil {
		return fmt.Errorf("register node failed: %w", err)
	}

	cm.nodes[cm.nodeID] = nodeInfo
	logger.Infof("node %s registered to cluster", cm.nodeID)

	if err := cm.discoverNodes(); err != nil {
		logger.Errorf("discover nodes failed: %v", err)
	}

	return nil
}

func (cm *ClusterManager) discoverNodes() error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := cm.etcdClient.Get(ctx, "/industrial-gateway/cluster/nodes/", clientv3.WithPrefix())
	if err != nil {
		return err
	}

	cm.mu.Lock()
	defer cm.mu.Unlock()

	for _, kv := range resp.Kvs {
		var node NodeInfo
		if err := json.Unmarshal(kv.Value, &node); err != nil {
			continue
		}
		if node.ID != cm.nodeID {
			cm.nodes[node.ID] = &node
			logger.Infof("discovered node: %s (%s)", node.ID, node.Address)
		}
	}

	return nil
}

func (cm *ClusterManager) heartbeat() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			cm.mu.Lock()
			if node, ok := cm.nodes[cm.nodeID]; ok {
				node.LastSeen = time.Now()
			}
			cm.mu.Unlock()

			if cm.etcdClient != nil {
				ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
				nodeKey := fmt.Sprintf("/industrial-gateway/cluster/nodes/%s", cm.nodeID)
				nodeData, _ := json.Marshal(cm.nodes[cm.nodeID])
				cm.etcdClient.Put(ctx, nodeKey, string(nodeData), clientv3.WithLease(cm.leaseID))
				cancel()
			}

		case <-cm.stopCh:
			return
		}
	}
}

func (cm *ClusterManager) watchCluster() {
	if cm.etcdClient == nil {
		return
	}

	watchCh := cm.etcdClient.Watch(context.Background(), "/industrial-gateway/cluster/nodes/", clientv3.WithPrefix())

	for {
		select {
		case watchResp := <-watchCh:
			for _, ev := range watchResp.Events {
				cm.handleNodeEvent(ev)
			}
		case <-cm.stopCh:
			return
		}
	}
}

func (cm *ClusterManager) handleNodeEvent(ev *clientv3.Event) {
	nodeID := string(ev.Kv.Key)[len("/industrial-gateway/cluster/nodes/"):]

	cm.mu.Lock()
	defer cm.mu.Unlock()

	switch ev.Type {
	case clientv3.EventTypePut:
		var node NodeInfo
		if err := json.Unmarshal(ev.Kv.Value, &node); err == nil {
			if nodeID != cm.nodeID {
				cm.nodes[nodeID] = &node
				logger.Infof("node joined: %s", nodeID)
			}
		}
	case clientv3.EventTypeDelete:
		delete(cm.nodes, nodeID)
		logger.Infof("node left: %s", nodeID)
	}
}

func (cm *ClusterManager) processCommands() {
	for {
		select {
		case cmd := <-cm.dataChan:
			if err := cm.executeCommand(cmd); err != nil {
				logger.Errorf("execute sync command failed: %v", err)
			}
		case <-cm.stopCh:
			return
		}
	}
}

func (cm *ClusterManager) executeCommand(cmd *SyncCommand) error {
	if handler, ok := cm.syncHandlers[cmd.Type]; ok {
		return handler(cmd)
	}
	logger.Warnf("no handler for sync command type: %s", cmd.Type)
	return nil
}

func (cm *ClusterManager) handleForwardTargetAdd(cmd *SyncCommand) error {
	var target storage.ForwardTarget
	if err := json.Unmarshal(cmd.Data, &target); err != nil {
		return err
	}
	storage.AddForwardTarget(&target)
	logger.LogCluster("add_forward_target", cmd.NodeID, true, nil)
	return nil
}

func (cm *ClusterManager) handleForwardTargetRemove(cmd *SyncCommand) error {
	var targetID string
	if err := json.Unmarshal(cmd.Data, &targetID); err != nil {
		return err
	}
	storage.RemoveForwardTarget(targetID)
	logger.LogCluster("remove_forward_target", cmd.NodeID, true, nil)
	return nil
}

func (cm *ClusterManager) SyncCommand(cmd *SyncCommand) error {
	cmd.NodeID = cm.nodeID
	cmd.Timestamp = time.Now()
	cmd.ID = fmt.Sprintf("%d", common.GenerateID())

	if cm.etcdClient != nil {
		cmdKey := fmt.Sprintf("/industrial-gateway/cluster/commands/%s", cmd.ID)
		cmdData, _ := json.Marshal(cmd)

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		_, err := cm.etcdClient.Put(ctx, cmdKey, string(cmdData))
		cancel()

		if err != nil {
			logger.LogCluster("sync_command", cmd.NodeID, false, err)
			return fmt.Errorf("%w: %v", common.ErrClusterSyncFailed, err)
		}

		go cm.broadcastCommand(cmd)
	}

	cm.dataChan <- cmd
	logger.LogCluster("sync_command", cmd.NodeID, true, nil)
	return nil
}

func (cm *ClusterManager) broadcastCommand(cmd *SyncCommand) {
	cm.mu.RLock()
	nodes := make([]*NodeInfo, 0, len(cm.nodes))
	for _, node := range cm.nodes {
		if node.ID != cm.nodeID {
			nodes = append(nodes, node)
		}
	}
	cm.mu.RUnlock()

	for _, node := range nodes {
		go func(n *NodeInfo) {
			if err := cm.sendToNode(n, cmd); err != nil {
				logger.Errorf("broadcast to node %s failed: %v, will retry", n.ID, err)
				cm.addFailedCommand(cmd, n.ID)
			}
		}(node)
	}
}

func (cm *ClusterManager) sendToNode(node *NodeInfo, cmd *SyncCommand) error {
	url := fmt.Sprintf("http://%s/api/v1/cluster/sync", node.HTTPAddr)
	cmdData, err := json.Marshal(cmd)
	if err != nil {
		return fmt.Errorf("marshal command failed: %w", err)
	}

	maxRetries := 3
	var lastErr error

	for i := 0; i < maxRetries; i++ {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)

		req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(cmdData))
		if err != nil {
			cancel()
			lastErr = err
			time.Sleep(time.Duration(i+1) * 500 * time.Millisecond)
			continue
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			cancel()
			lastErr = err
			time.Sleep(time.Duration(i+1) * 500 * time.Millisecond)
			continue
		}

		if resp.StatusCode != 200 {
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			cancel()
			lastErr = fmt.Errorf("status %d: %s", resp.StatusCode, string(body))
			time.Sleep(time.Duration(i+1) * 500 * time.Millisecond)
			continue
		}

		resp.Body.Close()
		cancel()
		return nil
	}

	return lastErr
}

func (cm *ClusterManager) addFailedCommand(cmd *SyncCommand, nodeID string) {
	cm.failedMu.Lock()
	defer cm.failedMu.Unlock()

	cm.failedCommands = append(cm.failedCommands, &failedCommand{
		cmd:       cmd,
		nodeID:    nodeID,
		retryCount: 0,
		nextRetry: time.Now().Add(10 * time.Second),
	})

	logger.Warnf("added failed command %s for node %s, pending retries: %d",
		cmd.ID, nodeID, len(cm.failedCommands))
}

func (cm *ClusterManager) retryFailedCommands() {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			cm.processFailedCommands()
		case <-cm.stopCh:
			return
		}
	}
}

func (cm *ClusterManager) processFailedCommands() {
	cm.failedMu.Lock()
	remaining := make([]*failedCommand, 0)
	toRetry := make([]*failedCommand, 0)

	now := time.Now()
	for _, fc := range cm.failedCommands {
		if now.After(fc.nextRetry) {
			toRetry = append(toRetry, fc)
		} else {
			remaining = append(remaining, fc)
		}
	}
	cm.failedCommands = remaining
	cm.failedMu.Unlock()

	for _, fc := range toRetry {
		cm.mu.RLock()
		node, exists := cm.nodes[fc.nodeID]
		cm.mu.RUnlock()

		if !exists {
			logger.Infof("node %s no longer exists, removing failed command %s",
				fc.nodeID, fc.cmd.ID)
			continue
		}

		err := cm.sendToNode(node, fc.cmd)
		if err != nil {
			fc.retryCount++
			if fc.retryCount < 10 {
				fc.nextRetry = time.Now().Add(time.Duration(30*(fc.retryCount+1)) * time.Second)
				cm.failedMu.Lock()
				cm.failedCommands = append(cm.failedCommands, fc)
				cm.failedMu.Unlock()
				logger.Warnf("retry %d failed for command %s to node %s, next retry at %v",
					fc.retryCount, fc.cmd.ID, fc.nodeID, fc.nextRetry)
			} else {
				logger.Errorf("max retries reached for command %s to node %s, dropping",
					fc.cmd.ID, fc.nodeID)
				logger.LogCluster("command_dropped", fc.nodeID, false, err)
			}
		} else {
			logger.Infof("successfully retried command %s to node %s after %d attempts",
				fc.cmd.ID, fc.nodeID, fc.retryCount+1)
			logger.LogCluster("command_retried", fc.nodeID, true, nil)
		}
	}
}

func (cm *ClusterManager) watchCommands() {
	if cm.etcdClient == nil {
		return
	}

	go cm.loadExistingCommands()

	watchCh := cm.etcdClient.Watch(context.Background(),
		"/industrial-gateway/cluster/commands/",
		clientv3.WithPrefix())

	for {
		select {
		case watchResp := <-watchCh:
			for _, ev := range watchResp.Events {
				if ev.Type == clientv3.EventTypePut {
					var cmd SyncCommand
					if err := json.Unmarshal(ev.Kv.Value, &cmd); err == nil {
						go cm.handleCommandFromEtcd(&cmd)
					}
				}
			}
		case <-cm.stopCh:
			return
		}
	}
}

func (cm *ClusterManager) loadExistingCommands() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := cm.etcdClient.Get(ctx,
		"/industrial-gateway/cluster/commands/",
		clientv3.WithPrefix(),
		clientv3.WithLimit(1000))

	if err != nil {
		logger.Errorf("load existing commands failed: %v", err)
		return
	}

	for _, kv := range resp.Kvs {
		var cmd SyncCommand
		if err := json.Unmarshal(kv.Value, &cmd); err == nil {
			go cm.handleCommandFromEtcd(&cmd)
		}
	}

	logger.Infof("loaded %d existing commands from etcd", len(resp.Kvs))
}

func (cm *ClusterManager) handleCommandFromEtcd(cmd *SyncCommand) {
	cm.processedMu.RLock()
	processed := cm.processedCmds[cmd.ID]
	cm.processedMu.RUnlock()

	if processed {
		return
	}

	cm.processedMu.Lock()
	if cm.processedCmds[cmd.ID] {
		cm.processedMu.Unlock()
		return
	}
	cm.processedCmds[cmd.ID] = true
	cm.processedMu.Unlock()

	if cmd.NodeID != cm.nodeID {
		cm.dataChan <- cmd
		logger.LogCluster("command_from_etcd", cmd.NodeID, true, nil)
	}

	if len(cm.processedCmds) > 10000 {
		cm.processedMu.Lock()
		for k := range cm.processedCmds {
			delete(cm.processedCmds, k)
			if len(cm.processedCmds) < 1000 {
				break
			}
		}
		cm.processedMu.Unlock()
	}
}

func (cm *ClusterManager) HandleSyncCommand(cmd *SyncCommand) error {
	if cmd.NodeID == cm.nodeID {
		return nil
	}

	cm.processedMu.RLock()
	processed := cm.processedCmds[cmd.ID]
	cm.processedMu.RUnlock()

	if processed {
		return nil
	}

	cm.processedMu.Lock()
	if cm.processedCmds[cmd.ID] {
		cm.processedMu.Unlock()
		return nil
	}
	cm.processedCmds[cmd.ID] = true
	cm.processedMu.Unlock()

	cm.dataChan <- cmd
	logger.LogCluster("command_received", cmd.NodeID, true, nil)
	return nil
}

func (cm *ClusterManager) GetState() NodeState {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	return cm.state
}

func (cm *ClusterManager) GetNodes() []*NodeInfo {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	nodes := make([]*NodeInfo, 0, len(cm.nodes))
	for _, n := range cm.nodes {
		nodes = append(nodes, n)
	}
	return nodes
}

func (cm *ClusterManager) IsLeader() bool {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	return cm.state == StateLeader
}

func (cm *ClusterManager) SyncParseResult(result *protocol.ParseResult, rawData []byte) error {
	if !cm.IsLeader() && len(cm.nodes) > 1 {
		return nil
	}

	return storage.SaveParseResult(result, rawData)
}

func (cm *ClusterManager) GetConfig() config.ClusterConfig {
	return cm.config
}

func (cm *ClusterManager) RegisterHandler(cmdType SyncCommandType, handler func(*SyncCommand) error) {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	cm.syncHandlers[cmdType] = handler
}

func Shutdown() {
	if clusterManager != nil {
		close(clusterManager.stopCh)

		if clusterManager.etcdClient != nil {
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			nodeKey := fmt.Sprintf("/industrial-gateway/cluster/nodes/%s", clusterManager.nodeID)
			clusterManager.etcdClient.Delete(ctx, nodeKey)
			cancel()

			clusterManager.etcdClient.Close()
		}

		logger.LogCluster("shutdown", clusterManager.nodeID, true, nil)
	}
}

func GetManager() *ClusterManager {
	return clusterManager
}

func BroadcastCommand(cmd *SyncCommand) error {
	if clusterManager == nil {
		return common.ErrClusterSyncFailed
	}
	return clusterManager.SyncCommand(cmd)
}

func GetNodes() []*NodeInfo {
	if clusterManager == nil {
		return nil
	}
	return clusterManager.GetNodes()
}

func IsLeader() bool {
	if clusterManager == nil {
		return true
	}
	return clusterManager.IsLeader()
}

func HandleSyncCommand(cmd *SyncCommand) error {
	if clusterManager == nil {
		return nil
	}
	return clusterManager.HandleSyncCommand(cmd)
}

func RegisterHandler(cmdType SyncCommandType, handler func(*SyncCommand) error) {
	if clusterManager != nil {
		clusterManager.RegisterHandler(cmdType, handler)
	}
}
