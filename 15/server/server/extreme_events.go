package server

import (
	"math/rand"
	"sync"
	"time"

	"floating-server/models"
	"floating-server/network"
)

type ExtremeEventType string

const (
	EventMagneticStorm   ExtremeEventType = "magnetic_storm"
	EventZeroGravity     ExtremeEventType = "zero_gravity"
	EventTimeDistortion  ExtremeEventType = "time_distortion"
	EventMeteorShower    ExtremeEventType = "meteor_shower"
	EventGravitySurge    ExtremeEventType = "gravity_surge"
	EventPlasmaCloud     ExtremeEventType = "plasma_cloud"
	EventTurbulence      ExtremeEventType = "turbulence"
	EventSolarFlare      ExtremeEventType = "solar_flare"
)

type ExtremeEvent struct {
	Type        ExtremeEventType     `json:"type"`
	Intensity   float64              `json:"intensity"`
	Duration    int64                `json:"duration_ms"`
	StartTime   int64                `json:"start_time_ms"`
	EndTime     int64                `json:"end_time_ms"`
	Remaining   int64                `json:"remaining_ms"`
	TargetArea  string               `json:"target_area"`
	AffectedIDs []string             `json:"affected_ids"`
	Params      map[string]float64   `json:"params"`
	Active      bool                 `json:"active"`
}

type ExtremeEventManager struct {
	server             *Server
	activeEvents       map[string]*ExtremeEvent
	eventHistory       []*ExtremeEvent
	mu                 sync.RWMutex
	nextEventTime      int64
	minEventInterval   int64
	maxEventInterval   int64
	eventProbability   float64
	eventTypes         []ExtremeEventType
	eventWeights       map[ExtremeEventType]int
}

func NewExtremeEventManager(s *Server) *ExtremeEventManager {
	return &ExtremeEventManager{
		server:           s,
		activeEvents:     make(map[string]*ExtremeEvent),
		nextEventTime:    time.Now().UnixMilli() + 30000,
		minEventInterval: 20000,
		maxEventInterval: 60000,
		eventProbability: 0.3,
		eventTypes: []ExtremeEventType{
			EventMagneticStorm,
			EventZeroGravity,
			EventTimeDistortion,
			EventMeteorShower,
			EventGravitySurge,
			EventPlasmaCloud,
			EventTurbulence,
			EventSolarFlare,
		},
		eventWeights: map[ExtremeEventType]int{
			EventMagneticStorm:   15,
			EventZeroGravity:     10,
			EventTimeDistortion:  8,
			EventMeteorShower:    12,
			EventGravitySurge:    10,
			EventPlasmaCloud:     12,
			EventTurbulence:      18,
			EventSolarFlare:      8,
		},
	}
}

func (e *ExtremeEventManager) Tick(nowMs int64, room *models.RoomState) {
	e.mu.Lock()
	defer e.mu.Unlock()

	e.updateActiveEvents(nowMs, room)
	e.checkSpawnEvent(nowMs, room)
}

func (e *ExtremeEventManager) updateActiveEvents(nowMs int64, room *models.RoomState) {
	for id, event := range e.activeEvents {
		if !event.Active {
			continue
		}

		event.Remaining = event.EndTime - nowMs
		if event.Remaining <= 0 {
			e.endEvent(id, room)
			continue
		}

		e.applyEventEffect(event, room)
	}
}

func (e *ExtremeEventManager) checkSpawnEvent(nowMs int64, room *models.RoomState) {
	if len(e.activeEvents) >= 2 {
		return
	}

	if nowMs < e.nextEventTime {
		return
	}

	if rand.Float64() > e.eventProbability {
		e.scheduleNextEvent(nowMs)
		return
	}

	eventType := e.selectEventType()
	event := e.createEvent(eventType, nowMs, room)
	if event == nil {
		e.scheduleNextEvent(nowMs)
		return
	}

	e.activeEvents[eventType+"_"+e.randomID()] = event
	event.Active = true

	e.broadcastEvent(event, room.RoomID)
	e.scheduleNextEvent(nowMs)
}

func (e *ExtremeEventManager) selectEventType() ExtremeEventType {
	totalWeight := 0
	for _, w := range e.eventWeights {
		totalWeight += w
	}

	r := rand.Intn(totalWeight)
	cumulative := 0
	for t, w := range e.eventWeights {
		cumulative += w
		if r < cumulative {
			return t
		}
	}
	return e.eventTypes[0]
}

func (e *ExtremeEventManager) createEvent(etype ExtremeEventType, nowMs int64, room *models.RoomState) *ExtremeEvent {
	event := &ExtremeEvent{
		Type:      etype,
		Intensity: 0.3 + rand.Float64()*0.7,
		StartTime: nowMs,
		Active:    true,
	}

	switch etype {
	case EventMagneticStorm:
		event.Duration = 15000 + rand.Int63n(25000)
		event.Params = map[string]float64{
			"control_loss":     0.3 + rand.Float64()*0.4,
			"energy_drain":     0.5 + rand.Float64()*0.5,
			"visibility_penalty": 0.3,
		}
	case EventZeroGravity:
		event.Duration = 10000 + rand.Int63n(15000)
		event.Params = map[string]float64{
			"gravity_multiplier": 0.05 + rand.Float64()*0.2,
			"push_force":         2.0,
		}
	case EventTimeDistortion:
		event.Duration = 8000 + rand.Int63n(12000)
		event.Params = map[string]float64{
			"time_scale": 0.5 + rand.Float64()*1.0,
		}
	case EventMeteorShower:
		event.Duration = 20000 + rand.Int63n(30000)
		event.Params = map[string]float64{
			"damage_rate": 5.0 + rand.Float64()*10.0,
			"spawn_rate":  0.3,
		}
	case EventGravitySurge:
		event.Duration = 12000 + rand.Int63n(18000)
		event.Params = map[string]float64{
			"gravity_multiplier": 1.8 + rand.Float64()*1.2,
		}
	case EventPlasmaCloud:
		event.Duration = 25000 + rand.Int63n(35000)
		event.Params = map[string]float64{
			"health_drain": 2.0,
			"energy_regen": 5.0,
		}
	case EventTurbulence:
		event.Duration = 20000 + rand.Int63n(40000)
		event.Params = map[string]float64{
			"shake_intensity": 0.3 + rand.Float64()*0.5,
			"wind_chaos":      1.5,
		}
	case EventSolarFlare:
		event.Duration = 15000 + rand.Int63n(25000)
		event.Params = map[string]float64{
			"light_intensity": 3.0,
			"heat_damage":     3.0,
		}
	}

	event.EndTime = nowMs + event.Duration
	event.Remaining = event.Duration
	return event
}

func (e *ExtremeEventManager) applyEventEffect(event *ExtremeEvent, room *models.RoomState) {
	env := room.Environment

	switch event.Type {
	case EventMagneticStorm:
		env.WindSpeed *= 1.2
		env.CloudDensity = min(1.0, env.CloudDensity+0.2)

	case EventZeroGravity:
		env.Gravity *= event.Params["gravity_multiplier"]

	case EventTimeDistortion:
		env.Gravity *= event.Params["time_scale"]
		env.WindSpeed *= event.Params["time_scale"]

	case EventGravitySurge:
		env.Gravity *= event.Params["gravity_multiplier"]

	case EventPlasmaCloud:
		env.AuroraIntensity = min(1.0, env.AuroraIntensity+0.3)
		env.Visibility *= 0.8

	case EventTurbulence:
		env.WindSpeed *= 1.3
		env.WindDirection += rand.Float64()*20 - 10

	case EventSolarFlare:
		env.Visibility *= 0.9
		env.LightningIntensity = max(env.LightningIntensity, 0.3)
	}

	for _, player := range room.Players {
		e.applyPlayerEffect(event, player)
	}
}

func (e *ExtremeEventManager) applyPlayerEffect(event *ExtremeEvent, player *models.PlayerState) {
	switch event.Type {
	case EventMagneticStorm:
		player.Energy = max(0, player.Energy-event.Params["energy_drain"]*0.01)

	case EventPlasmaCloud:
		player.Energy = min(100, player.Energy+event.Params["energy_regen"]*0.01)
		player.Health = max(0, player.Health-event.Params["health_drain"]*0.01)

	case EventSolarFlare:
		player.Health = max(0, player.Health-event.Params["heat_damage"]*0.01)

	case EventMeteorShower:
		if rand.Float64() < event.Params["spawn_rate"]*0.05 {
			player.Health = max(0, player.Health-event.Params["damage_rate"]*0.5)
		}
	}
}

func (e *ExtremeEventManager) endEvent(id string, room *models.RoomState) {
	if event, ok := e.activeEvents[id]; ok {
		event.Active = false
		e.eventHistory = append(e.eventHistory, event)
		if len(e.eventHistory) > 100 {
			e.eventHistory = e.eventHistory[1:]
		}
		e.broadcastEventEnd(event, room.RoomID)
		delete(e.activeEvents, id)
	}
}

func (e *ExtremeEventManager) scheduleNextEvent(nowMs int64) {
	interval := e.minEventInterval + rand.Int63n(e.maxEventInterval-e.minEventInterval)
	e.nextEventTime = nowMs + interval
}

func (e *ExtremeEventManager) broadcastEvent(event *ExtremeEvent, roomID string) {
	payload := map[string]interface{}{
		"event":    event,
		"is_start": true,
	}
	binPkt, err := network.MakeBinaryPacket(network.MsgTypeExtremeEvent, 0, payload)
	if err == nil {
		binPkt.Seq = e.server.nextSeq()
		e.server.GetConnectionManager().BroadcastBinaryInRoom(roomID, binPkt, "")
	} else {
		e.server.GetConnectionManager().BroadcastInRoom(roomID, "extreme_event", payload)
	}
}

func (e *ExtremeEventManager) broadcastEventEnd(event *ExtremeEvent, roomID string) {
	payload := map[string]interface{}{
		"event":    event,
		"is_start": false,
	}
	binPkt, err := network.MakeBinaryPacket(network.MsgTypeExtremeEvent, 0, payload)
	if err == nil {
		binPkt.Seq = e.server.nextSeq()
		e.server.GetConnectionManager().BroadcastBinaryInRoom(roomID, binPkt, "")
	} else {
		e.server.GetConnectionManager().BroadcastInRoom(roomID, "extreme_event", payload)
	}
}

func (e *ExtremeEventManager) GetActiveEvents() []*ExtremeEvent {
	e.mu.RLock()
	defer e.mu.RUnlock()

	result := make([]*ExtremeEvent, 0, len(e.activeEvents))
	for _, ev := range e.activeEvents {
		result = append(result, ev)
	}
	return result
}

func (e *ExtremeEventManager) randomID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return string(b)
}

func min(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

func max(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}
