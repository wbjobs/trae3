extends RigidBody3D

var _platform_id: String = ""
var _stability: float = 1.0
var _is_anchored: bool = false
var _bus: Node
var _current_wind: Vector3 = Vector3.ZERO
var _current_gravity: float = 9.8

signal platform_interacted(platform_id: String, action: String)

func _ready() -> void:
	gravity_scale = 0.0
	axial_lock = true

func initialize(bus: Node) -> void:
	_bus = bus
	_bus.subscribe("game:env_updated", _on_env_updated)

func _physics_process(delta: float) -> void:
	if _is_anchored:
		linear_velocity = Vector3.ZERO
		angular_velocity = Vector3.ZERO
		return

	apply_central_force(_current_wind * 0.5)

	var buoyancy = Vector3.UP * _current_gravity * mass * _stability
	apply_central_force(buoyancy)

	if _stability < 0.5:
		var wobble = Vector3(randf_range(-1, 1), 0, randf_range(-1, 1)) * (1.0 - _stability) * 5.0
		apply_torque(wobble)

func _on_env_updated(env_data: Dictionary) -> void:
	if env_data.has("gravity"):
		_current_gravity = float(env_data["gravity"])
	if env_data.has("wind_speed") and env_data.has("wind_direction"):
		var ws = float(env_data["wind_speed"])
		var wd = deg_to_rad(float(env_data["wind_direction"]))
		_current_wind = Vector3(cos(wd) * ws, 0.0, sin(wd) * ws)

func set_platform_id(pid: String) -> void:
	_platform_id = pid

func get_platform_id() -> String:
	return _platform_id

func set_stability(s: float) -> void:
	_stability = clampf(s, 0.0, 1.0)

func set_anchored(anchored: bool) -> void:
	_is_anchored = anchored

func get_platform_data() -> Dictionary:
	return {
		"platform_id": _platform_id,
		"position": {"x": position.x, "y": position.y, "z": position.z},
		"stability": _stability,
		"is_anchored": _is_anchored,
	}

func apply_platform_data(data: Dictionary) -> void:
	if data.has("position"):
		var pos = data["position"]
		position = Vector3(float(pos.get("x", 0.0)), float(pos.get("y", 0.0)), float(pos.get("z", 0.0)))
	if data.has("stability"):
		_stability = float(data["stability"])
	if data.has("is_anchored"):
		_is_anchored = bool(data["is_anchored"])
