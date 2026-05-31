extends Node

var _bus: Node
var _local_player_state: Dictionary = {}
var _remote_players: Dictionary = {}
var _environment_state: Dictionary = {}
var _platforms_state: Dictionary = {}
var _room_id: String = ""
var _player_id: String = ""
var _env_seq: int = -1
var _last_snapshot_time: int = 0

func _ready() -> void:
	set_process(false)

func initialize(bus: Node) -> void:
	_bus = bus
	_bus.subscribe("network:login_ok", _on_login_ok)
	_bus.subscribe("network:room_state", _on_room_state)
	_bus.subscribe("network:player_joined", _on_player_joined)
	_bus.subscribe("network:player_left", _on_player_left)
	_bus.subscribe("network:player_updated", _on_player_updated)
	_bus.subscribe("network:env_update", _on_env_update)
	_bus.subscribe("network:platform_updated", _on_platform_updated)
	_bus.subscribe("network:disconnected", _on_disconnected)
	_bus.subscribe("network:reconnected", _on_reconnected)
	_bus.subscribe("player:state_changed", _on_local_player_state)
	set_process(true)

func get_local_player_state() -> Dictionary:
	return _local_player_state

func get_remote_players() -> Dictionary:
	return _remote_players

func get_environment_state() -> Dictionary:
	return _environment_state

func get_platforms_state() -> Dictionary:
	return _platforms_state

func get_room_id() -> String:
	return _room_id

func get_player_id() -> String:
	return _player_id

func get_env_seq() -> int:
	return _env_seq

func take_snapshot() -> Dictionary:
	return {
		"player_id": _player_id,
		"room_id": _room_id,
		"local_player": _local_player_state.duplicate(true),
		"remote_players": _remote_players.duplicate(true),
		"environment": _environment_state.duplicate(true),
		"platforms": _platforms_state.duplicate(true),
		"env_seq": _env_seq,
		"timestamp": Time.get_ticks_msec(),
	}

func restore_from_snapshot(snapshot: Dictionary) -> void:
	if snapshot.has("room_id"):
		_room_id = str(snapshot["room_id"])
	if snapshot.has("environment"):
		_environment_state = snapshot["environment"]
		_env_seq = snapshot.get("env_seq", -1)
		_bus.emit("game:env_restored", _environment_state)
	if snapshot.has("platforms"):
		_platforms_state = snapshot["platforms"]
		_bus.emit("game:platforms_restored", _platforms_state)

func _on_login_ok(data: Dictionary) -> void:
	_player_id = str(data.get("player_id", ""))

func _on_room_state(room_data: Dictionary) -> void:
	_room_id = str(room_data.get("room_id", ""))

	if room_data.has("environment"):
		_environment_state = room_data["environment"]
		_env_seq = int(_environment_state.get("tick", 0))

	if room_data.has("players"):
		_remote_players.clear()
		for pid in room_data["players"]:
			if str(pid) != _player_id:
				_remote_players[str(pid)] = room_data["players"][pid]
		_bus.emit("game:players_synced", _remote_players)

	if room_data.has("platforms"):
		_platforms_state = room_data["platforms"]
		_bus.emit("game:platforms_synced", _platforms_state)

	_bus.emit("game:room_joined", room_data)

func _on_player_joined(data: Dictionary) -> void:
	var pid = str(data.get("player_id", ""))
	if pid != _player_id:
		_remote_players[pid] = data
		_bus.emit("game:player_spawned", data)

func _on_player_left(data: Dictionary) -> void:
	var pid = str(data.get("player_id", ""))
	_remote_players.erase(pid)
	_bus.emit("game:player_despawned", data)

func _on_player_updated(data: Dictionary) -> void:
	var pid = str(data.get("player_id", ""))
	if pid == _player_id:
		return
	_remote_players[pid] = data
	_bus.emit("game:remote_player_updated", data)

func _on_env_update(env_data: Dictionary) -> void:
	var incoming_seq = int(env_data.get("tick", 0))
	if incoming_seq <= _env_seq:
		return
	_env_seq = incoming_seq
	_environment_state = env_data
	_bus.emit("game:env_updated", env_data)

func _on_platform_updated(data: Dictionary) -> void:
	var pid = str(data.get("platform_id", ""))
	_platforms_state[pid] = data
	_bus.emit("game:platform_updated", data)

func _on_local_player_state(state: Dictionary) -> void:
	_local_player_state = state

func _on_disconnected(_data = null) -> void:
	_bus.emit("game:connection_lost")

func _on_reconnected(_data = null) -> void:
	_bus.emit("game:connection_restored", {
		"room_id": _room_id,
		"player_id": _player_id,
	})
