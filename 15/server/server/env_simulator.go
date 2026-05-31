package server

import (
	"math"
	"math/rand"
	"sync"
	"time"

	"floating-server/models"
)

type EnvironmentSimulator struct {
	server *Server
}

func NewEnvironmentSimulator(s *Server) *EnvironmentSimulator {
	return &EnvironmentSimulator{server: s}
}

func (es *EnvironmentSimulator) Run(shutdown chan struct{}, wg *sync.WaitGroup) {
	defer wg.Done()

	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-shutdown:
			return
		case <-ticker.C:
			es.tick()
		}
	}
}

func (es *EnvironmentSimulator) tick() {
	rooms := es.server.GetRoomManager().ListRooms()
	for _, room := range rooms {
		env := room.Environment
		if env == nil {
			continue
		}

		room.Tick++
		env.Tick = room.Tick

		es.updateWeather(env, room.Tick)
		es.updateWind(env)
		es.updateGravity(env)
		es.updateTemperature(env)
		es.updateTimeOfDay(env)
		es.updateAltitudeEffects(env)
		es.updatePlatforms(room)

		if room.Tick%10 == 0 {
			snapshot := room.SnapshotEnvironment()
			es.server.BroadcastEnvUpdate(room.RoomID, snapshot)
		}
	}
}

func (es *EnvironmentSimulator) updateWeather(env *models.EnvironmentState, tick int64) {
	if tick%600 != 0 {
		return
	}

	roll := rand.Float64()
	switch {
	case roll < 0.4:
		env.Weather = models.WeatherClear
	case roll < 0.6:
		env.Weather = models.WeatherCloudy
	case roll < 0.75:
		env.Weather = models.WeatherStorm
	case roll < 0.9:
		env.Weather = models.WeatherFog
	default:
		env.Weather = models.WeatherAurora
	}

	switch env.Weather {
	case models.WeatherClear:
		env.Visibility = 0.9 + rand.Float64()*0.1
		env.CloudDensity = 0.1 + rand.Float64()*0.2
		env.LightningIntensity = 0
		env.AuroraIntensity = 0
	case models.WeatherCloudy:
		env.Visibility = 0.6 + rand.Float64()*0.3
		env.CloudDensity = 0.5 + rand.Float64()*0.3
		env.LightningIntensity = 0
		env.AuroraIntensity = 0
	case models.WeatherStorm:
		env.Visibility = 0.2 + rand.Float64()*0.3
		env.CloudDensity = 0.8 + rand.Float64()*0.2
		env.LightningIntensity = 0.5 + rand.Float64()*0.5
		env.AuroraIntensity = 0
	case models.WeatherFog:
		env.Visibility = 0.1 + rand.Float64()*0.2
		env.CloudDensity = 0.4 + rand.Float64()*0.2
		env.LightningIntensity = 0
		env.AuroraIntensity = 0
	case models.WeatherAurora:
		env.Visibility = 0.7 + rand.Float64()*0.3
		env.CloudDensity = 0.1 + rand.Float64()*0.2
		env.LightningIntensity = 0
		env.AuroraIntensity = 0.5 + rand.Float64()*0.5
	}
}

func (es *EnvironmentSimulator) updateWind(env *models.EnvironmentState) {
	windDelta := (rand.Float64() - 0.5) * 2.0
	env.WindSpeed = math.Max(0, math.Min(50, env.WindSpeed+windDelta))

	dirDelta := (rand.Float64() - 0.5) * 10.0
	env.WindDirection = math.Mod(env.WindDirection+dirDelta, 360)
	if env.WindDirection < 0 {
		env.WindDirection += 360
	}
}

func (es *EnvironmentSimulator) updateGravity(env *models.EnvironmentState) {
	baseGravity := 9.8
	altitudeFactor := (env.Altitude - 2000) / 10000.0
	gravityFlux := math.Sin(float64(env.Tick)*0.001) * 0.5

	if env.Weather == models.WeatherStorm {
		gravityFlux += (rand.Float64() - 0.5) * 1.0
	}

	env.Gravity = baseGravity*(1-altitudeFactor*0.01) + gravityFlux
	env.Gravity = math.Max(1.0, math.Min(15.0, env.Gravity))
}

func (es *EnvironmentSimulator) updateTemperature(env *models.EnvironmentState) {
	altitudeEffect := -(env.Altitude - 2000) / 500.0 * 3.0
	timeEffect := math.Sin(env.TimeOfDay/24.0*math.Pi*2-math.Pi/2) * 5.0
	noise := (rand.Float64() - 0.5) * 0.5

	env.Temperature = 15.0 + altitudeEffect + timeEffect + noise
	env.Temperature = math.Max(-40, math.Min(40, env.Temperature))
}

func (es *EnvironmentSimulator) updateTimeOfDay(env *models.EnvironmentState) {
	env.TimeOfDay += 0.001
	if env.TimeOfDay >= 24.0 {
		env.TimeOfDay -= 24.0
	}
}

func (es *EnvironmentSimulator) updateAltitudeEffects(env *models.EnvironmentState) {
	altitudeShift := (rand.Float64() - 0.5) * 0.5
	env.Altitude = math.Max(500, math.Min(10000, env.Altitude+altitudeShift))

	env.AtmosphericPressure = 1013.25 * math.Pow(1-0.0000225577*env.Altitude, 5.25588)
}

func (es *EnvironmentSimulator) updatePlatforms(room *models.RoomState) {
	env := room.Environment

	for _, platform := range room.Platforms {
		if platform.IsAnchored {
			platform.Velocity = models.Vector3{}
			continue
		}

		windRad := env.WindDirection * math.Pi / 180.0
		windForceX := math.Cos(windRad) * env.WindSpeed * 0.001
		windForceZ := math.Sin(windRad) * env.WindSpeed * 0.001

		buoyancy := env.Gravity * 0.98

		platform.Velocity.X = (platform.Velocity.X + windForceX) * 0.99
		platform.Velocity.Y = (platform.Velocity.Y + (buoyancy-env.Gravity)*0.01) * 0.99
		platform.Velocity.Z = (platform.Velocity.Z + windForceZ) * 0.99

		if env.Weather == models.WeatherStorm {
			platform.Velocity.X += (rand.Float64() - 0.5) * 0.1
			platform.Velocity.Z += (rand.Float64() - 0.5) * 0.1
			platform.Stability = math.Max(0.1, platform.Stability-0.001)
		} else {
			platform.Stability = math.Min(1.0, platform.Stability+0.0005)
		}

		platform.Position.X += platform.Velocity.X
		platform.Position.Y += platform.Velocity.Y
		platform.Position.Z += platform.Velocity.Z

		if math.Abs(platform.Position.Y) > 100 {
			platform.Velocity.Y *= -0.5
		}
	}
}
