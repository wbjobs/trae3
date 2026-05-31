package server

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"floating-server/models"
	"github.com/google/uuid"
)

type SaveManager struct {
	saveDir string
	saves   map[string]*models.MatchSave
	mu      sync.RWMutex
}

func NewSaveManager() *SaveManager {
	return &SaveManager{
		saveDir: "./saves",
		saves:   make(map[string]*models.MatchSave),
	}
}

func (sm *SaveManager) Save(room *models.RoomState) *models.MatchSave {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	playersCopy := make(map[string]*models.PlayerState)
	for k, v := range room.Players {
		pc := *v
		playersCopy[k] = &pc
	}

	platformsCopy := make(map[string]*models.PlatformState)
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

	sm.saves[save.SaveID] = save
	sm.persistToDisk(save)

	return save
}

func (sm *SaveManager) Load(saveID string) (*models.MatchSave, bool) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	save, ok := sm.saves[saveID]
	if !ok {
		save = sm.loadFromDisk(saveID)
		if save == nil {
			return nil, false
		}
	}
	return save, true
}

func (sm *SaveManager) persistToDisk(save *models.MatchSave) {
	os.MkdirAll(sm.saveDir, 0755)

	data, err := json.MarshalIndent(save, "", "  ")
	if err != nil {
		fmt.Printf("[SaveManager] Marshal error: %v\n", err)
		return
	}

	targetPath := filepath.Join(sm.saveDir, save.SaveID+".json")
	tempPath := targetPath + ".tmp"

	if err := os.WriteFile(tempPath, data, 0644); err != nil {
		fmt.Printf("[SaveManager] Write temp error: %v\n", err)
		return
	}

	verifyData, err := os.ReadFile(tempPath)
	if err != nil || len(verifyData) == 0 {
		os.Remove(tempPath)
		fmt.Printf("[SaveManager] Verification read failed\n")
		return
	}

	if len(verifyData) != len(data) {
		os.Remove(tempPath)
		fmt.Printf("[SaveManager] Verification size mismatch\n")
		return
	}

	if err := os.Rename(tempPath, targetPath); err != nil {
		os.Remove(tempPath)
		fmt.Printf("[SaveManager] Atomic rename error: %v\n", err)
	}
}

func (sm *SaveManager) loadFromDisk(saveID string) *models.MatchSave {
	path := filepath.Join(sm.saveDir, saveID+".json")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}

	if len(data) == 0 {
		return nil
	}

	var save models.MatchSave
	if err := json.Unmarshal(data, &save); err != nil {
		fmt.Printf("[SaveManager] Unmarshal error for %s: %v\n", saveID, err)
		return nil
	}

	if save.SaveID == "" {
		return nil
	}

	return &save
}

func (sm *SaveManager) ListSaves() []*models.MatchSave {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	result := make([]*models.MatchSave, 0, len(sm.saves))
	for _, save := range sm.saves {
		result = append(result, save)
	}
	return result
}
