package common

import (
	"context"
	"sync"
	"time"

	"industrial-protocol-gateway/logger"
)

type TaskFunc func(ctx context.Context) error

type Task struct {
	ID        string
	TaskType  string
	Func      TaskFunc
	Timeout   time.Duration
	CreatedAt time.Time
	ResultCh  chan error
}

type WorkerPool struct {
	name        string
	workerCount int
	queueSize   int
	taskQueue   chan *Task
	wg          sync.WaitGroup
	stopCh      chan struct{}
	once        sync.Once
	stats       *PoolStats
}

type PoolStats struct {
	Submitted    int64         `json:"submitted"`
	Completed    int64         `json:"completed"`
	Failed       int64         `json:"failed"`
	Pending      int64         `json:"pending"`
	AvgLatency   time.Duration `json:"avg_latency_ms"`
	TotalLatency int64         `json:"-"`
	mu           sync.RWMutex
}

var (
	parsePool   *WorkerPool
	storagePool *WorkerPool
	forwardPool *WorkerPool
)

func NewWorkerPool(name string, workerCount, queueSize int) *WorkerPool {
	pool := &WorkerPool{
		name:        name,
		workerCount: workerCount,
		queueSize:   queueSize,
		taskQueue:   make(chan *Task, queueSize),
		stopCh:      make(chan struct{}),
		stats:       &PoolStats{},
	}

	pool.start()
	logger.Infof("worker pool [%s] started with %d workers, queue size: %d",
		name, workerCount, queueSize)
	return pool
}

func InitWorkerPools(parseWorkers, storageWorkers, forwardWorkers, queueSize int) {
	if parseWorkers <= 0 {
		parseWorkers = 8
	}
	if storageWorkers <= 0 {
		storageWorkers = 4
	}
	if forwardWorkers <= 0 {
		forwardWorkers = 8
	}
	if queueSize <= 0 {
		queueSize = 1000
	}

	parsePool = NewWorkerPool("parse", parseWorkers, queueSize)
	storagePool = NewWorkerPool("storage", storageWorkers, queueSize)
	forwardPool = NewWorkerPool("forward", forwardWorkers, queueSize)
}

func GetParsePool() *WorkerPool   { return parsePool }
func GetStoragePool() *WorkerPool { return storagePool }
func GetForwardPool() *WorkerPool { return forwardPool }

func (p *WorkerPool) start() {
	for i := 0; i < p.workerCount; i++ {
		p.wg.Add(1)
		go p.worker(i)
	}
}

func (p *WorkerPool) worker(id int) {
	defer p.wg.Done()

	logger.Debugf("worker [%s-%d] started", p.name, id)

	for {
		select {
		case task := <-p.taskQueue:
			p.executeTask(task)
		case <-p.stopCh:
			logger.Debugf("worker [%s-%d] stopped", p.name, id)
			return
		}
	}
}

func (p *WorkerPool) executeTask(task *Task) {
	defer func() {
		if r := recover(); r != nil {
			logger.Errorf("worker [%s] task panic: %v", p.name, r)
			if task.ResultCh != nil {
				task.ResultCh <- ErrInternalError
			}
			p.recordStats(false, time.Since(task.CreatedAt))
		}
	}()

	ctx := context.Background()
	if task.Timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, task.Timeout)
		defer cancel()
	}

	err := task.Func(ctx)

	if task.ResultCh != nil {
		select {
		case task.ResultCh <- err:
		default:
		}
		close(task.ResultCh)
	}

	p.recordStats(err == nil, time.Since(task.CreatedAt))
}

func (p *WorkerPool) Submit(task *Task) error {
	select {
	case p.taskQueue <- task:
		p.stats.mu.Lock()
		p.stats.Submitted++
		p.stats.Pending++
		p.stats.mu.Unlock()
		return nil
	default:
		logger.Warnf("worker pool [%s] queue is full, task dropped", p.name)
		return ErrQueueFull
	}
}

func (p *WorkerPool) SubmitWithResult(task *Task) (<-chan error, error) {
	task.ResultCh = make(chan error, 1)
	if err := p.Submit(task); err != nil {
		close(task.ResultCh)
		return nil, err
	}
	return task.ResultCh, nil
}

func (p *WorkerPool) recordStats(success bool, latency time.Duration) {
	p.stats.mu.Lock()
	defer p.stats.mu.Unlock()

	if success {
		p.stats.Completed++
	} else {
		p.stats.Failed++
	}
	p.stats.Pending--
	p.stats.TotalLatency += latency.Milliseconds()

	if p.stats.Completed+p.stats.Failed > 0 {
		p.stats.AvgLatency = time.Duration(
			p.stats.TotalLatency/(p.stats.Completed+p.stats.Failed),
		) * time.Millisecond
	}
}

func (p *WorkerPool) GetStats() map[string]interface{} {
	p.stats.mu.RLock()
	defer p.stats.mu.RUnlock()

	return map[string]interface{}{
		"name":         p.name,
		"worker_count": p.workerCount,
		"queue_size":   p.queueSize,
		"submitted":    p.stats.Submitted,
		"completed":    p.stats.Completed,
		"failed":       p.stats.Failed,
		"pending":      p.stats.Pending,
		"avg_latency":  p.stats.AvgLatency.Milliseconds(),
	}
}

func (p *WorkerPool) Close() {
	p.once.Do(func() {
		close(p.stopCh)
		p.wg.Wait()
		logger.Infof("worker pool [%s] stopped", p.name)
	})
}

func CloseAllPools() {
	if parsePool != nil {
		parsePool.Close()
	}
	if storagePool != nil {
		storagePool.Close()
	}
	if forwardPool != nil {
		forwardPool.Close()
	}
}
