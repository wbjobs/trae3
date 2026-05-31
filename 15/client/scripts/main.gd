extends Node3D

var _player: CharacterBody3D
var _bus: Node
var _network_client: Node
var _env_simulator: Node
var _env_interaction: Node
var _game_state: Node
var _save_manager: Node
var _resource_loader: Node
var _object_pool: Node
var _performance_monitor: Node
var _jitter_buffer: Node
var _extreme_event_handler: Node
var _hud: CanvasLayer

func _ready() -> void:
	_bus = $EventBus
	_network_client = $NetworkClient
	_env_simulator = $EnvironmentSimulator
	_env_interaction = $EnvironmentInteraction
	_game_state = $GameStateManager
	_save_manager = $SaveManager
	_resource_loader = $ResourceLoader
	_object_pool = $ObjectPool
	_performance_monitor = $PerformanceMonitor
	_jitter_buffer = $JitterBuffer
	_extreme_event_handler = $ExtremeEventHandler
	_hud = $HUD

	_object_pool.initialize(_bus)
	_performance_monitor.initialize(_bus)
	_jitter_buffer.initialize(_bus, _network_client)
	_extreme_event_handler.initialize(_bus, _object_pool)
	_network_client.initialize(_bus, _jitter_buffer)
	_env_simulator.initialize(_bus)
	_env_interaction.initialize(_bus, _env_simulator)
	_game_state.initialize(_bus)
	_save_manager.initialize(_bus)
	_resource_loader.initialize(_bus)

	_object_pool.register_pool("remote_player", "res://scenes/remote_player.tscn", 5)
	_object_pool.register_pool("floating_platform", "res://scenes/floating_platform.tscn", 3)

	_hud.initialize(_network_client, _save_manager, _resource_loader)

	_bus.subscribe("network:connected", _on_network_connected)
	_bus.subscribe("network:disconnected", _on_network_disconnected)
	_bus.subscribe("network:reconnecting", _on_network_reconnecting)
	_bus.subscribe("network:reconnected", _on_network_reconnected)
	_bus.subscribe("network:reconnect_exhausted", _on_reconnect_exhausted)
	_bus.subscribe("network:chat", _on_chat)
	_bus.subscribe("network:latency_updated", _on_latency_updated)
	_bus.subscribe("game:room_joined", _on_room_joined)
	_bus.subscribe("game:player_spawned", _on_player_spawned)
	_bus.subscribe("game:player_despawned", _on_player_despawned)
	_bus.subscribe("game:remote_player_updated", _on_remote_player_updated)
	_bus.subscribe("game:platform_updated", _on_platform_updated)
	_bus.subscribe("game:platforms_synced", _on_platforms_synced)
	_bus.subscribe("game:players_synced", _on_players_synced)
	_bus.subscribe("game:connection_lost", _on_connection_lost)
	_bus.subscribe("game:connection_restored", _on_connection_restored)
	_bus.subscribe("player:state_changed", _on_local_player_state)
	_bus.subscribe("performance:fps_updated", _on_performance_updated)
	_bus.subscribe("extreme:event_started", _on_extreme_event_started)
	_bus.subscribe("extreme:event_ended", _on_extreme_event_ended)

	_spawn_local_player()
	_network_client.connect_to_server("127.0.0.1", 9090)

func _spawn_local_player() -> void:
	var player_scene = load("res://scenes/player.tscn")
	_player = player_scene.instantiate()
	_player.name = "LocalPlayer"
	_player.initialize(_bus)
	add_child(_player)

func _on_network_connected(data: Dictionary) -> void:
	var pid = "player_" + str(randi() % 10000)
	_network_client.send_login(pid, "Player")
	_hud.update_status("Connected")

func _on_network_disconnected(_data = null) -> void:
	_hud.update_status("Disconnected")

func _on_network_reconnecting(data: Dictionary) -> void:
	_hud.update_status("Reconnecting (attempt %d)..." % int(data.get("attempt", 0)))

func _on_network_reconnected(_data = null) -> void:
	_hud.update_status("Reconnected")

func _on_reconnect_exhausted(_data = null) -> void:
	_hud.update_status("Connection lost - max retries")

func _on_room_joined(room_data: Dictionary) -> void:
	if room_data.has("environment"):
		_env_simulator.force_sync(room_data["environment"])
	_hud.update_status("In room: %s" % str(room_data.get("room_id", "")))

func _on_player_spawned(data: Dictionary) -> void:
	_spawn_remote_player(str(data.get("player_id", "")), data)

func _on_player_despawned(data: Dictionary) -> void:
	var pid = str(data.get("player_id", ""))
	var container = get_node_or_null("RemotePlayers")
	if container and container.has_node(pid):
		var player = container.get_node(pid)
		container.remove_child(player)
		_object_pool.return_to_pool("remote_player", player)

func _on_remote_player_updated(data: Dictionary) -> void:
	var pid = str(data.get("player_id", ""))
	var container = get_node_or_null("RemotePlayers")
	if container and container.has_node(pid):
		container.get_node(pid).update_from_server(data)

func _on_platform_updated(data: Dictionary) -> void:
	_update_platform(str(data.get("platform_id", "")), data)

func _on_platforms_synced(platforms_data: Dictionary) -> void:
	for platform_id in platforms_data:
		_update_platform(platform_id, platforms_data[platform_id])

func _on_players_synced(players_data: Dictionary) -> void:
	for pid in players_data:
		_spawn_remote_player(pid, players_data[pid])

func _on_connection_lost() -> void:
	_hud.update_status("Connection lost...")

func _on_connection_restored(_data = null) -> void:
	_hud.update_status("Restoring state...")

func _on_chat(data: Dictionary) -> void:
	_hud.add_chat_message(str(data.get("player_id", "")), str(data.get("message", "")))

func _on_local_player_state(state: Dictionary) -> void:
	_network_client.send_player_update(state)
	_hud.update_bars(float(state.get("health", 100)), float(state.get("energy", 100)))

func _spawn_remote_player(player_id: String, data: Dictionary) -> void:
	var container = get_node_or_null("RemotePlayers")
	if not container:
		container = Node3D.new()
		container.name = "RemotePlayers"
		add_child(container)

	if container.has_node(player_id):
		return

	var pos = Vector3.ZERO
	if data.has("position"):
		var p = data["position"]
		pos = Vector3(float(p.get("x", 0.0)), float(p.get("y", 0.0)), float(p.get("z", 0.0)))

	var remote = _object_pool.borrow("remote_player", pos)
	if remote:
		remote.name = player_id
		remote.set_player_id(player_id)
		if remote.has_method("initialize"):
			remote.initialize(_bus)
		container.add_child(remote)

func _update_platform(platform_id: String, data: Dictionary) -> void:
	var platform = get_node_or_null("Platforms/" + platform_id)
	if not platform:
		_load_platform(platform_id, data)
		return
	if data.has("position"):
		var pos = data["position"]
		platform.position = Vector3(float(pos.get("x", 0.0)), float(pos.get("y", 0.0)), float(pos.get("z", 0.0)))
	if data.has("stability"):
		platform.set_stability(float(data["stability"]))

func _load_platform(platform_id: String, data: Dictionary) -> void:
	var container = get_node_or_null("Platforms")
	if not container:
		container = Node3D.new()
		container.name = "Platforms"
		add_child(container)

	var pos = Vector3.ZERO
	if data.has("position"):
		var p = data["position"]
		pos = Vector3(float(p.get("x", 0.0)), float(p.get("y", 0.0)), float(p.get("z", 0.0)))

	var platform = _object_pool.borrow("floating_platform", pos)
	if platform:
		platform.name = platform_id
		platform.set_platform_id(platform_id)
		if platform.has_method("initialize"):
			platform.initialize(_bus)
		container.add_child(platform)

func _on_latency_updated(data: Dictionary) -> void:
	_hud.update_network_stats(
		float(data.get("latency_ms", 0.0)),
		float(data.get("jitter_ms", 0.0)),
		float(data.get("packet_loss", 0.0))
	)

func _on_performance_updated(data: Dictionary) -> void:
	_hud.update_performance_stats(
		float(data.get("fps", 0.0)),
		float(data.get("avg_fps", 0.0)),
		str(data.get("quality", "medium"))
	)

func _on_extreme_event_started(data: Dictionary) -> void:
	_hud.show_extreme_event_warning(
		str(data.get("event_type", "")),
		float(data.get("intensity", 0.5))
	)

func _on_extreme_event_ended(data: Dictionary) -> void:
	_hud.hide_extreme_event_warning(
		str(data.get("event_type", ""))
	)
