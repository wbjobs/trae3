extends Node

var _listeners: Dictionary = {}

func subscribe(event_name: String, callable: Callable) -> void:
	if not _listeners.has(event_name):
		_listeners[event_name] = []
	if not _listeners[event_name].has(callable):
		_listeners[event_name].append(callable)

func unsubscribe(event_name: String, callable: Callable) -> void:
	if not _listeners.has(event_name):
		return
	_listeners[event_name].erase(callable)
	if _listeners[event_name].is_empty():
		_listeners.erase(event_name)

func emit(event_name: String, data = null) -> void:
	if not _listeners.has(event_name):
		return
	for callable in _listeners[event_name]:
		if data == null:
			callable.call()
		else:
			callable.call(data)

func clear() -> void:
	_listeners.clear()
