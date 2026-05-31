extends CharacterBody3D

var _bus: Node
var _move_speed: float = 8.0
var _fly_speed: float = 12.0
var _jump_velocity: float = 10.0
var _mouse_sensitivity: float = 0.003
var _is_flying: bool = false
var _health: float = 100.0
var _energy: float = 100.0
var _camera: Camera3D
var _gravity: float = 9.8
var _wind_force: Vector3 = Vector3.ZERO
var _temperature_effect: float = 1.0

signal state_changed(state: Dictionary)

func _ready() -> void:
	_camera = $Camera3D
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func initialize(bus: Node) -> void:
	_bus = bus
	_bus.subscribe("game:env_updated", _on_env_updated)
	_bus.subscribe("game:env_restored", _on_env_restored)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and _camera:
		rotate_y(-event.relative.x * _mouse_sensitivity)
		_camera.rotate_x(-event.relative.y * _mouse_sensitivity)
		_camera.rotation.x = clampf(_camera.rotation.x, -PI / 2, PI / 2)

	if event.is_action_pressed("fly_toggle"):
		_is_flying = !_is_flying

	if event.is_action_pressed("ui_cancel"):
		if Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
			Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		else:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _physics_process(delta: float) -> void:
	var input_dir = Input.get_vector("move_left", "move_right", "move_forward", "move_backward")
	var direction = (transform.basis * Vector3(input_dir.x, 0, input_dir.y)).normalized()

	if _is_flying:
		_handle_flying(delta, direction)
	else:
		_handle_walking(delta, direction)

	_apply_environment_physics(delta)

	if _is_flying:
		_energy = maxf(0.0, _energy - delta * 2.0)
		if _energy <= 0.0:
			_is_flying = false
	else:
		_energy = minf(100.0, _energy + delta * 5.0)

	move_and_slide()
	_emit_state()

func _handle_walking(delta: float, direction: Vector3) -> void:
	if not is_on_floor():
		velocity += Vector3.DOWN * _gravity * delta
	else:
		if Input.is_action_just_pressed("jump"):
			velocity.y = _jump_velocity

	if direction:
		velocity.x = direction.x * _move_speed
		velocity.z = direction.z * _move_speed
	else:
		velocity.x = move_toward(velocity.x, 0, _move_speed)
		velocity.z = move_toward(velocity.z, 0, _move_speed)

func _handle_flying(delta: float, direction: Vector3) -> void:
	var fly_vel = direction * _fly_speed
	if Input.is_action_pressed("jump"):
		fly_vel.y = _fly_speed

	if not Input.is_action_pressed("jump") and not is_on_floor():
		fly_vel.y = velocity.y * 0.95

	velocity = velocity.lerp(fly_vel, delta * 8.0)

func _apply_environment_physics(delta: float) -> void:
	velocity += _wind_force * delta * 0.01
	if _temperature_effect < 0.5:
		velocity *= 0.98

func _emit_state() -> void:
	var state = {
		"position": {"x": position.x, "y": position.y, "z": position.z},
		"velocity": {"x": velocity.x, "y": velocity.y, "z": velocity.z},
		"rotation": {"x": rotation.x, "y": rotation.y, "z": rotation.z},
		"health": _health,
		"energy": _energy,
		"is_flying": _is_flying,
	}
	state_changed.emit(state)
	_bus.emit("player:state_changed", state)

func _on_env_updated(env_data: Dictionary) -> void:
	_apply_env_params(env_data)

func _on_env_restored(env_data: Dictionary) -> void:
	_apply_env_params(env_data)

func _apply_env_params(env_data: Dictionary) -> void:
	if env_data.has("gravity"):
		_gravity = float(env_data["gravity"])
	if env_data.has("wind_speed") and env_data.has("wind_direction"):
		var ws = float(env_data["wind_speed"])
		var wd = deg_to_rad(float(env_data["wind_direction"]))
		_wind_force = Vector3(cos(wd) * ws, 0.0, sin(wd) * ws)
	if env_data.has("temperature"):
		var temp = float(env_data["temperature"])
		var deviation = abs(temp - 15.0)
		_temperature_effect = clampf(1.0 - (deviation / 40.0), 0.0, 1.0)

func take_damage(amount: float) -> void:
	_health = maxf(0.0, _health - amount)
	if _health <= 0.0:
		_respawn()

func heal(amount: float) -> void:
	_health = minf(100.0, _health + amount)

func _respawn() -> void:
	position = Vector3(0, 10, 0)
	velocity = Vector3.ZERO
	_health = 100.0
	_energy = 100.0
	_is_flying = false
