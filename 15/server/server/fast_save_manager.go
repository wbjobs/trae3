package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"floating-server/models"
	"github.com/google/uuid"
	"github.com/klauspost/compress/gzip"
)

type saveRequest struct {
	room  *models.RoomState
	done  chan string
}

type loadRequest struct {
	saveID string
	result chan *models.MatchSave
	done   chan bool
}

type OptimizedSaveManager struct {
	saveDir     string
	saves       map[string]*models.MatchSave
	saveQueue   chan saveRequest
	loadQueue   chan loadRequest
	cache       map[string]*models.MatchSave
	cacheSize   int
	cacheMutex  sync.RWMutex
	mu          sync.RWMutex
	workerCount int
	wg          sync.WaitGroup
	shutdown    chan struct{}
}

func NewOptimizedSaveManager() *OptimizedSaveManager {
	sm := &OptimizedSaveManager{
		saveDir:     "./saves",
		saves:       make(map[string]*models.MatchSave),
		saveQueue:   make(chan saveRequest, 100),
		loadQueue:   make(chan loadRequest, 100),
		cache:       make(map[string]*models.MatchSave),
		cacheSize:   50,
		workerCount: 3,
		shutdown:    make(chan struct{}),
	}

	os.MkdirAll(sm.saveDir, 0755)

	for i := 0; i < sm.workerCount; i++ {
		sm.wg.Add(1)
		go sm.worker()
	}

	return sm
}

func (sm *OptimizedSaveManager) worker() {
	defer sm.wg.Done()

	for {
		select {
		case <-sm.shutdown:
			return

		case req := <-sm.saveQueue:
			save := sm.processSave(req.room)
			sm.cacheSave(save)
			sm.mu.Lock()
			sm.saves[save.SaveID] = save
			sm.mu.Unlock()
			req.done <- save.SaveID
			close(req.done)

		case req := <-sm.loadQueue:
			save := sm.processLoad(req.saveID)
			if save != nil {
				sm.cacheSave(save)
			}
			req.result <- save
			req.done <- save != nil
			close(req.result)
			close(req.done)
		}
	}
}

func (sm *OptimizedSaveManager) processSave(room *models.RoomState) *models.MatchSave {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	playersCopy := make(map[string]*models.PlayerState, len(room.Players))
	for k, v := range room.Players {
		pc := *v
		playersCopy[k] = &pc
	}

	platformsCopy := make(map[string]*models.PlatformState, len(room.Platforms))
	for k, v := range room.Platforms {
		pc := *v
		platformsCopy[k] = &pc
	}

	envCopy := *room.Environment

	save := &models.MatchSave{
		SaveID:      uuid.New().String(),
		RoomID:      room.RoomID,
		Name:        room.Name,
		Players:     playersCopy,
		Environment: &envCopy,
		Platforms:   platformsCopy,
		SavedAt:     time.Now(),
		Duration:    time.Since(room.CreatedAt).Milliseconds() / 1000,
	}

	sm.persistToDiskFast(save)
	return save
}

func (sm *OptimizedSaveManager) processLoad(saveID string) *models.MatchSave {
	sm.cacheMutex.RLock()
	if save, ok := sm.cache[saveID]; ok {
		sm.cacheMutex.RUnlock()
		return save
	}
	sm.cacheMutex.RUnlock()

	sm.mu.RLock()
	if save, ok := sm.saves[saveID]; ok {
		sm.mu.RUnlock()
		sm.cacheSave(save)
		return save
	}
	sm.mu.RUnlock()

	return sm.loadFromDiskFast(saveID)
}

func (sm *OptimizedSaveManager) persistToDiskFast(save *models.MatchSave) {
	data, err := json.Marshal(save)
	if err != nil {
		fmt.Printf("[SaveManager] Marshal error: %v\n", err)
		return
	}

	var compressed bytes.Buffer
	gzWriter, err := gzip.NewWriterLevel(&compressed, gzip.BestSpeed)
	if err != nil {
		fmt.Printf("[SaveManager] Gzip init error: %v\n", err)
		return
	}

	if _, err := gzWriter.Write(data); err != nil {
		fmt.Printf("[SaveManager] Gzip write error: %v\n", err)
		return
	}
	gzWriter.Close()

	targetPath := filepath.Join(sm.saveDir, save.SaveID+".gz")
	tempPath := targetPath + ".tmp"

	if err := os.WriteFile(tempPath, compressed.Bytes(), 0644); err != nil {
		fmt.Printf("[SaveManager] Write error: %v\n", err)
		return
	}

	if err := os.Rename(tempPath, targetPath); err != nil {
		os.Remove(tempPath)
		fmt.Printf("[SaveManager] Rename error: %v\n", err)
	}
}

func (sm *OptimizedSaveManager) loadFromDiskFast(saveID string) *models.MatchSave {
	path := filepath.Join(sm.saveDir, saveID+".gz")

	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}

	if len(data) < 2 || data[0] != 0x1f || data[1] != 0x8b {
		var save models.MatchSave
		if err := json.Unmarshal(data, &save); err != nil {
			return nil
		}
		if save.SaveID == "" {
			return nil
		}
		return &save
	}

	gr, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		fmt.Printf("[SaveManager] Gzip read error: %v\n", err)
		return nil
	}
	defer gr.Close()

	var decompressed bytes.Buffer
	if _, err := decompressed.ReadFrom(gr); err != nil {
		fmt.Printf("[SaveManager] Decompress error: %v\n", err)
		return nil
	}

	var save models.MatchSave
	if err := json.Unmarshal(decompressed.Bytes(), &save); err != nil {
		return nil
	}

	if save.SaveID == "" {
		return nil
	}

	return &save
}

func (sm *OptimizedSaveManager) cacheSave(save *models.MatchSave) {
	sm.cacheMutex.Lock()
	defer sm.cacheMutex.Unlock()

	sm.cache[save.SaveID] = save

	if len(sm.cache) > sm.cacheSize {
		var oldestKey string
		var oldestTime time.Time
		for k, v := range sm.cache {
			if oldestKey == "" || v.SavedAt.Before(oldestTime) {
				oldestKey = k
				oldestTime = v.SavedAt
			}
		}
		delete(sm.cache, oldestKey)
	}
}

func (sm *OptimizedSaveManager) SaveAsync(room *models.RoomState) chan string {
	done := make(chan string, 1)
	sm.saveQueue <- saveRequest{room: room, done: done}
	return done
}

func (sm *OptimizedSaveManager) LoadAsync(saveID string) (chan *models.MatchSave, chan bool) {
	result := make(chan *models.MatchSave, 1)
	done := make(chan bool, 1)
	sm.loadQueue <- loadRequest{saveID: saveID, result: result, done: done}
	return result, done
}

func (sm *OptimizedSaveManager) Save(room *models.RoomState) *models.MatchSave {
	done := sm.SaveAsync(room)
	saveID := <-done

	sm.mu.RLock()
	defer sm.mu.RUnlock()
	return sm.saves[saveID]
}

func (sm *OptimizedSaveManager) Load(saveID string) (*models.MatchSave, bool) {
	result, done := sm.LoadAsync(saveID)
	save := <-result
	ok := <-done
	return save, ok
}

func (sm *OptimizedSaveManager) ListSaves() []*models.MatchSave {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	result := make([]*models.MatchSave, 0, len(sm.saves))
	for _, save := range sm.saves {
		result = append(result, save)
	}
	return result
}

func (sm *OptimizedSaveManager) Stop() {
	close(sm.shutdown)
	sm.wg.Wait()
}
