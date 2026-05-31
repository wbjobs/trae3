extends Node

var _bus: Node
var _current_events: Dictionary = {}
var _event_effects: Dictionary = {}
var _screen_effect: CanvasLayer
var _particles_pool: Node
var _screen_shake_intensity: float = 0.0
var _time_scale: float = 1.0

signal event_started(event_type: String, intensity: float)
signal event_ended(event_type: String)

func _ready() -> void:
	_setup_screen_effects()
	set_process(true)

func initialize(bus: Node, particles_pool: Node) -> void:
	_bus = bus
	_particles_pool = particles_pool
	_bus.subscribe("network:extreme_event", _on_extreme_event)

func _process(delta: float) -> void:
	_update_active_events(delta)
	_apply_time_distortion(delta)
	_update_screen_effects(delta)

func _on_extreme_event(data: Dictionary) -> void:
	if data.has("event") and data.has("is_start"):
		var event = data["event"]
		var is_start = bool(data["is_start"])
		var event_type = str(event.get("type", ""))

		if is_start:
			_start_event(event)
		else:
			_end_event(event_type)

func _start_event(event: Dictionary) -> void:
	var event_type = str(event.get("type", ""))
	var intensity = float(event.get("intensity", 0.5))
	var duration = int(event.get("duration_ms", 10000))

	_current_events[event_type] = {
		"event": event,
		"start_time": Time.get_ticks_msec(),
		"duration": duration,
	}

	_apply_event_effects(event_type, intensity)
	event_started.emit(event_type, intensity)

func _end_event(event_type: String) -> void:
	if _current_events.has(event_type):
		_current_events.erase(event_type)
		_remove_event_effects(event_type)
		event_ended.emit(event_type)
		if _bus:
			_bus.emit("extreme:event_ended", {
				"event_type": event_type,
			})

func _update_active_events(delta: float) -> void:
	var now = Time.get_ticks_msec()
	var to_remove = []

	for event_type in _current_events:
		var data = _current_events[event_type]
		var start_time = int(data.get("start_time", 0))
		var duration = int(data.get("duration", 0))

		if now - start_time >= duration:
			to_remove.append(event_type)

	for t in to_remove:
		_end_event(t)

func _apply_event_effects(event_type: String, intensity: float) -> void:
	match event_type:
		"magnetic_storm":
			_screen_shake_intensity = intensity * 0.5
			_event_effects["magnetic_storm"] = {"screen_shake": _screen_shake_intensity, "post_process": true}
		"zero_gravity":
			_event_effects["zero_gravity"] = {"gravity_mult": 0.1}
		"time_distortion":
			_time_scale = 0.5 + intensity * 0.5
			_event_effects["time_distortion"] = {"time_scale": _time_scale}
		"meteor_shower":
			_screen_shake_intensity = intensity * 0.8
			_event_effects["meteor_shower"] = {"screen_shake": _screen_shake_intensity}
		"gravity_surge":
			_event_effects["gravity_surge"] = {"gravity_mult": 2.0}
		"plasma_cloud":
			_event_effects["plasma_cloud"] = {"fog": true, "particle_overlay": true}
		"turbulence":
			_screen_shake_intensity = intensity * 0.3
			_event_effects["turbulence"] = {"screen_shake": _screen_shake_intensity, "wind_chaos": true}
		"solar_flare":
			_event_effects["solar_flare"] = {"bloom_intensity": intensity * 2.0}

func _remove_event_effects(event_type: String) -> void:
	_event_effects.erase(event_type)
	_time_scale = 1.0
	_screen_shake_intensity = 0.0

func _apply_time_distortion(_delta: float) -> void:
	if _time_scale != 1.0:
		Engine.time_scale = _time_scale

func _update_screen_effects(delta: float) -> void:
	if _screen_shake_intensity > 0.001:
		var offset = Vector2(randf_range(-1, 1), randf_range(-1, 1)) * _screen_shake_intensity * 20.0
		get_viewport().canvas_transform.origin = offset
	else:
		get_viewport().canvas_transform.origin = Vector2.ZERO

func _setup_screen_effects() -> void:
	_screen_effect = CanvasLayer.new()
	_screen_effect.name = "ExtremeEventEffects"
	_screen_effect.layer = 100
	add_child(_screen_effect)

func get_active_events() -> Dictionary:
	return _current_events.duplicate(true)

func has_event(event_type: String) -> bool:
	return _current_events.has(event_type)

func get_effect(effect_name: String) -> float:
	if _event_effects.has(effect_name):
		return float(_event_effects[effect_name].get(effect_name, 0.0))
	return 0.0

func get_screen_shake_intensity() -> float:
	return _screen_shake_intensity

func get_time_scale() -> float:
	return _time_scale

func reset() -> void:
	_current_events.clear()
	_event_effects.clear()
	_screen_shake_intensity = 0.0
	_time_scale = 1.0
	Engine.time_scale = 1.0
	get_viewport().canvas_transform.origin = Vector2.ZERO
