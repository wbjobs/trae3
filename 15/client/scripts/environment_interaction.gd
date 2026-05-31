extends Node

var _bus: Node
var _env_simulator: Node
var _gravity_scale: float = 1.0
var _wind_force: Vector3 = Vector3.ZERO
var _temperature_effect: float = 1.0
var _last_applied_seq: int = -1

signal gravity_changed(gravity: float)
signal wind_changed(wind_vector: Vector3)
signal temperature_changed(temp: float)
signal weather_alert(weather: String)

func _ready() -> void:
	set_physics_process(false)

func initialize(bus: Node, env_simulator: Node) -> void:
	_bus = bus
	_env_simulator = env_simulator
	_bus.subscribe("game:env_updated", _on_env_updated)
	_bus.subscribe("game:env_restored", _on_env_restored)
	_bus.subscribe("game:connection_restored", _on_connection_restored)
	set_physics_process(true)

func _physics_process(delta: float) -> void:
	if not _env_simulator:
		return

	var gravity = _env_simulator.get_gravity()
	_gravity_scale = gravity / 9.8

	var wind_vector = _env_simulator.get_wind_vector()
	_wind_force = _wind_force.lerp(wind_vector, delta * 3.0)

	var env_data = _env_simulator.get_environment_data()
	_temperature_effect = _calculate_temperature_effect(float(env_data.get("temperature", 15.0)))

	gravity_changed.emit(gravity)
	wind_changed.emit(_wind_force)
	temperature_changed.emit(float(env_data.get("temperature", 15.0)))

func get_gravity() -> float:
	if _env_simulator and _env_simulator.has_method("get_gravity"):
		return _env_simulator.get_gravity()
	return 9.8

func get_gravity_scale() -> float:
	return _gravity_scale

func get_wind_force() -> Vector3:
	return _wind_force

func get_temperature_effect() -> float:
	return _temperature_effect

func apply_physics_to_body(body: CharacterBody3D, delta: float) -> void:
	if not is_instance_valid(body):
		return

	var gravity = get_gravity()
	var gravity_vec = Vector3.DOWN * gravity * _gravity_scale

	if not body.is_on_floor():
		body.velocity += gravity_vec * delta

	body.velocity += _wind_force * delta * 0.01

	if _temperature_effect < 0.5:
		body.velocity *= 0.98

func _on_env_updated(env_data: Dictionary) -> void:
	_check_drift_and_alert(env_data)

func _on_env_restored(env_data: Dictionary) -> void:
	_check_drift_and_alert(env_data)

func _on_connection_restored(_data = null) -> void:
	if _env_simulator and _env_simulator.has_method("get_environment_data"):
		_on_env_updated(_env_simulator.get_environment_data())

func _check_drift_and_alert(env_data: Dictionary) -> void:
	var incoming_seq = int(env_data.get("tick", 0))
	if incoming_seq <= _last_applied_seq and _last_applied_seq > 0:
		return
	_last_applied_seq = incoming_seq

	if _env_simulator and _env_simulator.has_method("get_env_seq"):
		var sim_seq = _env_simulator.get_env_seq()
		if sim_seq > 0 and incoming_seq > 0 and abs(incoming_seq - sim_seq) > 100:
			if _env_simulator.has_method("force_sync"):
				_env_simulator.force_sync(env_data)

	var weather = str(env_data.get("weather", "clear"))
	match weather:
		"storm":
			weather_alert.emit("storm")
		"fog":
			weather_alert.emit("fog")
		"aurora":
			weather_alert.emit("aurora")

func _calculate_temperature_effect(temp: float) -> float:
	var optimal_temp = 15.0
	var deviation = abs(temp - optimal_temp)
	var effect = 1.0 - (deviation / 40.0)
	return clampf(effect, 0.0, 1.0)
