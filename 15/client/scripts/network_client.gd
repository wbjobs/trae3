extends Node

enum ConnectionState {
	DISCONNECTED,
	CONNECTING,
	CONNECTED,
	LOGGING_IN,
	RECONNECTING,
}

enum PacketField {
	ENV_WEATHER = 1,
	ENV_WINDSPEED = 2,
	ENV_WINDDIR = 4,
	ENV_GRAVITY = 8,
	ENV_TEMP = 16,
	ENV_VISIBILITY = 32,
	ENV_PRESSURE = 64,
	ENV_CLOUD = 128,
	ENV_LIGHTNING = 256,
	ENV_AURORA = 512,
	ENV_TIME = 1024,
	ENV_ALTITUDE = 2048,
	ENV_TICK = 4096,
	ENV_SEQ = 8192,
	ENV_SNAPSHOT_TS = 16384,
	PLAYER_POS_X = 1,
	PLAYER_POS_Y = 2,
	PLAYER_POS_Z = 4,
	PLAYER_VEL_X = 8,
	PLAYER_VEL_Y = 16,
	PLAYER_VEL_Z = 32,
	PLAYER_HP = 64,
	PLAYER_EN = 128,
	PLAYER_FLY = 256,
	PLAYER_ROT_Y = 512,
	PLATFORM_POS_X = 1,
	PLATFORM_POS_Y = 2,
	PLATFORM_POS_Z = 4,
	PLATFORM_STAB = 8,
	PLATFORM_ANCH = 16,
}

var _state: int = ConnectionState.DISCONNECTED
var _tcp_client: StreamPeerTCP = StreamPeerTCP.new()
var _host: String = ""
var _port: int = 0
var _bus: Node
var _jitter_buffer: Node
var _use_binary_protocol: bool = true

var _reconnect_timer: Timer
var _heartbeat_timer: Timer
var _send_rate_timer: Timer
var _connect_timeout_timer: Timer
var _latency_timer: Timer

var _reconnect_attempt: int = 0
var _reconnect_base_delay: float = 1.0
var _reconnect_max_delay: float = 30.0
var _max_reconnect_attempts: int = -1

var _pending_player_state: Dictionary = {}
var _send_buffer: Array = []
var _max_buffer_size: int = 200
var _send_rate: float = 0.05

var _last_heartbeat_ack: int = 0
var _heartbeat_miss_count: int = 0
var _max_heartbeat_miss: int = 3
var _heartbeat_start_time: int = 0

var player_id: String = ""
var connection_id: String = ""
var room_id: String = ""
var player_name: String = ""
var _server_seq: int = 0

func _ready() -> void:
	_reconnect_timer = Timer.new()
	_reconnect_timer.one_shot = true
	_reconnect_timer.connect("timeout", _attempt_reconnect)
	add_child(_reconnect_timer)

	_heartbeat_timer = Timer.new()
	_heartbeat_timer.wait_time = 3.0
	_heartbeat_timer.connect("timeout", _send_heartbeat)
	add_child(_heartbeat_timer)

	_send_rate_timer = Timer.new()
	_send_rate_timer.wait_time = 0.05
	_send_rate_timer.connect("timeout", _flush_pending_state)
	add_child(_send_rate_timer)

	_connect_timeout_timer = Timer.new()
	_connect_timeout_timer.one_shot = true
	_connect_timeout_timer.wait_time = 10.0
	_connect_timeout_timer.connect("timeout", _on_connect_timeout)
	add_child(_connect_timeout_timer)

	_latency_timer = Timer.new()
	_latency_timer.wait_time = 1.0
	_latency_timer.connect("timeout", _on_latency_timer)
	add_child(_latency_timer)

func initialize(bus: Node, jitter_buffer: Node = null) -> void:
	_bus = bus
	if jitter_buffer:
		_jitter_buffer = jitter_buffer
	else:
		_jitter_buffer = JitterBuffer.new()
		add_child(_jitter_buffer)
	_jitter_buffer.initialize(_bus, self)

func _physics_process(_delta: float) -> void:
	if _state == ConnectionState.DISCONNECTED:
		return

	_tcp_client.poll()
	var status = _tcp_client.get_status()

	match status:
		StreamPeerTCP.STATUS_CONNECTED:
			_read_packets()
		StreamPeerTCP.STATUS_ERROR, StreamPeerTCP.STATUS_NONE:
			_handle_unexpected_disconnect()
		StreamPeerTCP.STATUS_CONNECTING:
			pass

func connect_to_server(host: String, port: int) -> void:
	_host = host
	_port = port
	_reconnect_attempt = 0
	_state = ConnectionState.CONNECTING
	_tcp_client = StreamPeerTCP.new()
	var err = _tcp_client.connect_to_host(host, port)
	if err != OK:
		_bus.emit("network:connection_error", {"message": "Failed to connect: " + str(err)})
		_schedule_reconnect()
		return
	_connect_timeout_timer.start()

func disconnect_from_server() -> void:
	_state = ConnectionState.DISCONNECTED
	_stop_all_timers()
	_tcp_client.disconnect_from_host()
	_send_buffer.clear()
	_jitter_buffer.reset()
	_bus.emit("network:disconnected")

func get_connection_state() -> int:
	return _state

func is_connected_to_server() -> bool:
	return _state == ConnectionState.CONNECTED

func set_send_rate(rate: float) -> void:
	_send_rate = rate
	_send_rate_timer.wait_time = _send_rate

func send_login(pid: String, name: String) -> void:
	player_name = name
	player_id = pid
	_state = ConnectionState.LOGGING_IN
	_send_packet("login", {"player_id": pid, "name": name})

func send_join_room(rid: String, room_name: String) -> void:
	room_id = rid
	_send_packet("join_room", {"room_id": rid, "name": room_name})

func send_leave_room() -> void:
	_send_packet("leave_room", {})
	room_id = ""

func send_player_update(state: Dictionary) -> void:
	_pending_player_state = state

func send_platform_interact(platform_id: String, action: String, params: Dictionary = {}) -> void:
	_send_packet("platform_interact", {"platform_id": platform_id, "action": action, "params": params})

func send_chat(message: String) -> void:
	_buffer_or_send("chat", {"message": message})

func send_save_match() -> void:
	_send_packet("save_match", {})

func send_load_match(save_id: String) -> void:
	_send_packet("load_match", {"save_id": save_id})

func send_request_resources(category: String = "") -> void:
	_send_packet("request_resources", {"category": category})

func _read_packets() -> void:
	while _tcp_client.get_available_bytes() >= 16:
		var header = _tcp_client.get_data(16)
		if header[0] != OK:
			return
		var hb = header[1]

		var seq = hb[0] << 24 | hb[1] << 16 | hb[2] << 8 | hb[3]
		var msg_type = hb[4]
		var flags = hb[5]
		var field_mask = hb[6] << 56 | hb[7] << 48 | hb[8] << 40 | hb[9] << 32 | hb[10] << 24 | hb[11] << 16 | hb[12] << 8 | hb[13]
		var payload_size = hb[14] << 8 | hb[15]

		if payload_size > 0:
			if _tcp_client.get_available_bytes() < payload_size:
				return
			var body = _tcp_client.get_data(payload_size)
			if body[0] != OK:
				return
			var data = body[1]
			_process_binary_packet(seq, msg_type, flags, field_mask, data)
		else:
			_process_binary_packet(seq, msg_type, flags, field_mask, PackedByteArray())

func _process_binary_packet(seq: int, msg_type: int, flags: int, field_mask: int, data: PackedByteArray) -> void:
	if seq > _server_seq:
		_server_seq = seq

	var msg_name = _msg_type_to_name(msg_type)

	if msg_type == 21:
		_heartbeat_miss_count = 0
		_last_heartbeat_ack = Time.get_ticks_msec()
		var latency = _last_heartbeat_ack - _heartbeat_start_time
		_jitter_buffer.record_latency(latency)
		return

	var payload: Dictionary
	if data.size() > 0:
		payload = _decode_binary(data, field_mask, msg_type)
	else:
		payload = {}

	if _jitter_buffer:
		_jitter_buffer.buffer_packet(seq, msg_type, payload)

	_dispatch_packet({"type": msg_name, "payload": payload})

func _msg_type_to_name(msg_type: int) -> String:
	match msg_type:
		1: return "login"
		2: return "login_ok"
		3: return "join_room"
		4: return "leave_room"
		5: return "room_state"
		6: return "player_joined"
		7: return "player_left"
		8: return "player_update"
		9: return "env_update"
		10: return "platform_updated"
		11: return "platform_interact"
		12: return "chat"
		13: return "save_match"
		14: return "load_match"
		15: return "save_match_ok"
		16: return "load_match_ok"
		17: return "load_match_fail"
		18: return "request_resources"
		19: return "resources_list"
		20: return "heartbeat"
		21: return "heartbeat_ack"
		22: return "extreme_event"
		23: return "ack"
		_: return "unknown"

func _name_to_msg_type(name: String) -> int:
	match name:
		"login": return 1
		"login_ok": return 2
		"join_room": return 3
		"leave_room": return 4
		"room_state": return 5
		"player_joined": return 6
		"player_left": return 7
		"player_update": return 8
		"env_update": return 9
		"platform_updated": return 10
		"platform_interact": return 11
		"chat": return 12
		"save_match": return 13
		"load_match": return 14
		"save_match_ok": return 15
		"load_match_ok": return 16
		"load_match_fail": return 17
		"request_resources": return 18
		"resources_list": return 19
		"heartbeat": return 20
		"heartbeat_ack": return 21
		"extreme_event": return 22
		_: return 0

func _decode_binary(data: PackedByteArray, field_mask: int, msg_type: int) -> Dictionary:
	if msg_type == 9:
		return _decode_env_delta(data, field_mask)
	elif msg_type == 8:
		return _decode_player_delta(data, field_mask)
	elif msg_type == 10:
		return _decode_platform_delta(data, field_mask)
	else:
		var str = data.get_string_from_utf8()
		var json = JSON.new()
		if json.parse(str) == OK:
			return json.data
	return {}

func _decode_env_delta(data: PackedByteArray, field_mask: int) -> Dictionary:
	var result = {}
	var offset = 0
	var view = StreamPeerBuffer.new()
	view.data_array = data

	if field_mask & PacketField.ENV_WEATHER:
		result["weather"] = _decode_string(view)
	if field_mask & PacketField.ENV_WINDSPEED:
		result["wind_speed"] = view.get_float()
	if field_mask & PacketField.ENV_WINDDIR:
		result["wind_direction"] = view.get_float()
	if field_mask & PacketField.ENV_GRAVITY:
		result["gravity"] = view.get_float()
	if field_mask & PacketField.ENV_TEMP:
		result["temperature"] = view.get_float()
	if field_mask & PacketField.ENV_VISIBILITY:
		result["visibility"] = view.get_float()
	if field_mask & PacketField.ENV_PRESSURE:
		result["atmospheric_pressure"] = view.get_float()
	if field_mask & PacketField.ENV_CLOUD:
		result["cloud_density"] = view.get_float()
	if field_mask & PacketField.ENV_LIGHTNING:
		result["lightning_intensity"] = view.get_float()
	if field_mask & PacketField.ENV_AURORA:
		result["aurora_intensity"] = view.get_float()
	if field_mask & PacketField.ENV_TIME:
		result["time_of_day"] = view.get_float()
	if field_mask & PacketField.ENV_ALTITUDE:
		result["altitude"] = view.get_float()
	if field_mask & PacketField.ENV_TICK:
		result["tick"] = view.get_u64()
	if field_mask & PacketField.ENV_SEQ:
		result["seq"] = view.get_u64()
	if field_mask & PacketField.ENV_SNAPSHOT_TS:
		result["snapshot_ts"] = view.get_u64()

	return result

func _decode_player_delta(data: PackedByteArray, field_mask: int) -> Dictionary:
	var result = {}
	var view = StreamPeerBuffer.new()
	view.data_array = data

	result["player_id"] = _decode_string(view)

	if field_mask & PacketField.PLAYER_POS_X:
		result["px"] = view.get_float()
	if field_mask & PacketField.PLAYER_POS_Y:
		result["py"] = view.get_float()
	if field_mask & PacketField.PLAYER_POS_Z:
		result["pz"] = view.get_float()
	if field_mask & PacketField.PLAYER_VEL_X:
		result["vx"] = view.get_float()
	if field_mask & PacketField.PLAYER_VEL_Y:
		result["vy"] = view.get_float()
	if field_mask & PacketField.PLAYER_VEL_Z:
		result["vz"] = view.get_float()
	if field_mask & PacketField.PLAYER_HP:
		result["hp"] = view.get_float()
	if field_mask & PacketField.PLAYER_EN:
		result["en"] = view.get_float()
	if field_mask & PacketField.PLAYER_FLY:
		result["fly"] = view.get_u8() != 0
	if field_mask & PacketField.PLAYER_ROT_Y:
		result["ry"] = view.get_float()

	return _expand_player_fields(result)

func _expand_player_fields(compact: Dictionary) -> Dictionary:
	var result = {}
	if compact.has("player_id"):
		result["player_id"] = compact["player_id"]

	if compact.has("px") or compact.has("py") or compact.has("pz"):
		result["position"] = {
			"x": compact.get("px", 0.0),
			"y": compact.get("py", 0.0),
			"z": compact.get("pz", 0.0),
		}
	if compact.has("vx") or compact.has("vy") or compact.has("vz"):
		result["velocity"] = {
			"x": compact.get("vx", 0.0),
			"y": compact.get("vy", 0.0),
			"z": compact.get("vz", 0.0),
		}
	if compact.has("hp"):
		result["health"] = compact["hp"]
	if compact.has("en"):
		result["energy"] = compact["en"]
	if compact.has("fly"):
		result["is_flying"] = compact["fly"]
	if compact.has("ry"):
		result["rotation"] = {"y": compact["ry"]}

	return result

func _decode_platform_delta(data: PackedByteArray, field_mask: int) -> Dictionary:
	var result = {}
	var view = StreamPeerBuffer.new()
	view.data_array = data

	result["platform_id"] = _decode_string(view)

	if field_mask & PacketField.PLATFORM_POS_X:
		result["px"] = view.get_float()
	if field_mask & PacketField.PLATFORM_POS_Y:
		result["py"] = view.get_float()
	if field_mask & PacketField.PLATFORM_POS_Z:
		result["pz"] = view.get_float()
	if field_mask & PacketField.PLATFORM_STAB:
		result["stab"] = view.get_float()
	if field_mask & PacketField.PLATFORM_ANCH:
		result["anch"] = view.get_u8() != 0

	return _expand_platform_fields(result)

func _expand_platform_fields(compact: Dictionary) -> Dictionary:
	var result = {}
	if compact.has("platform_id"):
		result["platform_id"] = compact["platform_id"]
	if compact.has("px") or compact.has("py") or compact.has("pz"):
		result["position"] = {
			"x": compact.get("px", 0.0),
			"y": compact.get("py", 0.0),
			"z": compact.get("pz", 0.0),
		}
	if compact.has("stab"):
		result["stability"] = compact["stab"]
	if compact.has("anch"):
		result["is_anchored"] = compact["anch"]
	return result

func _decode_string(view: StreamPeerBuffer) -> String:
	var len = view.get_u32()
	var bytes = view.get_data(len)
	if bytes.size() > 0:
		return bytes.get_string_from_utf8()
	return ""

func _dispatch_packet(pkt: Dictionary) -> void:
	var msg_type = str(pkt.get("type", ""))
	var payload = pkt.get("payload", {})

	if msg_type == "heartbeat_ack":
		_heartbeat_miss_count = 0
		_last_heartbeat_ack = Time.get_ticks_msec()
		return

	match msg_type:
		"login_ok":
			_handle_login_ok(payload)
		"room_state":
			_bus.emit("network:room_state", payload)
		"player_joined":
			_bus.emit("network:player_joined", payload)
		"player_left":
			_bus.emit("network:player_left", payload)
		"player_updated", "player_update":
			_bus.emit("network:player_updated", payload)
		"env_update":
			_bus.emit("network:env_update", payload)
		"platform_updated":
			_bus.emit("network:platform_updated", payload)
		"chat":
			_bus.emit("network:chat", payload)
		"save_match_ok":
			_bus.emit("network:save_match_ok", payload)
		"load_match_ok":
			_bus.emit("network:load_match_ok", payload)
		"load_match_fail":
			_bus.emit("network:load_match_fail", payload)
		"resources_list":
			_bus.emit("network:resources_list", payload)
		"extreme_event":
			_bus.emit("network:extreme_event", payload)

func _handle_login_ok(payload) -> void:
	if payload is Dictionary:
		connection_id = str(payload.get("connection_id", ""))
		player_id = str(payload.get("player_id", ""))
		_use_binary_protocol = str(payload.get("binary", "false")) == "true"
	_state = ConnectionState.CONNECTED
	_connect_timeout_timer.stop()
	_heartbeat_timer.start()
	_send_rate_timer.start()
	_latency_timer.start()
	_heartbeat_miss_count = 0
	_last_heartbeat_ack = Time.get_ticks_msec()

	if _reconnect_attempt > 0:
		_bus.emit("network:reconnected", {"player_id": player_id})
		_perform_full_resync()
	else:
		_bus.emit("network:connected", {"player_id": player_id})

	_flush_send_buffer()
	_reconnect_attempt = 0

func _perform_full_resync() -> void:
	if player_id != "":
		_send_packet("login", {"player_id": player_id, "name": player_name})
	if room_id != "":
		_send_packet("join_room", {"room_id": room_id, "name": player_name})

func _flush_pending_state() -> void:
	if _pending_player_state.is_empty():
		return
	_send_packet("player_update", _pending_player_state)
	_pending_player_state = {}

func _send_packet(msg_type: String, payload: Dictionary) -> void:
	if _tcp_client.get_status() != StreamPeerTCP.STATUS_CONNECTED:
		return

	var json_str = JSON.stringify(payload)
	var data = json_str.to_utf8_buffer()

	var header = PackedByteArray()
	header.resize(16)
	header.encode_u32(0, _server_seq)
	header[4] = _name_to_msg_type(msg_type)
	header[5] = 0
	header.encode_u64(6, 0)
	header.encode_u16(14, data.size())

	_tcp_client.put_data(header)
	_tcp_client.put_data(data)

func _buffer_or_send(msg_type: String, payload: Dictionary) -> void:
	if _state == ConnectionState.CONNECTED:
		_send_packet(msg_type, payload)
	else:
		if _send_buffer.size() >= _max_buffer_size:
			_send_buffer.pop_front()
		_send_buffer.append({"type": msg_type, "payload": payload})

func _flush_send_buffer() -> void:
	for item in _send_buffer:
		_send_packet(item["type"], item["payload"])
	_send_buffer.clear()

func _send_heartbeat() -> void:
	if _state != ConnectionState.CONNECTED:
		return
	_heartbeat_miss_count += 1
	_heartbeat_start_time = Time.get_ticks_msec()
	if _heartbeat_miss_count > _max_heartbeat_miss:
		_handle_unexpected_disconnect()
		return
	_send_packet("heartbeat", {})

func _on_latency_timer() -> void:
	pass

func _handle_unexpected_disconnect() -> void:
	if _state == ConnectionState.DISCONNECTED:
		return
	_state = ConnectionState.DISCONNECTED
	_stop_all_timers()
	_bus.emit("network:disconnected")
	_schedule_reconnect()

func _on_connect_timeout() -> void:
	if _state == ConnectionState.CONNECTING or _state == ConnectionState.RECONNECTING:
		_tcp_client.disconnect_from_host()
		_state = ConnectionState.DISCONNECTED
		_bus.emit("network:connection_error", {"message": "Connection timeout"})
		_schedule_reconnect()

func _schedule_reconnect() -> void:
	if _host == "" or _port <= 0:
		return
	if _max_reconnect_attempts >= 0 and _reconnect_attempt >= _max_reconnect_attempts:
		_bus.emit("network:reconnect_exhausted")
		return

	_state = ConnectionState.RECONNECTING
	var delay = minf(_reconnect_base_delay * pow(2.0, float(_reconnect_attempt)), _reconnect_max_delay)
	delay *= randf_range(0.8, 1.2)
	_reconnect_attempt += 1

	_reconnect_timer.wait_time = delay
	_reconnect_timer.start()
	_bus.emit("network:reconnecting", {"attempt": _reconnect_attempt, "delay": delay})

func _attempt_reconnect() -> void:
	if _state != ConnectionState.RECONNECTING:
		return
	_tcp_client = StreamPeerTCP.new()
	var err = _tcp_client.connect_to_host(_host, _port)
	if err != OK:
		_schedule_reconnect()
		return
	_connect_timeout_timer.start()

func _stop_all_timers() -> void:
	_heartbeat_timer.stop()
	_send_rate_timer.stop()
	_connect_timeout_timer.stop()
	_latency_timer.stop()
