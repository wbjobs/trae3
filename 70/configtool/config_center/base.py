from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from configtool.utils import get_logger
from configtool.whitelist import ConfigWhitelist

logger = get_logger("config_center")

class ConfigCenterBase(ABC):
    def __init__(self, env: str = "default"):
        self.env = env
        self.client = None
        self._init_client()

    @abstractmethod
    def _init_client(self) -> None:
        pass

    @abstractmethod
    def get_config(
        self,
        namespace: str = "application",
        key: Optional[str] = None,
        default: Any = None,
    ) -> Any:
        pass

    @abstractmethod
    def get_all_configs(self, namespace: str = "application") -> Dict[str, Any]:
        pass

    @abstractmethod
    def publish_config(
        self,
        namespace: str,
        config_data: Dict[str, Any],
        comment: str = "",
        whitelist: Optional[ConfigWhitelist] = None,
    ) -> Dict[str, Any]:
        pass

    @abstractmethod
    def update_config(
        self,
        namespace: str,
        key: str,
        value: Any,
        comment: str = "",
    ) -> bool:
        pass

    @abstractmethod
    def delete_config(self, namespace: str, key: str) -> bool:
        pass

    @abstractmethod
    def list_namespaces(self) -> List[str]:
        pass

    @abstractmethod
    def publish_history(
        self,
        namespace: str,
        page: int = 1,
        page_size: int = 20,
    ) -> List[Dict[str, Any]]:
        pass
