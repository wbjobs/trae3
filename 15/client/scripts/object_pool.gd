extends Node

var _pools: Dictionary = {}
var _scene_cache: Dictionary = {}
var _max_pool_size: int = 20
var _stats: Dictionary = {}

func _ready() -> void:
	pass

func initialize(bus: Node) -> void:
	bus.subscribe("game:player_despawned", _on_entity_despawned)

func register_pool(pool_key: String, scene_path: String, pre_warm_count: int = 5) -> void:
	if _pools.has(pool_key):
		return

	if not _scene_cache.has(pool_key):
		_scene_cache[pool_key] = load(scene_path)

	_pools[pool_key] = []
	_stats[pool_key] = {
		"borrowed": 0,
		"created": 0,
		"reused": 0,
	}

	for i in pre_warm_count:
		var obj = _create_instance(pool_key)
		if obj:
			obj.visible = false
			obj.set_process(false)
			obj.set_physics_process(false)
			_pools[pool_key].append(obj)

func borrow(pool_key: String, position: Vector3 = Vector3.ZERO, rotation: Vector3 = Vector3.ZERO) -> Node:
	if not _pools.has(pool_key):
		return null

	var pool = _pools[pool_key]

	if pool.size() > 0:
		var obj = pool.pop_back()
		_stats[pool_key]["reused"] += 1
		_stats[pool_key]["borrowed"] += 1
		_reset_object(obj, position, rotation)
		return obj

	var obj = _create_instance(pool_key)
	if obj:
		_stats[pool_key]["created"] += 1
		_stats[pool_key]["borrowed"] += 1
		_reset_object(obj, position, rotation)
		return obj

	return null

func return_to_pool(pool_key: String, obj: Node) -> void:
	if not _pools.has(pool_key):
		obj.queue_free()
		return

	var pool = _pools[pool_key]
	if pool.size() >= _max_pool_size:
		obj.queue_free()
		return

	obj.visible = false
	obj.set_process(false)
	obj.set_physics_process(false)

	if obj.get_parent():
		obj.get_parent().remove_child(obj)

	if obj is Node3D:
		obj.position = Vector3.ZERO
		obj.rotation = Vector3.ZERO
		obj.linear_velocity = Vector3.ZERO
		obj.angular_velocity = Vector3.ZERO

	if obj.has_method("reset"):
		obj.reset()

	pool.append(obj)
	_stats[pool_key]["borrowed"] -= 1

func get_stats() -> Dictionary:
	return _stats.duplicate(true)

func clear_pool(pool_key: String) -> void:
	if not _pools.has(pool_key):
		return

	var pool = _pools[pool_key]
		for obj in pool:
			obj.queue_free()
		_pools.erase(pool_key)
		_stats.erase(pool_key)

func clear_all() -> void:
	for pool_key in _pools:
		clear_pool(pool_key)

func _create_instance(pool_key: String) -> Node:
	var scene = _scene_cache.get(pool_key, null)
	if not scene:
		return null

	if scene is PackedScene:
		return scene.instantiate()

	return null

func _reset_object(obj: Node, position: Vector3, rotation: Vector3) -> void:
	obj.visible = true
	obj.set_process(true)
	obj.set_physics_process(true)

	if obj is Node3D:
		obj.position = position
		obj.rotation = rotation

func _on_entity_despawned(_data: Dictionary) -> void:
	pass
