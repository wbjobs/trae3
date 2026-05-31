package server

import (
	"floating-server/models"
	"floating-server/network"
	"math"
)

type DeltaEncoder struct {
	lastEnvState      *models.EnvironmentState
	lastPlayerStates  map[string]*models.PlayerState
	lastPlatformStates map[string]*models.PlatformState
	envFieldMask       uint64
}

func NewDeltaEncoder() *DeltaEncoder {
	return &DeltaEncoder{
		lastPlayerStates:   make(map[string]*models.PlayerState),
		lastPlatformStates: make(map[string]*models.PlatformState),
	}
}

func (d *DeltaEncoder) EncodeEnvDelta(current *models.EnvironmentState) (uint64, *models.EnvironmentState) {
	if d.lastEnvState == nil {
		d.lastEnvState = current.Clone()
		return network.EnvFieldWeather | network.EnvFieldWindSpeed | network.EnvFieldWindDirection |
			network.EnvFieldGravity | network.EnvFieldTemperature | network.EnvFieldVisibility |
			network.EnvFieldPressure | network.EnvFieldCloudDensity | network.EnvFieldLightning |
			network.EnvFieldAurora | network.EnvFieldTimeOfDay | network.EnvFieldAltitude |
			network.EnvFieldTick | network.EnvFieldSeq | network.EnvFieldSnapshotTs, current
	}

	var mask uint64
	delta := &models.EnvironmentState{}
	last := d.lastEnvState

	if last.Weather != current.Weather {
		mask |= network.EnvFieldWeather
		delta.Weather = current.Weather
	}
	if !floatEquals(last.WindSpeed, current.WindSpeed) {
		mask |= network.EnvFieldWindSpeed
		delta.WindSpeed = current.WindSpeed
	}
	if !floatEquals(last.WindDirection, current.WindDirection) {
		mask |= network.EnvFieldWindDirection
		delta.WindDirection = current.WindDirection
	}
	if !floatEquals(last.Gravity, current.Gravity) {
		mask |= network.EnvFieldGravity
		delta.Gravity = current.Gravity
	}
	if !floatEquals(last.Temperature, current.Temperature) {
		mask |= network.EnvFieldTemperature
		delta.Temperature = current.Temperature
	}
	if !floatEquals(last.Visibility, current.Visibility) {
		mask |= network.EnvFieldVisibility
		delta.Visibility = current.Visibility
	}
	if !floatEquals(last.AtmosphericPressure, current.AtmosphericPressure) {
		mask |= network.EnvFieldPressure
		delta.AtmosphericPressure = current.AtmosphericPressure
	}
	if !floatEquals(last.CloudDensity, current.CloudDensity) {
		mask |= network.EnvFieldCloudDensity
		delta.CloudDensity = current.CloudDensity
	}
	if !floatEquals(last.LightningIntensity, current.LightningIntensity) {
		mask |= network.EnvFieldLightning
		delta.LightningIntensity = current.LightningIntensity
	}
	if !floatEquals(last.AuroraIntensity, current.AuroraIntensity) {
		mask |= network.EnvFieldAurora
		delta.AuroraIntensity = current.AuroraIntensity
	}
	if !floatEquals(last.TimeOfDay, current.TimeOfDay) {
		mask |= network.EnvFieldTimeOfDay
		delta.TimeOfDay = current.TimeOfDay
	}
	if !floatEquals(last.Altitude, current.Altitude) {
		mask |= network.EnvFieldAltitude
		delta.Altitude = current.Altitude
	}

	mask |= network.EnvFieldTick | network.EnvFieldSeq | network.EnvFieldSnapshotTs
	delta.Tick = current.Tick
	delta.Seq = current.Seq
	delta.SnapshotTimestamp = current.SnapshotTimestamp

	d.lastEnvState = current.Clone()

	if countSetBits(mask) > 10 {
		return network.EnvFieldWeather | network.EnvFieldWindSpeed | network.EnvFieldWindDirection |
			network.EnvFieldGravity | network.EnvFieldTemperature | network.EnvFieldVisibility |
			network.EnvFieldPressure | network.EnvFieldCloudDensity | network.EnvFieldLightning |
			network.EnvFieldAurora | network.EnvFieldTimeOfDay | network.EnvFieldAltitude |
			network.EnvFieldTick | network.EnvFieldSeq | network.EnvFieldSnapshotTs, current
	}

	return mask, delta
}

func (d *DeltaEncoder) EncodePlayerDelta(playerID string, current *models.PlayerState) (uint64, map[string]interface{}) {
	last, exists := d.lastPlayerStates[playerID]
	if !exists {
		d.lastPlayerStates[playerID] = copyPlayerState(current)
		return network.PlayerFieldPosX | network.PlayerFieldPosY | network.PlayerFieldPosZ |
			network.PlayerFieldVelX | network.PlayerFieldVelY | network.PlayerFieldVelZ |
			network.PlayerFieldHealth | network.PlayerFieldEnergy | network.PlayerFieldIsFlying |
			network.PlayerFieldRotY, playerToMap(current)
	}

	var mask uint64
	delta := make(map[string]interface{})
	delta["player_id"] = current.PlayerID

	if !floatEquals(last.Position.X, current.Position.X) {
		mask |= network.PlayerFieldPosX
		delta["px"] = float32(current.Position.X)
	}
	if !floatEquals(last.Position.Y, current.Position.Y) {
		mask |= network.PlayerFieldPosY
		delta["py"] = float32(current.Position.Y)
	}
	if !floatEquals(last.Position.Z, current.Position.Z) {
		mask |= network.PlayerFieldPosZ
		delta["pz"] = float32(current.Position.Z)
	}

	if !floatEquals(last.Velocity.X, current.Velocity.X) {
		mask |= network.PlayerFieldVelX
		delta["vx"] = float32(current.Velocity.X)
	}
	if !floatEquals(last.Velocity.Y, current.Velocity.Y) {
		mask |= network.PlayerFieldVelY
		delta["vy"] = float32(current.Velocity.Y)
	}
	if !floatEquals(last.Velocity.Z, current.Velocity.Z) {
		mask |= network.PlayerFieldVelZ
		delta["vz"] = float32(current.Velocity.Z)
	}

	if !floatEquals(last.Health, current.Health) {
		mask |= network.PlayerFieldHealth
		delta["hp"] = float32(current.Health)
	}
	if !floatEquals(last.Energy, current.Energy) {
		mask |= network.PlayerFieldEnergy
		delta["en"] = float32(current.Energy)
	}
	if last.IsFlying != current.IsFlying {
		mask |= network.PlayerFieldIsFlying
		delta["fly"] = current.IsFlying
	}
	if !floatEquals(last.Rotation.Y, current.Rotation.Y) {
		mask |= network.PlayerFieldRotY
		delta["ry"] = float32(current.Rotation.Y)
	}

	d.lastPlayerStates[playerID] = copyPlayerState(current)

	if countSetBits(mask) > 8 {
		return network.PlayerFieldPosX | network.PlayerFieldPosY | network.PlayerFieldPosZ |
			network.PlayerFieldVelX | network.PlayerFieldVelY | network.PlayerFieldVelZ |
			network.PlayerFieldHealth | network.PlayerFieldEnergy | network.PlayerFieldIsFlying |
			network.PlayerFieldRotY, playerToMap(current)
	}

	return mask, delta
}

func (d *DeltaEncoder) EncodePlatformDelta(platformID string, current *models.PlatformState) (uint64, map[string]interface{}) {
	last, exists := d.lastPlatformStates[platformID]
	if !exists {
		d.lastPlatformStates[platformID] = current.Clone()
		return network.PlatformFieldPosX | network.PlatformFieldPosY | network.PlatformFieldPosZ |
			network.PlatformFieldStability | network.PlatformFieldIsAnchored, platformToMap(current)
	}

	var mask uint64
	delta := make(map[string]interface{})
	delta["platform_id"] = platformID

	if !floatEquals(last.Position.X, current.Position.X) {
		mask |= network.PlatformFieldPosX
		delta["px"] = float32(current.Position.X)
	}
	if !floatEquals(last.Position.Y, current.Position.Y) {
		mask |= network.PlatformFieldPosY
		delta["py"] = float32(current.Position.Y)
	}
	if !floatEquals(last.Position.Z, current.Position.Z) {
		mask |= network.PlatformFieldPosZ
		delta["pz"] = float32(current.Position.Z)
	}
	if !floatEquals(last.Stability, current.Stability) {
		mask |= network.PlatformFieldStability
		delta["stab"] = float32(current.Stability)
	}
	if last.IsAnchored != current.IsAnchored {
		mask |= network.PlatformFieldIsAnchored
		delta["anch"] = current.IsAnchored
	}

	d.lastPlatformStates[platformID] = current.Clone()
	return mask, delta
}

func floatEquals(a, b float64) bool {
	return math.Abs(a-b) < 0.001
}

func countSetBits(n uint64) int {
	count := 0
	for n > 0 {
		count += int(n & 1)
		n >>= 1
	}
	return count
}

func copyPlayerState(s *models.PlayerState) *models.PlayerState {
	cp := *s
	return &cp
}

func playerToMap(s *models.PlayerState) map[string]interface{} {
	return map[string]interface{}{
		"player_id": s.PlayerID,
		"px":        float32(s.Position.X),
		"py":        float32(s.Position.Y),
		"pz":        float32(s.Position.Z),
		"vx":        float32(s.Velocity.X),
		"vy":        float32(s.Velocity.Y),
		"vz":        float32(s.Velocity.Z),
		"hp":        float32(s.Health),
		"en":        float32(s.Energy),
		"fly":       s.IsFlying,
		"ry":        float32(s.Rotation.Y),
	}
}

func platformToMap(p *models.PlatformState) map[string]interface{} {
	return map[string]interface{}{
		"platform_id": p.PlatformID,
		"px":          float32(p.Position.X),
		"py":          float32(p.Position.Y),
		"pz":          float32(p.Position.Z),
		"stab":        float32(p.Stability),
		"anch":        p.IsAnchored,
	}
}
