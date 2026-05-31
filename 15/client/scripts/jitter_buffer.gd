extends Node

var _bus: Node
var _network_client: Node
var _jitter_buffer: Array = []
var _buffer_size: int = 3
var _max_buffer_size: int = 10
var _latency_samples: Array = []
var _latency_avg: float = 0.0
var _latency_jitter: float = 0.0
var _packet_count: int = 0
var _packet_drops: int = 0
var _send_rate: float = 0.05
var _min_send_rate: float = 0.1
var _max_send_rate: float = 0.016
var _last_send_time: int = 0
var _seq_received: int = 0
var _seq_expected: int = 0
var _adaptive_rate_enabled: bool = true
var _quality_monitor_timer: Timer

func _ready() -> void:
	_quality_monitor_timer = Timer.new()
	_quality_monitor_timer.wait_time = 1.0
	_quality_monitor_timer.connect("timeout", _on_monitor_quality)
	add_child(_quality_monitor_timer)
	_quality_monitor_timer.start()

func initialize(bus: Node, network_client: Node) -> void:
	_bus = bus
	_network_client = network_client
	_bus.subscribe("network:connected", _on_connected)
	_bus.subscribe("network:disconnected", _on_disconnected)

func _process(delta: float) -> void:
	pass

func buffer_packet(seq: int, msg_type: uint8, payload: Dictionary) -> Dictionary:
	_seq_received = seq
	if seq > _seq_expected:
		_packet_drops += seq - _seq_expected
	_seq_expected = seq + 1

	_jitter_buffer.append({"seq": seq, "type": msg_type, "payload": payload, "time": Time.get_ticks_msec()})

	_jitter_buffer.sort_custom(_compare_seq)

	while _jitter_buffer.size() > _max_buffer_size:
		_jitter_buffer.pop_front()

	if _jitter_buffer.size() >= _buffer_size:
		var pkt = _jitter_buffer.pop_front()
		_process_packet(pkt)

	return payload

func has_buffered() -> bool:
	return _jitter_buffer.size() > 0

func drain_buffer() -> Array:
	var result = _jitter_buffer.duplicate()
	_jitter_buffer.clear()
	return result

func record_latency(latency_ms: float) -> void:
	_latency_samples.append(latency_ms)
	if _latency_samples.size() > 30:
		_latency_samples.pop_front()

	_latency_avg = 0.0
	for s in _latency_samples:
		_latency_avg += float(s)
	_latency_avg /= float(maxi(_latency_samples.size(), 1))

	if _latency_samples.size() > 1:
		_latency_jitter = 0.0
		for i in range(_latency_samples.size() - 1):
			_latency_jitter += abs(float(_latency_samples[i + 1]) - float(_latency_samples[i]))
		_latency_jitter /= float(_latency_samples.size() - 1)

	if _adaptive_rate_enabled:
		_adjust_send_rate()

	_bus.emit("network:latency_updated", {
		"latency_ms": _latency_avg,
		"jitter_ms": _latency_jitter,
		"packet_loss": get_packet_loss_rate(),
	})

func _adjust_send_rate() -> void:
	var target_rate = _send_rate

	if _latency_jitter > 100.0:
		target_rate = _min_send_rate
	elif _latency_avg > 200.0:
		target_rate = 0.08
	elif _latency_avg > 100.0:
		target_rate = 0.06
	else:
		target_rate = _max_send_rate

	_send_rate = lerpf(_send_rate, target_rate, 0.2)

	if _network_client and _network_client.has_method("set_send_rate"):
		_network_client.set_send_rate(_send_rate)

func _on_monitor_quality() -> void:
	_packet_count += 1

	if _packet_count % 5 == 0:
		_adjust_buffer_size()

func _adjust_buffer_size() -> void:
	if _latency_jitter > 150.0:
		_buffer_size = clampi(_buffer_size + 1, 1, _max_buffer_size)
	elif _latency_jitter < 30.0:
		_buffer_size = clampi(_buffer_size - 1, 1, _max_buffer_size)

func get_packet_loss_rate() -> float:
	if _seq_received == 0:
		return 0.0
	return float(_packet_drops) / float(maxf(_packet_drops + _seq_received))

func get_stats() -> Dictionary:
	return {
		"latency_avg_ms": _latency_avg,
		"jitter_ms": _latency_jitter,
		"packet_loss_rate": get_packet_loss_rate(),
		"buffer_size": _jitter_buffer.size(),
		"send_rate_hz": 1.0 / _send_rate,
		"adaptive_enabled": _adaptive_rate_enabled,
	}

func reset() -> void:
	_jitter_buffer.clear()
	_latency_samples.clear()
	_latency_avg = 0.0
	_latency_jitter = 0.0
	_packet_count = 0
	_packet_drops = 0
	_seq_received = 0
	_seq_expected = 0
	_send_rate = 0.05

func _process_packet(pkt: Dictionary) -> void:
	var msg_type_str = pkt["type"]
	var payload = pkt["payload"]

	_network_client._dispatch_packet({"type": msg_type_str, "payload": payload})

func _compare_seq(a: Dictionary, b: Dictionary) -> bool:
	return a["seq"] < b["seq"]

func _on_connected(_data: Dictionary) -> void:
	reset()

func _on_disconnected(_data: Dictionary) -> void:
	_jitter_buffer.clear()

func set_buffer_size(size: int) -> void:
	_buffer_size = clampi(size, 1, _max_buffer_size)

func set_adaptive_rate(enabled: bool) -> void:
	_adaptive_rate_enabled = enabled
