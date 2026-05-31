extends CharacterBody3D

var _player_id: String = ""
var _target_position: Vector3 = Vector3.ZERO
var _target_rotation: Vector3 = Vector3.ZERO
var _interp_speed: float = 10.0

func _physics_process(delta: float) -> void:
	position = position.lerp(_target_position, delta * _interp_speed)
	rotation = rotation.lerp(_target_rotation, delta * _interp_speed)

func set_player_id(pid: String) -> void:
	_player_id = pid

func get_player_id() -> String:
	return _player_id

func update_from_server(data: Dictionary) -> void:
	if data.has("position"):
		var pos = data["position"]
		_target_position = Vector3(float(pos.get("x", 0.0)), float(pos.get("y", 0.0)), float(pos.get("z", 0.0)))
	if data.has("rotation"):
		var rot = data["rotation"]
		_target_rotation = Vector3(float(rot.get("x", 0.0)), float(rot.get("y", 0.0)), float(rot.get("z", 0.0)))
