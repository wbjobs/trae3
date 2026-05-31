package pool

import (
	"context"
	"fmt"
	"net"
	"sort"
	"sync"
	"time"

	"industrial-protocol-gateway/common"
	"industrial-protocol-gateway/logger"
)

type DeviceConn struct {
	ID          string
	Protocol    string
	Host        string
	Port        int
	Conn        net.Conn
	LastUsed    time.Time
	MaxIdle     time.Duration
	MaxRetries  int
	Timeout     time.Duration
	connected   bool
	mu          sync.Mutex
}

type DevicePool struct {
	conns        map[string]*DeviceConn
	mu           sync.RWMutex
	maxConns     int
	minConns     int
	idleCheck    *time.Ticker
	healthCheck  *time.Ticker
	stopCh       chan struct{}
	warmupDevices []DeviceInfo
	stats        *DevicePoolStats
}

type DeviceInfo struct {
	DeviceID string
	Protocol string
	Host     string
	Port     int
}

type DevicePoolStats struct {
	TotalHits    int64 `json:"total_hits"`
	TotalMisses  int64 `json:"total_misses"`
	TotalErrors  int64 `json:"total_errors"`
	TotalCreated int64 `json:"total_created"`
	TotalClosed  int64 `json:"total_closed"`
	mu           sync.RWMutex
}

var (
	devicePool *DevicePool
	poolOnce   sync.Once
)

func NewDevicePool(maxConns int) *DevicePool {
	if maxConns <= 0 {
		maxConns = 100
	}
	minConns := maxConns / 10
	if minConns < 5 {
		minConns = 5
	}

	pool := &DevicePool{
		conns:        make(map[string]*DeviceConn),
		maxConns:     maxConns,
		minConns:     minConns,
		stopCh:       make(chan struct{}),
		warmupDevices: make([]DeviceInfo, 0),
		stats:        &DevicePoolStats{},
	}

	go pool.startIdleCheck()
	go pool.startHealthCheck()
	return pool
}

func (p *DevicePool) SetWarmupDevices(devices []DeviceInfo) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.warmupDevices = devices
}

func (p *DevicePool) Warmup() error {
	p.mu.RLock()
	devices := make([]DeviceInfo, len(p.warmupDevices))
	copy(devices, p.warmupDevices)
	p.mu.RUnlock()

	successCount := 0
	var lastErr error

	for _, dev := range devices {
		_, err := p.Get(dev.DeviceID, dev.Protocol, dev.Host, dev.Port)
		if err != nil {
			lastErr = err
			logger.Warnf("warmup connection failed for %s: %v", dev.DeviceID, err)
		} else {
			successCount++
		}
	}

	logger.Infof("device pool warmup completed: %d/%d successful", successCount, len(devices))
	return lastErr
}

func (p *DevicePool) Resize(newMax int) error {
	if newMax <= 0 {
		return fmt.Errorf("invalid max connections: %d", newMax)
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	if newMax < p.minConns {
		newMax = p.minConns
	}

	oldMax := p.maxConns
	p.maxConns = newMax

	if newMax < oldMax && len(p.conns) > newMax {
		sorted := make([]*DeviceConn, 0, len(p.conns))
		for _, c := range p.conns {
			sorted = append(sorted, c)
		}
		sort.Slice(sorted, func(i, j int) bool {
			return sorted[i].LastUsed.Before(sorted[j].LastUsed)
		})

		toClose := len(p.conns) - newMax
		for i := 0; i < toClose; i++ {
			conn := sorted[i]
			conn.Close()
			delete(p.conns, conn.ID)
			p.stats.mu.Lock()
			p.stats.TotalClosed++
			p.stats.mu.Unlock()
		}
	}

	logger.Infof("device pool resized: %d -> %d (current: %d)", oldMax, newMax, len(p.conns))
	return nil
}

func InitDevicePool() {
	poolOnce.Do(func() {
		devicePool = NewDevicePool(100)
		logger.Info("device connection pool initialized")
	})
}

func GetDevicePool() *DevicePool {
	return devicePool
}

func (p *DevicePool) startIdleCheck() {
	p.idleCheck = time.NewTicker(1 * time.Minute)
	defer p.idleCheck.Stop()

	for {
		select {
		case <-p.idleCheck.C:
			p.cleanupIdle()
		case <-p.stopCh:
			return
		}
	}
}

func (p *DevicePool) startHealthCheck() {
	p.healthCheck = time.NewTicker(30 * time.Second)
	defer p.healthCheck.Stop()

	for {
		select {
		case <-p.healthCheck.C:
			p.performHealthCheck()
		case <-p.stopCh:
			return
		}
	}
}

func (p *DevicePool) cleanupIdle() {
	p.mu.Lock()
	defer p.mu.Unlock()

	now := time.Now()
	for id, conn := range p.conns {
		if len(p.conns) > p.minConns && now.Sub(conn.LastUsed) > conn.MaxIdle {
			logger.Infof("closing idle device connection: %s", id)
			conn.Close()
			delete(p.conns, id)
			p.stats.mu.Lock()
			p.stats.TotalClosed++
			p.stats.mu.Unlock()
		}
	}
}

func (p *DevicePool) performHealthCheck() {
	p.mu.RLock()
	conns := make([]*DeviceConn, 0, len(p.conns))
	for _, c := range p.conns {
		conns = append(conns, c)
	}
	p.mu.RUnlock()

	healthy := 0
	unhealthy := 0

	for _, conn := range conns {
		if !conn.IsConnected() {
			unhealthy++
			if time.Since(conn.LastUsed) < 5*time.Minute {
				logger.Warnf("health check: connection %s is unhealthy, reconnecting", conn.ID)
				if err := conn.Connect(); err != nil {
					logger.Errorf("health check: reconnect %s failed: %v", conn.ID, err)
					p.stats.mu.Lock()
					p.stats.TotalErrors++
					p.stats.mu.Unlock()
				} else {
					logger.Infof("health check: reconnected %s successfully", conn.ID)
					healthy++
				}
			}
		} else {
			healthy++
		}
	}

	if unhealthy > 0 {
		logger.Debugf("device pool health check: %d healthy, %d unhealthy", healthy, unhealthy)
	}
}

func (p *DevicePool) Get(deviceID, protocol, host string, port int) (*DeviceConn, error) {
	p.mu.RLock()
	conn, exists := p.conns[deviceID]
	p.mu.RUnlock()

	if exists && conn.connected {
		conn.LastUsed = time.Now()
		p.stats.mu.Lock()
		p.stats.TotalHits++
		p.stats.mu.Unlock()
		return conn, nil
	}

	p.stats.mu.Lock()
	p.stats.TotalMisses++
	p.stats.mu.Unlock()

	p.mu.Lock()
	if len(p.conns) >= p.maxConns {
		p.evictLRU()
	}

	newConn, err := NewDeviceConn(deviceID, protocol, host, port)
	if err != nil {
		p.mu.Unlock()
		p.stats.mu.Lock()
		p.stats.TotalErrors++
		p.stats.mu.Unlock()
		return nil, err
	}

	p.conns[deviceID] = newConn
	p.stats.mu.Lock()
	p.stats.TotalCreated++
	p.stats.mu.Unlock()
	p.mu.Unlock()

	logger.Infof("new device connection created: %s (%s:%d)", deviceID, host, port)
	return newConn, nil
}

func (p *DevicePool) evictLRU() {
	var oldest *DeviceConn
	for _, c := range p.conns {
		if oldest == nil || c.LastUsed.Before(oldest.LastUsed) {
			oldest = c
		}
	}
	if oldest != nil {
		logger.Infof("evicting LRU connection: %s", oldest.ID)
		oldest.Close()
		delete(p.conns, oldest.ID)
		p.stats.mu.Lock()
		p.stats.TotalClosed++
		p.stats.mu.Unlock()
	}
}

func (p *DevicePool) Release(deviceID string) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if conn, exists := p.conns[deviceID]; exists {
		conn.LastUsed = time.Now()
	}
}

func (p *DevicePool) Remove(deviceID string) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if conn, exists := p.conns[deviceID]; exists {
		conn.Close()
		delete(p.conns, deviceID)
		logger.Infof("device connection removed: %s", deviceID)
	}
}

func (p *DevicePool) Close() {
	close(p.stopCh)
	p.mu.Lock()
	defer p.mu.Unlock()

	for id, conn := range p.conns {
		conn.Close()
		delete(p.conns, id)
	}
	logger.Info("device connection pool closed")
}

func (p *DevicePool) Stats() map[string]interface{} {
	p.mu.RLock()
	defer p.mu.RUnlock()
	p.stats.mu.RLock()
	defer p.stats.mu.RUnlock()

	hitRate := float64(0)
	if p.stats.TotalHits+p.stats.TotalMisses > 0 {
		hitRate = float64(p.stats.TotalHits) / float64(p.stats.TotalHits+p.stats.TotalMisses)
	}

	return map[string]interface{}{
		"total_conns":   len(p.conns),
		"max_conns":     p.maxConns,
		"min_conns":     p.minConns,
		"total_hits":    p.stats.TotalHits,
		"total_misses":  p.stats.TotalMisses,
		"total_errors":  p.stats.TotalErrors,
		"total_created": p.stats.TotalCreated,
		"total_closed":  p.stats.TotalClosed,
		"hit_rate":      fmt.Sprintf("%.2f%%", hitRate*100),
	}
}

func NewDeviceConn(deviceID, protocol, host string, port int) (*DeviceConn, error) {
	conn := &DeviceConn{
		ID:         deviceID,
		Protocol:    protocol,
		Host:        host,
		Port:        port,
		MaxIdle:     5 * time.Minute,
		MaxRetries:  3,
		Timeout:     10 * time.Second,
		LastUsed:    time.Now(),
	}

	if err := conn.Connect(); err != nil {
		return nil, err
	}

	return conn, nil
}

func (c *DeviceConn) Connect() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	addr := fmt.Sprintf("%s:%d", c.Host, c.Port)
	conn, err := net.DialTimeout("tcp", addr, c.Timeout)
	if err != nil {
		return fmt.Errorf("connect to %s failed: %w", addr, err)
	}

	c.Conn = conn
	c.connected = true
	c.LastUsed = time.Now()
	return nil
}

func (c *DeviceConn) Close() {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.Conn != nil {
		c.Conn.Close()
	}
	c.connected = false
}

func (c *DeviceConn) IsConnected() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.connected
}

func (c *DeviceConn) Send(data []byte) ([]byte, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.connected {
		return nil, common.ErrConnectionClosed
	}

	if err := c.Conn.SetDeadline(time.Now().Add(c.Timeout)); err != nil {
		return nil, fmt.Errorf("set deadline failed: %w", err)
	}

	if _, err := c.Conn.Write(data); err != nil {
		c.connected = false
		return nil, fmt.Errorf("write failed: %w", err)
	}

	buf := make([]byte, 4096)
	n, err := c.Conn.Read(buf)
	if err != nil {
		c.connected = false
		return nil, fmt.Errorf("read failed: %w", err)
	}

	c.LastUsed = time.Now()
	return buf[:n], nil
}

func (c *DeviceConn) SendWithRetry(data []byte, retries int) ([]byte, error) {
	var lastErr error
	for i := 0; i < retries; i++ {
		if !c.connected {
			if err := c.Connect(); err != nil {
				lastErr = err
				time.Sleep(time.Duration(i+1) * 100 * time.Millisecond)
				continue
			}
		}

		resp, err := c.Send(data)
		if err == nil {
			return resp, nil
		}
		lastErr = err
		time.Sleep(time.Duration(i+1) * 100 * time.Millisecond)
	}
	return nil, lastErr
}

func (c *DeviceConn) SendAsync(ctx context.Context, data []byte) (<-chan []byte, <-chan error) {
	respCh := make(chan []byte, 1)
	errCh := make(chan error, 1)

	go func() {
		defer close(respCh)
		defer close(errCh)

		select {
		case <-ctx.Done():
			errCh <- ctx.Err()
		default:
			resp, err := c.SendWithRetry(data, c.MaxRetries)
			if err != nil {
				errCh <- err
				return
			}
			respCh <- resp
		}
	}()

	return respCh, errCh
}

func (c *DeviceConn) ReadWithTimeout(timeout time.Duration) ([]byte, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.connected {
		return nil, common.ErrConnectionClosed
	}

	if err := c.Conn.SetReadDeadline(time.Now().Add(timeout)); err != nil {
		return nil, err
	}

	buf := make([]byte, 4096)
	n, err := c.Conn.Read(buf)
	if err != nil {
		return nil, err
	}

	c.LastUsed = time.Now()
	return buf[:n], nil
}
