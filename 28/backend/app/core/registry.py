from typing import Dict, Any, Optional, Callable, List
from dataclasses import dataclass, field


@dataclass
class ServiceRegistry:
    _services: Dict[str, Any] = field(default_factory=dict)
    _factories: Dict[str, Callable] = field(default_factory=dict)

    def register(self, name: str, instance: Any) -> None:
        self._services[name] = instance

    def register_factory(self, name: str, factory: Callable) -> None:
        self._factories[name] = factory

    def get(self, name: str) -> Optional[Any]:
        if name in self._services:
            return self._services[name]
        if name in self._factories:
            instance = self._factories[name]()
            self._services[name] = instance
            return instance
        return None

    def get_or_none(self, name: str) -> Optional[Any]:
        return self._services.get(name)

    def require(self, name: str) -> Any:
        svc = self.get(name)
        if svc is None:
            raise KeyError(f"Service '{name}' not registered")
        return svc

    def has(self, name: str) -> bool:
        return name in self._services or name in self._factories

    def list_services(self) -> List[str]:
        return list(set(list(self._services.keys()) + list(self._factories.keys())))


_service_registry = ServiceRegistry()


def get_registry() -> ServiceRegistry:
    return _service_registry
