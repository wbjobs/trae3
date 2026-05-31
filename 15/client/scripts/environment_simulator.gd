extends Node

var _weather: String = "clear"
var _wind_speed: float = 5.0
var _wind_direction: float = 0.0
var _gravity: float = 9.8
var _temperature: float = 15.0
var _visibility: float = 1.0
var _atmospheric_pressure: float = 1013.25
var _cloud_density: float = 0.3
var _lightning_intensity: float = 0.0
var _aurora_intensity: float = 0.0
var _time_of_day: float = 12.0
var _altitude: float = 2000.0
var _env_seq: int = 0

var _target_weather: String = "clear"
var _target_gravity: float = 9.8
var _target_wind_speed: float = 5.0
var _target_wind_direction: float = 0.0
var _target_temperature: float = 15.0
var _target_visibility: float = 1.0
var _target_cloud_density: float = 0.3
var _target_aurora_intensity: float = 0.0
var _target_lightning_intensity: float = 0.0
var _target_time_of_day: float = 12.0
var _target_altitude: float = 2000.0
var _target_atmospheric_pressure: float = 1013.25

var _world_environment: WorldEnvironment
var _directional_light: DirectionalLight3D
var _fog_volume: FogVolume
var _wind_particles: GPUParticles3D
var _lightning_timer: Timer
var _aurora_mesh: MeshInstance3D
var _bus: Node

var _interpolation_speed: float = 5.0

func _ready() -> void:
	_setup_lighting()
	_setup_sky()
	_setup_fog()
	_setup_wind_particles()
	_setup_lightning_timer()
	_setup_aurora()

func initialize(bus: Node) -> void:
	_bus = bus
	_bus.subscribe("game:env_updated", _on_env_updated)
	_bus.subscribe("game:env_restored", _on_env_restored)

func _physics_process(delta: float) -> void:
	_gravity = lerpf(_gravity, _target_gravity, delta * _interpolation_speed)
	_wind_speed = lerpf(_wind_speed, _target_wind_speed, delta * _interpolation_speed)
	_wind_direction = _lerp_angle_deg(_wind_direction, _target_wind_direction, delta * _interpolation_speed)
	_temperature = lerpf(_temperature, _target_temperature, delta * _interpolation_speed * 0.5)
	_visibility = lerpf(_visibility, _target_visibility, delta * _interpolation_speed)
	_cloud_density = lerpf(_cloud_density, _target_cloud_density, delta * _interpolation_speed)
	_aurora_intensity = lerpf(_aurora_intensity, _target_aurora_intensity, delta * _interpolation_speed * 0.5)
	_lightning_intensity = lerpf(_lightning_intensity, _target_lightning_intensity, delta * _interpolation_speed * 2.0)
	_time_of_day = lerpf(_time_of_day, _target_time_of_day, delta * _interpolation_speed)
	_altitude = lerpf(_altitude, _target_altitude, delta * _interpolation_speed * 0.3)
	_atmospheric_pressure = lerpf(_atmospheric_pressure, _target_atmospheric_pressure, delta * _interpolation_speed * 0.3)

	_weather = _target_weather

	_update_sky(delta)
	_update_fog(delta)
	_update_wind(delta)
	_update_lighting(delta)
	_update_aurora(delta)

func _on_env_updated(env_data: Dictionary) -> void:
	_apply_server_env(env_data)

func _on_env_restored(env_data: Dictionary) -> void:
	_apply_server_env(env_data)

func _apply_server_env(env_data: Dictionary) -> void:
	if env_data.has("tick"):
		var incoming_seq = int(env_data["tick"])
		if incoming_seq <= _env_seq:
			return
		_env_seq = incoming_seq

	if env_data.has("weather"):
		_target_weather = str(env_data["weather"])
	if env_data.has("wind_speed"):
		_target_wind_speed = float(env_data["wind_speed"])
	if env_data.has("wind_direction"):
		_target_wind_direction = float(env_data["wind_direction"])
	if env_data.has("gravity"):
		_target_gravity = float(env_data["gravity"])
	if env_data.has("temperature"):
		_target_temperature = float(env_data["temperature"])
	if env_data.has("visibility"):
		_target_visibility = float(env_data["visibility"])
	if env_data.has("cloud_density"):
		_target_cloud_density = float(env_data["cloud_density"])
	if env_data.has("lightning_intensity"):
		_target_lightning_intensity = float(env_data["lightning_intensity"])
	if env_data.has("aurora_intensity"):
		_target_aurora_intensity = float(env_data["aurora_intensity"])
	if env_data.has("time_of_day"):
		_target_time_of_day = float(env_data["time_of_day"])
	if env_data.has("altitude"):
		_target_altitude = float(env_data["altitude"])
	if env_data.has("atmospheric_pressure"):
		_target_atmospheric_pressure = float(env_data["atmospheric_pressure"])

func get_gravity() -> float:
	return _gravity

func get_wind_vector() -> Vector3:
	var rad = deg_to_rad(_wind_direction)
	return Vector3(cos(rad) * _wind_speed, 0.0, sin(rad) * _wind_speed)

func get_environment_data() -> Dictionary:
	return {
		"weather": _weather,
		"wind_speed": _wind_speed,
		"wind_direction": _wind_direction,
		"gravity": _gravity,
		"temperature": _temperature,
		"visibility": _visibility,
		"atmospheric_pressure": _atmospheric_pressure,
		"cloud_density": _cloud_density,
		"lightning_intensity": _lightning_intensity,
		"aurora_intensity": _aurora_intensity,
		"time_of_day": _time_of_day,
		"altitude": _altitude,
		"tick": _env_seq,
	}

func get_env_seq() -> int:
	return _env_seq

func force_sync(env_data: Dictionary) -> void:
	if env_data.has("gravity"):
		_gravity = float(env_data["gravity"])
		_target_gravity = _gravity
	if env_data.has("wind_speed"):
		_wind_speed = float(env_data["wind_speed"])
		_target_wind_speed = _wind_speed
	if env_data.has("wind_direction"):
		_wind_direction = float(env_data["wind_direction"])
		_target_wind_direction = _wind_direction
	if env_data.has("temperature"):
		_temperature = float(env_data["temperature"])
		_target_temperature = _temperature
	if env_data.has("time_of_day"):
		_time_of_day = float(env_data["time_of_day"])
		_target_time_of_day = _time_of_day
	if env_data.has("visibility"):
		_visibility = float(env_data["visibility"])
		_target_visibility = _visibility
	if env_data.has("altitude"):
		_altitude = float(env_data["altitude"])
		_target_altitude = _altitude
	if env_data.has("atmospheric_pressure"):
		_atmospheric_pressure = float(env_data["atmospheric_pressure"])
		_target_atmospheric_pressure = _atmospheric_pressure
	if env_data.has("weather"):
		_weather = str(env_data["weather"])
		_target_weather = _weather
	if env_data.has("tick"):
		_env_seq = int(env_data["tick"])

func _lerp_angle_deg(from: float, to: float, weight: float) -> float:
	var diff = fmod(to - from, 360.0)
	if diff > 180.0:
		diff -= 360.0
	elif diff < -180.0:
		diff += 360.0
	return fmod(from + diff * weight, 360.0)

func _setup_lighting() -> void:
	_directional_light = DirectionalLight3D.new()
	_directional_light.name = "SunLight"
	_directional_light.light_color = Color(1.0, 0.95, 0.8)
	_directional_light.light_energy = 1.2
	_directional_light.shadow_enabled = true
	add_child(_directional_light)

func _setup_sky() -> void:
	var sky = Sky.new()
	sky.sky_top_color = Color(0.3, 0.5, 0.8)
	sky.sky_horizon_color = Color(0.6, 0.7, 0.9)
	sky.ground_bottom_color = Color(0.1, 0.1, 0.2)
	sky.ground_horizon_color = Color(0.4, 0.5, 0.7)

	var env = Environment.new()
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_color = Color(0.5, 0.6, 0.8)
	env.fog_light_color = Color(0.6, 0.7, 0.9)
	env.fog_depth_enabled = true
	env.fog_depth_begin = 50.0
	env.fog_depth_end = 300.0

	_world_environment = WorldEnvironment.new()
	_world_environment.environment = env
	add_child(_world_environment)

func _setup_fog() -> void:
	_fog_volume = FogVolume.new()
	_fog_volume.name = "DynamicFog"
	_fog_volume.size = Vector3(500, 100, 500)
	_fog_volume.position = Vector3(0, 0, 0)
	add_child(_fog_volume)

func _setup_wind_particles() -> void:
	_wind_particles = GPUParticles3D.new()
	_wind_particles.name = "WindParticles"
	_wind_particles.amount = 200
	_wind_particles.explosiveness = 0.0
	_wind_particles.randomness = 0.8

	var process_mat = ParticleProcessMaterial.new()
	process_mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	process_mat.emission_box_extents = Vector3(100, 50, 100)
	process_mat.gravity = Vector3.ZERO
	process_mat.direction = Vector3(1, 0, 0)
	process_mat.spread = 15.0
	process_mat.initial_velocity_min = 2.0
	process_mat.initial_velocity_max = 8.0

	_wind_particles.process_material = process_mat
	add_child(_wind_particles)

func _setup_lightning_timer() -> void:
	_lightning_timer = Timer.new()
	_lightning_timer.name = "LightningTimer"
	_lightning_timer.wait_time = 3.0
	_lightning_timer.one_shot = true
	_lightning_timer.connect("timeout", _on_lightning_timeout)
	add_child(_lightning_timer)

func _setup_aurora() -> void:
	_aurora_mesh = MeshInstance3D.new()
	_aurora_mesh.name = "Aurora"
	_aurora_mesh.position = Vector3(0, 80, -100)
	_aurora_mesh.rotation_degrees = Vector3(-30, 0, 0)
	_aurora_mesh.visible = false
	add_child(_aurora_mesh)

func _update_sky(_delta: float) -> void:
	if not _world_environment or not _world_environment.environment:
		return
	var env = _world_environment.environment
	if env.sky:
		var is_night = _time_of_day < 6.0 or _time_of_day > 20.0
		if is_night:
			env.sky.sky_top_color = Color(0.02, 0.02, 0.08)
			env.sky.sky_horizon_color = Color(0.05, 0.05, 0.15)
		else:
			var day_factor = 1.0
			if _time_of_day < 8.0:
				day_factor = (_time_of_day - 6.0) / 2.0
			elif _time_of_day > 18.0:
				day_factor = (20.0 - _time_of_day) / 2.0
			day_factor = clampf(day_factor, 0.0, 1.0)
			env.sky.sky_top_color = Color(0.3, 0.5, 0.8).lerp(Color(0.02, 0.02, 0.08), 1.0 - day_factor)

func _update_fog(_delta: float) -> void:
	if not _world_environment or not _world_environment.environment:
		return
	var env = _world_environment.environment
	env.fog_depth_enabled = _visibility < 0.8
	env.fog_density = (1.0 - _visibility) * 0.05
	if _fog_volume:
		_fog_volume.visible = _weather == "fog"

func _update_wind(_delta: float) -> void:
	if _wind_particles and _wind_particles.process_material:
		var mat = _wind_particles.process_material as ParticleProcessMaterial
		if mat:
			var wind_rad = deg_to_rad(_wind_direction)
			mat.direction = Vector3(cos(wind_rad), 0.0, sin(wind_rad))
			mat.initial_velocity_min = _wind_speed * 0.3
			mat.initial_velocity_max = _wind_speed * 1.0
		_wind_particles.amount_ratio = clampf(_wind_speed / 30.0, 0.1, 1.0)

func _update_lighting(_delta: float) -> void:
	if not _directional_light:
		return
	var sun_angle = (_time_of_day / 24.0) * 360.0 - 90.0
	_directional_light.rotation_degrees.x = sun_angle

	var is_day = _time_of_day > 6.0 and _time_of_day < 18.0
	if is_day:
		_directional_light.light_energy = 1.2
		_directional_light.light_color = Color(1.0, 0.95, 0.8)
	else:
		_directional_light.light_energy = 0.1
		_directional_light.light_color = Color(0.3, 0.4, 0.7)

	if _weather == "storm":
		_directional_light.light_energy *= 0.4
	elif _weather == "cloudy":
		_directional_light.light_energy *= 0.7

	if _lightning_intensity > 0.1 and _lightning_timer.is_stopped():
		_trigger_lightning()

func _update_aurora(_delta: float) -> void:
	if _aurora_mesh:
		_aurora_mesh.visible = _aurora_intensity > 0.1

func _trigger_lightning() -> void:
	if not _directional_light:
		return
	var original_energy = _directional_light.light_energy
	_directional_light.light_energy = 10.0
	_directional_light.light_color = Color(0.9, 0.9, 1.0)
	await get_tree().create_timer(0.1).timeout
	_directional_light.light_energy = original_energy
	_lightning_timer.wait_time = randf_range(1.0, 5.0) / maxf(_lightning_intensity, 0.01)
	_lightning_timer.start()

func _on_lightning_timeout() -> void:
	if _lightning_intensity > 0.1:
		_trigger_lightning()
