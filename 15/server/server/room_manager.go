package server

import (
	"sync"
	"time"

	"floating-server/models"
	"github.com/google/uuid"
)

type RoomManager struct {
	rooms  map[string]*models.RoomState
	mu     sync.RWMutex
	server *Server
}

func NewRoomManager(s *Server) *RoomManager {
	return &RoomManager{
		rooms:  make(map[string]*models.RoomState),
		server: s,
	}
}

func (rm *RoomManager) GetOrCreateRoom(roomID string, name string) *models.RoomState {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	if room, ok := rm.rooms[roomID]; ok {
		return room
	}

	room := &models.RoomState{
		RoomID:    roomID,
		Name:      name,
		Players:   make(map[string]*models.PlayerState),
		Platforms: make(map[string]*models.PlatformState),
		Environment: &models.EnvironmentState{
			Weather:             models.WeatherClear,
			WindSpeed:           5.0,
			WindDirection:       0,
			Gravity:             9.8,
			Temperature:         15.0,
			Visibility:          1.0,
			AtmosphericPressure: 1013.25,
			CloudDensity:        0.3,
			LightningIntensity:  0.0,
			AuroraIntensity:     0.0,
			TimeOfDay:           12.0,
			Altitude:            2000.0,
			Tick:                0,
			Seq:                 0,
		},
		CreatedAt:  time.Now(),
		MaxPlayers: 16,
		TickRate:    20,
		Tick:        0,
		Seq:         0,
	}

	rm.initPlatforms(room)
	rm.rooms[roomID] = room
	return room
}

func (rm *RoomManager) initPlatforms(room *models.RoomState) {
	platformDefs := []struct {
		id       string
		pos      models.Vector3
		anchored bool
	}{
		{"platform_center", models.Vector3{X: 0, Y: 0, Z: 0}, true},
		{"platform_north", models.Vector3{X: 0, Y: 5, Z: 50}, false},
		{"platform_south", models.Vector3{X: 0, Y: -3, Z: -50}, false},
		{"platform_east", models.Vector3{X: 50, Y: 2, Z: 0}, false},
		{"platform_west", models.Vector3{X: -50, Y: -1, Z: 0}, false},
		{"platform_high", models.Vector3{X: 25, Y: 30, Z: 25}, false},
	}

	for _, def := range platformDefs {
		room.Platforms[def.id] = &models.PlatformState{
			PlatformID:    def.id,
			Position:      def.pos,
			Velocity:      models.Vector3{},
			RotationSpeed: 0.1,
			Stability:     1.0,
			IsAnchored:    def.anchored,
		}
	}
}

func (rm *RoomManager) GetRoom(roomID string) *models.RoomState {
	rm.mu.RLock()
	defer rm.mu.RUnlock()
	return rm.rooms[roomID]
}

func (rm *RoomManager) AddPlayer(roomID string, playerID string, state *models.PlayerState) {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	if room, ok := rm.rooms[roomID]; ok {
		room.Players[playerID] = state
	}
}

func (rm *RoomManager) RemovePlayer(roomID string, playerID string) {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	if room, ok := rm.rooms[roomID]; ok {
		delete(room.Players, playerID)
		if len(room.Players) == 0 {
			delete(rm.rooms, roomID)
		}
	}
}

func (rm *RoomManager) UpdatePlayerState(roomID string, playerID string, state *models.PlayerState) {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	if room, ok := rm.rooms[roomID]; ok {
		room.Players[playerID] = state
	}
}

func (rm *RoomManager) UpdateEnvironment(roomID string, env *models.EnvironmentState) {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	if room, ok := rm.rooms[roomID]; ok {
		room.Environment = env
		room.Tick++
	}
}

func (rm *RoomManager) ListRooms() []*models.RoomState {
	rm.mu.RLock()
	defer rm.mu.RUnlock()

	result := make([]*models.RoomState, 0, len(rm.rooms))
	for _, room := range rm.rooms {
		result = append(result, room)
	}
	return result
}

func (rm *RoomManager) UpdatePlatform(roomID string, platformID string, platform *models.PlatformState) {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	if room, ok := rm.rooms[roomID]; ok {
		room.Platforms[platformID] = platform
	}
}

type SaveData struct {
	SaveID    string                        `json:"save_id"`
	RoomID    string                        `json:"room_id"`
	Name      string                        `json:"name"`
	Players   map[string]*models.PlayerState `json:"players"`
	Env       *models.EnvironmentState      `json:"environment"`
	Platforms map[string]*models.PlatformState `json:"platforms"`
	SavedAt   time.Time                     `json:"saved_at"`
}

func (rm *RoomManager) SnapshotRoom(roomID string) *SaveData {
	rm.mu.RLock()
	defer rm.mu.RUnlock()

	room, ok := rm.rooms[roomID]
	if !ok {
		return nil
	}

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

	return &SaveData{
		SaveID:    uuid.New().String(),
		RoomID:    room.RoomID,
		Name:      room.Name,
		Players:   playersCopy,
		Env:       &envCopy,
		Platforms: platformsCopy,
		SavedAt:   time.Now(),
	}
}
