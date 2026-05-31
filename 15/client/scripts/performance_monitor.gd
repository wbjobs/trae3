extends Node

var _bus: Node
var _fps: float = 0.0
var _avg_fps: float = 0.0
var _frame_time: float = 0.0
var _min_fps: float = 999.0
var _max_fps: float = 0.0
var _frame_count: int = 0
var _sample_window: float = 0.5
var _sample_accum: float = 0.0
var _sample_frames: int = 0
var _quality_level: int = 2
var _target_fps: float = 60.0
var _fps_history: Array = []
var _quality_bounds: Dictionary = {
	"low":    {"min_fps": 25.0, "particles": false, "post_process": false, "lod": 2, "shadow_quality": 0},
	"medium": {"min_fps": 45.0, "particles": true,  "post_process": false, "lod": 1, "shadow_quality": 1},
	"high":   {"min_fps": 55.0, "particles": true,  "post_process": true,  "lod": 0, "shadow_quality": 2},
}
var _current_settings: Dictionary = {}
var _downgrade_cooldown: float = 5.0
var _upgrade_cooldown: float = 10.0
var _last_downgrade: float = 0.0
var _last_upgrade: float = 0.0
var _network_latency: float = 0.0
var _packet_loss: float = 0.0

signal fps_updated(fps: float, avg_fps: float, quality: String)
signal quality_changed(level: int, settings: Dictionary)

func _ready() -> void:
	set_process(false)

func initialize(bus: Node) -> void:
	_bus = bus
	_bus.subscribe("network:latency_updated", _on_latency_updated)
	set_process(true)
	_apply_quality_level(2)

func _process(delta: float) -> void:
	_frame_time = delta
	_fps = 1.0 / maxf(delta, 0.0001)

	_sample_accum += _fps
	_sample_frames += 1
	_frame_count += 1

	if _fps < _min_fps:
		_min_fps = _fps
	if _fps > _max_fps:
		_max_fps = _fps

	_fps_history.append(_fps)
	if _fps_history.size() > 60:
		_fps_history.pop_front()

	_avg_fps = _sample_accum / float(_sample_frames)

	var time = Time.get_ticks_msec() / 1000.0
	_check_auto_adjust(time)
	fps_updated.emit(_fps, _avg_fps, get_quality_name())

func _check_auto_adjust(time: float) -> void:
	var should_downgrade = _avg_fps < 30.0 and _fps < 25.0
	if should_downgrade and (time - _last_downgrade) > _downgrade_cooldown:
		_downgrade()
		_last_downgrade = time
		return

	var should_upgrade = _quality_level < 2 and _avg_fps > 55.0 and _min_fps > 45.0
	if should_upgrade and (time - _last_upgrade) > _upgrade_cooldown:
		_upgrade()
		_last_upgrade = time

func _downgrade() -> void:
	if _quality_level > 0:
		_quality_level -= 1
		_apply_quality_level(_quality_level)

func _upgrade() -> void:
	if _quality_level < 2:
		_quality_level += 1
		_apply_quality_level(_quality_level)

func _apply_quality_level(level: int) -> void:
	var quality_names = ["low", "medium", "high"]
	var name = quality_names[level]
	_current_settings = _quality_bounds[name].duplicate()

	var env = get_viewport().get_world_3d().environment if get_viewport() else null
	if env:
		if _current_settings["shadow_quality"] == 0:
			RenderingServer.rendering_method = RenderingServer.RENDERING_METHOD_COMPATIBILITY
		elif _current_settings["shadow_quality"] == 1:
			RenderingServer.rendering_method = RenderingServer.RENDERING_METHOD_FORWARD_PLUS

	quality_changed.emit(level, _current_settings)
	if _bus:
		_bus.emit("performance:quality_changed", {
			"level": level,
			"settings": _current_settings.duplicate(true),
		})

func get_quality_name() -> String:
	var names = ["low", "medium", "high"]
	return names[clampi(_quality_level, 0, 2)]

func get_fps() -> float:
	return _fps

func get_avg_fps() -> float:
	return _avg_fps

func get_stats() -> Dictionary:
	var sum: float = 0.0
	var sum_sq: float = 0.0
	for fps in _fps_history:
		sum += float(fps)
		sum_sq += float(fps) * float(fps)
	var variance: float = 0.0
	if _fps_history.size() > 0:
		var mean = sum / float(_fps_history.size())
		variance = sum_sq / float(_fps_history.size()) - mean * mean

	return {
		"fps": _fps,
		"avg_fps": _avg_fps,
		"min_fps": _min_fps,
		"max_fps": _max_fps,
		"frame_time_ms": _frame_time * 1000.0,
		"quality": get_quality_name(),
		"quality_level": _quality_level,
		"fps_variance": variance,
		"network_latency_ms": _network_latency,
		"packet_loss": _packet_loss,
	}

func set_quality_manual(level: int) -> void:
	_quality_level = clampi(level, 0, 2)
	_apply_quality_level(_quality_level)

func reset_stats() -> void:
	_min_fps = 999.0
	_max_fps = 0.0
	_frame_count = 0
	_sample_accum = 0.0
	_sample_frames = 0
	_fps_history.clear()

func _on_latency_updated(data: Dictionary) -> void:
	_network_latency = float(data.get("latency_ms", 0.0))
	_packet_loss = float(data.get("packet_loss", 0.0))
