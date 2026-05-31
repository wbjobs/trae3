extends Node

var _save_dir: String = "user://saves/"
var _temp_suffix: String = ".tmp"
var _bus: Node
var _cache: Dictionary = {}
var _cache_size: int = 20
var _save_queue: Array = []
var _load_queue: Array = []
var _worker_thread: Thread
var _is_processing: bool = false
var _mutex: Mutex = Mutex.new()

signal save_completed(save_id: String)
signal load_completed(save_data: Dictionary)
signal load_failed(error: String)
signal local_save_completed(file_name: String)
signal local_save_failed(file_name: String, error: String)
signal local_load_completed(data: Dictionary)
signal local_load_failed(file_name: String, error: String)

func _ready() -> void:
	_ensure_save_dir()
	_worker_thread = Thread.new()

func initialize(bus: Node) -> void:
	_bus = bus
	_bus.subscribe("network:save_match_ok", _on_save_match_ok)
	_bus.subscribe("network:load_match_ok", _on_load_match_ok)
	_bus.subscribe("network:load_match_fail", _on_load_match_fail)

func save_to_server() -> void:
	_bus.emit("network:send_save_match")

func load_from_server(save_id: String) -> void:
	_bus.emit("network:send_load_match", {"save_id": save_id})

func save_local_async(save_name: String, game_state: Dictionary) -> void:
	_mutex.lock()
	_save_queue.append({"name": save_name, "state": game_state})
	_mutex.unlock()
	_process_queue()

func load_local_async(save_name: String) -> void:
	_mutex.lock()
	_load_queue.append({"name": save_name})
	_mutex.unlock()
	_process_queue()

func _process_queue() -> void:
	if _is_processing:
		return

	_is_processing = true
	_worker_thread.start(_worker_func)

func _worker_func() -> void:
	while true:
		_mutex.lock()
		var has_save = _save_queue.size() > 0
		var has_load = _load_queue.size() > 0
		_mutex.unlock()

		if has_save:
			_mutex.lock()
			var item = _save_queue.pop_front()
			_mutex.unlock()
			_process_save(item["name"], item["state"])
		elif has_load:
			_mutex.lock()
			var load_item = _load_queue.pop_front()
			_mutex.unlock()
			_process_load(load_item["name"])
		else:
			break

	_is_processing = false

func _process_save(save_name: String, game_state: Dictionary) -> void:
	var data = {
		"version": 1,
		"save_name": save_name,
		"timestamp": Time.get_datetime_string_from_system(),
		"game_state": game_state,
		"checksum": _compute_checksum(game_state),
	}

	var json_str = JSON.stringify(data)
	var data_bytes = json_str.to_utf8_buffer()

	var compressed = PackedByteArray()
	if data_bytes.size() > 1024:
		var compressor = Compressor.new()
		compressed = compressor.compress(data_bytes, Compressor.METHOD_GZIP)
		if compressed.size() == 0:
			compressed = data_bytes
	else:
		compressed = data_bytes

	var file_name = save_name + ".json"
	var file_path = _save_dir + file_name
	var temp_path = file_path + _temp_suffix

	var header = PackedByteArray()
	header.resize(5)
	header[0] = 0x1f
	header[1] = 0x8b
	header[2] = 0x08
	header[3] = data_bytes.size() & 0xff
	header[4] = (data_bytes.size() >> 8) & 0xff

	var output_data = header + compressed

	var file = FileAccess.open(temp_path, FileAccess.WRITE)
	if not file:
		call_deferred("save_failed", save_name, "Cannot open temp file for writing")
		return

	file.store_buffer(output_data)
	file.close()

	var readback = FileAccess.open(temp_path, FileAccess.READ)
	if not readback:
		_cleanup_file(temp_path)
		call_deferred("save_failed", save_name, "Cannot verify saved data")
		return
	var verify_data = readback.get_buffer(readback.get_length())
	readback.close()

	if verify_data.size() != output_data.size():
		_cleanup_file(temp_path)
		call_deferred("save_failed", save_name, "Save verification failed: size mismatch")
		return

	if FileAccess.file_exists(file_path):
		var backup_path = file_path + ".bak"
		if FileAccess.file_exists(backup_path):
			_cleanup_file(backup_path)
		var dir = DirAccess.open(_save_dir)
		if dir:
			dir.rename(file_name, file_name + ".bak")

	var dir = DirAccess.open(_save_dir)
	if not dir:
		_cleanup_file(temp_path)
		call_deferred("save_failed", save_name, "Cannot access save directory")
		return

	var rename_err = dir.rename(file_name + _temp_suffix, file_name)
	if rename_err != OK:
		_cleanup_file(temp_path)
		call_deferred("save_failed", save_name, "Atomic rename failed")
		return

	_cache_save(save_name, data)
	call_deferred("save_completed_signal", save_name)

func _process_load(save_name: String) -> void:
	if _cache.has(save_name):
		call_deferred("load_completed_signal", _cache[save_name])
		return

	var file_path = _save_dir + save_name + ".json"

	if not FileAccess.file_exists(file_path):
		var result = _try_load_backup(save_name)
		if not result.is_empty():
			call_deferred("load_completed_signal", result)
			return
		call_deferred("load_failed_signal", save_name, "Save file not found")
		return

	var data = _read_and_validate(file_path, save_name)
	if not data.is_empty():
		_cache_save(save_name, data)
		call_deferred("load_completed_signal", data)
		return

	var result = _try_load_backup(save_name)
	if not result.is_empty():
		_cache_save(save_name, result)
		call_deferred("load_completed_signal", result)
		return

	call_deferred("load_failed_signal", save_name, "Save data validation failed")

func save_completed_signal(name: String) -> void:
	local_save_completed.emit(name)

func load_completed_signal(data: Dictionary) -> void:
	local_load_completed.emit(data)

func save_failed(name: String, err: String) -> void:
	local_save_failed.emit(name, err)

func load_failed(name: String, err: String) -> void:
	local_load_failed.emit(name, err)

func list_local_saves() -> Array:
	var saves = []
	var dir = DirAccess.open(_save_dir)
	if dir:
		dir.list_dir_begin()
		var file_name = dir.get_next()
		while file_name != "":
			if file_name.ends_with(".json") and not file_name.ends_with(".bak.json") and not file_name.ends_with(".tmp"):
				saves.append(file_name)
			file_name = dir.get_next()
		dir.list_dir_end()
	return saves

func delete_local_save(save_name: String) -> bool:
	_mutex.lock()
	_cache.erase(save_name)
	_mutex.unlock()

	var file_path = _save_dir + save_name + ".json"
	var deleted = false

	if FileAccess.file_exists(file_path):
		var dir = DirAccess.open(_save_dir)
		if dir:
			dir.remove(save_name + ".json")
			deleted = true

	var backup_path = _save_dir + save_name + ".json.bak"
	if FileAccess.file_exists(backup_path):
		var dir = DirAccess.open(_save_dir)
		if dir:
			dir.remove(save_name + ".json.bak")

	return deleted

func capture_game_state(player: Node3D, env_simulator: Node, platforms: Node) -> Dictionary:
	var state = {}

	if player:
		state["player"] = {
			"position": {"x": player.position.x, "y": player.position.y, "z": player.position.z},
			"rotation": {"x": player.rotation.x, "y": player.rotation.y, "z": player.rotation.z},
		}

	if env_simulator and env_simulator.has_method("get_environment_data"):
		state["environment"] = env_simulator.get_environment_data()

	if platforms:
		var platform_data = {}
		for child in platforms.get_children():
			if child.has_method("get_platform_data"):
				platform_data[child.name] = child.get_platform_data()
		state["platforms"] = platform_data

	return state

func restore_game_state(state: Dictionary, player: Node3D, env_simulator: Node, platforms: Node) -> void:
	if state.has("player") and player:
		var pos = state["player"].get("position", {})
		player.position = Vector3(float(pos.get("x", 0.0)), float(pos.get("y", 0.0)), float(pos.get("z", 0.0)))
		var rot = state["player"].get("rotation", {})
		player.rotation = Vector3(float(rot.get("x", 0.0)), float(rot.get("y", 0.0)), float(rot.get("z", 0.0)))

	if state.has("environment") and env_simulator and env_simulator.has_method("force_sync"):
		env_simulator.force_sync(state["environment"])

	if state.has("platforms") and platforms:
		for platform_id in state["platforms"]:
			var child = platforms.get_node_or_null(platform_id)
			if child and child.has_method("apply_platform_data"):
				child.apply_platform_data(state["platforms"][platform_id])

func _cache_save(save_name: String, data: Dictionary) -> void:
	_mutex.lock()
	_cache[save_name] = data
	if _cache.size() > _cache_size:
		var oldest_key = ""
		var oldest_val = 0
		for key in _cache:
			if oldest_key == "" or randf() < 0.1:
				oldest_key = key
		if oldest_key != "":
			_cache.erase(oldest_key)
	_mutex.unlock()

func _compute_checksum(data: Dictionary) -> String:
	var json_str = JSON.stringify(data)
	var hash_val = hash(json_str)
	return str(hash_val)

func _read_and_validate(file_path: String, save_name: String) -> Dictionary:
	var file = FileAccess.open(file_path, FileAccess.READ)
	if not file:
		return {}

	var data = file.get_buffer(file.get_length())
	file.close()

	if data.size() == 0:
		return {}

	if data.size() >= 5 and data[0] == 0x1f and data[1] == 0x8b:
		var original_size = data[3] | (data[4] << 8)
		var compressed_data = data.slice(5, data.size())

		var decompressor = Decompressor.new()
		var decompressed = decompressor.decompress(compressed_data, -1, Decompressor.METHOD_GZIP)
		if decompressed.size() == 0:
			return {}
		data = decompressed

	var json_str = data.get_string_from_utf8()
	var json = JSON.new()
	if json.parse(json_str) != OK:
		return {}

	var result = json.data
	if not result is Dictionary:
		return {}

	if not result.has("version"):
		if _migrate_v0(result):
			return result
		return {}

	if int(result.get("version", 0)) != 1:
		return {}

	if result.has("checksum") and result.has("game_state"):
		var expected = str(result["checksum"])
		var actual = _compute_checksum(result["game_state"])
		if expected != actual:
			return {}

	return result

func _migrate_v0(data: Dictionary) -> bool:
	if data.has("game_state"):
		return true
	return false

func _try_load_backup(save_name: String) -> Dictionary:
	var backup_path = _save_dir + save_name + ".json.bak"
	if not FileAccess.file_exists(backup_path):
		return {}
	return _read_and_validate(backup_path, save_name + " (backup)")

func _cleanup_file(path: String) -> void:
	if FileAccess.file_exists(path):
		var dir = DirAccess.open(path.get_base_dir())
		if dir:
			dir.remove(path.get_file())

func _ensure_save_dir() -> void:
	if not DirAccess.dir_exists_absolute(_save_dir):
		DirAccess.make_dir_recursive_absolute(_save_dir)

func _on_save_match_ok(data: Dictionary) -> void:
	var save_id = str(data.get("save_id", ""))
	save_completed.emit(save_id)

func _on_load_match_ok(data: Dictionary) -> void:
	load_completed.emit(data)

func _on_load_match_fail(data: Dictionary) -> void:
	load_failed.emit(str(data.get("error", "Unknown error")))
