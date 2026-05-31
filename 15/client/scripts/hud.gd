extends CanvasLayer

var _status_label: Label
var _env_label: Label
var _perf_label: Label
var _network_label: Label
var _event_warning_panel: PanelContainer
var _event_warning_label: Label
var _active_events: Dictionary = {}
var _chat_container: VBoxContainer
var _chat_input: LineEdit
var _health_bar: ProgressBar
var _energy_bar: ProgressBar
var _minimap: SubViewportContainer
var _network_client: Node
var _save_manager: Node
var _resource_loader: Node

var _event_names: Dictionary = {
	"magnetic_storm": "磁暴",
	"zero_gravity": "失重",
	"time_distortion": "时空扭曲",
	"meteor_shower": "流星雨",
	"gravity_surge": "重力激增",
	"plasma_cloud": "等离子云",
	"turbulence": "湍流",
	"solar_flare": "太阳耀斑",
}

func _ready() -> void:
	_build_ui()

func initialize(network_client: Node, save_manager: Node, resource_loader: Node) -> void:
	_network_client = network_client
	_save_manager = save_manager
	_resource_loader = resource_loader

func update_status(status: String) -> void:
	if _status_label:
		_status_label.text = "Status: " + status

func update_environment_display(env_data: Dictionary) -> void:
	if _env_label:
		var info = "Weather: %s | Gravity: %.1f | Wind: %.1f | Temp: %.1f | Alt: %.0f"
		_env_label.text = info % [
			str(env_data.get("weather", "clear")),
			float(env_data.get("gravity", 9.8)),
			float(env_data.get("wind_speed", 0.0)),
			float(env_data.get("temperature", 15.0)),
			float(env_data.get("altitude", 2000.0)),
		]

func update_bars(health: float, energy: float) -> void:
	if _health_bar:
		_health_bar.value = health
	if _energy_bar:
		_energy_bar.value = energy

func update_performance_stats(fps: float, avg_fps: float, quality: String) -> void:
	if _perf_label:
		var quality_display = "高" if quality == "high" else ("中" if quality == "medium" else "低")
		_perf_label.text = "FPS: %.0f (avg: %.0f) | 画质: %s" % [fps, avg_fps, quality_display]

func update_network_stats(latency_ms: float, jitter_ms: float, packet_loss: float) -> void:
	if _network_label:
		var loss_color = "red" if packet_loss > 0.05 else ("yellow" if packet_loss > 0.01 else "green")
		_network_label.text = "延迟: %.0fms | 抖动: %.0fms | 丢包: [color=%s]%.1f%%[/color]" % [
			latency_ms, jitter_ms, loss_color, packet_loss * 100.0
		]

func show_extreme_event_warning(event_type: String, intensity: float) -> void:
	_active_events[event_type] = intensity
	_update_event_warning()

func hide_extreme_event_warning(event_type: String) -> void:
	if _active_events.has(event_type):
		_active_events.erase(event_type)
	_update_event_warning()

func _update_event_warning() -> void:
	if _event_warning_label and _event_warning_panel:
		if _active_events.size() == 0:
			_event_warning_panel.visible = false
			return

		var warnings = []
		for event_type in _active_events:
			var name = _event_names.get(event_type, event_type)
			var intensity = float(_active_events[event_type])
			var intensity_pct = int(intensity * 100)
			warnings.append("[b]%s[/b] (强度: %d%%)" % [name, intensity_pct])

		_event_warning_label.bbcode_enabled = true
		_event_warning_label.text = "[color=red][b]⚠ 极端环境警告[/b][/color]\n" + "\n".join(warnings)
		_event_warning_panel.visible = true

func add_chat_message(player_id: String, message: String) -> void:
	if _chat_container:
		var label = RichTextLabel.new()
		label.fit_content = true
		label.bbcode_enabled = true
		label.text = "[color=cyan]%s[/color]: %s" % [player_id, message]
		_chat_container.add_child(label)

func _build_ui() -> void:
	var root = VBoxContainer.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_theme_constant_override("separation", 4)

	_status_label = Label.new()
	_status_label.text = "Status: Disconnected"
	root.add_child(_status_label)

	_env_label = Label.new()
	_env_label.text = "Environment: --"
	root.add_child(_env_label)

	_perf_label = Label.new()
	_perf_label.text = "FPS: -- | 画质: 中"
	root.add_child(_perf_label)

	_network_label = Label.new()
	_network_label.bbcode_enabled = true
	_network_label.text = "延迟: -- | 抖动: -- | 丢包: [color=green]0.0%[/color]"
	root.add_child(_network_label)

	var bars = HBoxContainer.new()
	_health_bar = ProgressBar.new()
	_health_bar.min_value = 0
	_health_bar.max_value = 100
	_health_bar.value = 100
	_health_bar.custom_minimum_size = Vector2(150, 20)
	_health_bar.show_percentage = false
	var hp_label = Label.new()
	hp_label.text = "HP"
	bars.add_child(hp_label)
	bars.add_child(_health_bar)

	_energy_bar = ProgressBar.new()
	_energy_bar.min_value = 0
	_energy_bar.max_value = 100
	_energy_bar.value = 100
	_energy_bar.custom_minimum_size = Vector2(150, 20)
	_energy_bar.show_percentage = false
	var en_label = Label.new()
	en_label.text = "EN"
	bars.add_child(en_label)
	bars.add_child(_energy_bar)
	root.add_child(bars)

	var chat_panel = PanelContainer.new()
	chat_panel.custom_minimum_size = Vector2(0, 150)
	var chat_vbox = VBoxContainer.new()

	_chat_container = VBoxContainer.new()
	_chat_container.size_flags_vertical = Control.SIZE_EXPAND_FILL
	chat_vbox.add_child(_chat_container)

	_chat_input = LineEdit.new()
	_chat_input.placeholder_text = "Press Enter to chat..."
	_chat_input.connect("text_submitted", _on_chat_submitted)
	chat_vbox.add_child(_chat_input)

	chat_panel.add_child(chat_vbox)
	root.add_child(chat_panel)

	var action_bar = HBoxContainer.new()
	var save_btn = Button.new()
	save_btn.text = "Save"
	save_btn.connect("pressed", _on_save_pressed)
	action_bar.add_child(save_btn)

	var load_btn = Button.new()
	load_btn.text = "Load"
	load_btn.connect("pressed", _on_load_pressed)
	action_bar.add_child(load_btn)

	var resources_btn = Button.new()
	resources_btn.text = "Resources"
	resources_btn.connect("pressed", _on_resources_pressed)
	action_bar.add_child(resources_btn)

	root.add_child(action_bar)

	_event_warning_panel = PanelContainer.new()
	_event_warning_panel.custom_minimum_size = Vector2(300, 0)
	_event_warning_panel.visible = false

	var warning_vbox = VBoxContainer.new()
	warning_vbox.add_theme_constant_override("separation", 4)

	var warning_title = Label.new()
	warning_title.text = "⚠ 极端环境警告"
	warning_title.add_theme_color_override("font_color", Color.RED)
	warning_vbox.add_child(warning_title)

	_event_warning_label = Label.new()
	_event_warning_label.bbcode_enabled = true
	_event_warning_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	warning_vbox.add_child(_event_warning_label)

	_event_warning_panel.add_child(warning_vbox)

	var top_right = VBoxContainer.new()
	top_right.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	top_right.add_theme_constant_override("separation", 4)
	top_right.add_child(_event_warning_panel)

	$".add_child"(root)
	$".add_child"(top_right)

func _on_chat_submitted(text: String) -> void:
	if text.strip_edges() == "":
		return
	if _network_client:
		_network_client.send_chat(text)
	_chat_input.text = ""

func _on_save_pressed() -> void:
	if _save_manager:
		_save_manager.save_to_server()

func _on_load_pressed() -> void:
	if _save_manager:
		_save_manager.load_from_server("latest")

func _on_resources_pressed() -> void:
	if _resource_loader:
		_resource_loader.request_resources()
