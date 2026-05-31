package models

import (
	"time"
)

type Vector3 struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	Z float64 `json:"z"`
}

type PlayerState struct {
	PlayerID   string  `json:"player_id"`
	Name       string  `json:"name"`
	Position   Vector3 `json:"position"`
	Velocity   Vector3 `json:"velocity"`
	Rotation   Vector3 `json:"rotation"`
	Health     float64 `json:"health"`
	Energy     float64 `json:"energy"`
	IsFlying   bool    `json:"is_flying"`
	LastUpdate int64   `json:"last_update"`
}

type WeatherType string

const (
	WeatherClear  WeatherType = "clear"
	WeatherCloudy WeatherType = "cloudy"
	WeatherStorm  WeatherType = "storm"
	WeatherFog    WeatherType = "fog"
	WeatherAurora WeatherType = "aurora"
)

type EnvironmentState struct {
	Weather              WeatherType `json:"weather"`
	WindSpeed            float64     `json:"wind_speed"`
	WindDirection        float64     `json:"wind_direction"`
	Gravity              float64     `json:"gravity"`
	Temperature          float64     `json:"temperature"`
	Visibility           float64     `json:"visibility"`
	AtmosphericPressure  float64     `json:"atmospheric_pressure"`
	CloudDensity         float64     `json:"cloud_density"`
	LightningIntensity   float64     `json:"lightning_intensity"`
	AuroraIntensity      float64     `json:"aurora_intensity"`
	TimeOfDay            float64     `json:"time_of_day"`
	Altitude             float64     `json:"altitude"`
	Tick                 int64       `json:"tick"`
	Seq                  int64       `json:"seq"`
	SnapshotTimestamp     int64       `json:"snapshot_ts"`
}

func (e *EnvironmentState) Clone() *EnvironmentState {
	cp := *e
	return &cp
}

type PlatformState struct {
	PlatformID    string  `json:"platform_id"`
	Position      Vector3 `json:"position"`
	Velocity      Vector3 `json:"velocity"`
	RotationSpeed float64 `json:"rotation_speed"`
	Stability     float64 `json:"stability"`
	IsAnchored    bool    `json:"is_anchored"`
}

func (p *PlatformState) Clone() *PlatformState {
	cp := *p
	return &cp
}

type RoomState struct {
	RoomID      string                    `json:"room_id"`
	Name        string                    `json:"name"`
	Players     map[string]*PlayerState   `json:"players"`
	Environment *EnvironmentState         `json:"environment"`
	Platforms   map[string]*PlatformState `json:"platforms"`
	CreatedAt   time.Time                 `json:"created_at"`
	MaxPlayers  int                       `json:"max_players"`
	TickRate    int                       `json:"tick_rate"`
	Tick        int64                     `json:"tick"`
	Seq         int64                     `json:"seq"`
}

func (r *RoomState) SnapshotEnvironment() *EnvironmentState {
	r.Seq++
	snap := r.Environment.Clone()
	snap.Seq = r.Seq
	snap.SnapshotTimestamp = time.Now().UnixMilli()
	snap.Tick = r.Tick
	return snap
}

type MatchSave struct {
	SaveID      string                    `json:"save_id"`
	RoomID      string                    `json:"room_id"`
	Name        string                    `json:"name"`
	Players     map[string]*PlayerState   `json:"players"`
	Environment *EnvironmentState         `json:"environment"`
	Platforms   map[string]*PlatformState `json:"platforms"`
	SavedAt     time.Time                 `json:"saved_at"`
	Duration    int64                     `json:"duration_seconds"`
}
