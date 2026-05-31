extends Node

var _bus: Node
var _loaded_resources: Dictionary = {}
var _loading_queue: Array = []
var _is_loading: bool = false

signal resource_loaded(resource_id: String, resource: Resource)
signal load_progress(resource_id: String, progress: float)
signal load_complete
signal load_error(resource_id: String, error: String)

func _ready() -> void:
	set_process(false)

func initialize(bus: Node) -> void:
	_bus = bus
	_bus.subscribe("network:resources_list", _on_resources_list_received)
	set_process(true)

func request_resources(category: String = "") -> void:
	_bus.emit("network:send_request_resources", {"category": category})

func load_resource(resource_id: String, resource_path: String) -> void:
	if _loaded_resources.has(resource_id):
		resource_loaded.emit(resource_id, _loaded_resources[resource_id])
		return

	_loading_queue.append({"id": resource_id, "path": resource_path})
	if not _is_loading:
		_process_queue()

func load_scene(resource_id: String, resource_path: String) -> PackedScene:
	if _loaded_resources.has(resource_id):
		return _loaded_resources[resource_id]

	if ResourceLoader.exists(resource_path):
		var resource = ResourceLoader.load(resource_path)
		if resource:
			_loaded_resources[resource_id] = resource
			resource_loaded.emit(resource_id, resource)
			return resource

	load_error.emit(resource_id, "Resource not found: " + resource_path)
	return null

func load_scene_async(resource_id: String, resource_path: String) -> void:
	if _loaded_resources.has(resource_id):
		resource_loaded.emit(resource_id, _loaded_resources[resource_id])
		return

	if not ResourceLoader.exists(resource_path):
		load_error.emit(resource_id, "Resource not found: " + resource_path)
		return

	var err = ResourceLoader.load_threaded_request(resource_path)
	if err != OK:
		load_error.emit(resource_id, "Failed to start loading: " + resource_path)
		return

	_loading_queue.append({"id": resource_id, "path": resource_path, "async": true})
	if not _is_loading:
		_process_queue()

func instantiate_scene(resource_id: String) -> Node:
	if not _loaded_resources.has(resource_id):
		return null

	var resource = _loaded_resources[resource_id]
	if resource is PackedScene:
		return resource.instantiate()
	return null

func is_resource_loaded(resource_id: String) -> bool:
	return _loaded_resources.has(resource_id)

func get_loaded_resource(resource_id: String) -> Resource:
	return _loaded_resources.get(resource_id, null)

func unload_resource(resource_id: String) -> void:
	_loaded_resources.erase(resource_id)

func clear_cache() -> void:
	_loaded_resources.clear()

func _process(_delta: float) -> void:
	_check_async_loads()

func _process_queue() -> void:
	if _loading_queue.is_empty():
		_is_loading = false
		load_complete.emit()
		return

	_is_loading = true
	var item = _loading_queue[0]

	if item.get("async", false):
		_check_async_loads()
		return

	var resource = load(item["path"])
	if resource:
		_loaded_resources[item["id"]] = resource
		resource_loaded.emit(item["id"], resource)
	else:
		load_error.emit(item["id"], "Failed to load: " + item["path"])

	_loading_queue.pop_front()
	_process_queue()

func _check_async_loads() -> void:
	var to_remove = []

	for i in range(_loading_queue.size()):
		var item = _loading_queue[i]
		if not item.get("async", false):
			continue

		var status = ResourceLoader.load_threaded_get_status(item["path"])
		match status:
			ResourceLoader.THREAD_LOAD_LOADED:
				var resource = ResourceLoader.load_threaded_get(item["path"])
				if resource:
					_loaded_resources[item["id"]] = resource
					resource_loaded.emit(item["id"], resource)
				else:
					load_error.emit(item["id"], "Failed to get async resource")
				to_remove.append(i)
			ResourceLoader.THREAD_LOAD_FAILED:
				load_error.emit(item["id"], "Async load failed: " + item["path"])
				to_remove.append(i)
			ResourceLoader.THREAD_LOAD_IN_PROGRESS:
				var progress_arr = []
				ResourceLoader.load_threaded_get_status(item["path"], progress_arr)
				if progress_arr.size() > 0:
					load_progress.emit(item["id"], progress_arr[0])

	for i in to_remove:
		_loading_queue.remove_at(i)

	if _loading_queue.is_empty():
		_is_loading = false
		load_complete.emit()

func _on_resources_list_received(data) -> void:
	if not data is Array:
		return

	for entry in data:
		if entry is Dictionary:
			var rid = str(entry.get("id", ""))
			var path = str(entry.get("path", ""))
			var rtype = str(entry.get("type", "scene"))
			if rtype == "scene":
				load_scene_async(rid, path)
