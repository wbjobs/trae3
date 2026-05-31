import os
import json
from typing import Any, Dict, List, Optional
from configtool.utils import get_logger, NetworkError, ConfigError
from configtool.remote import RemoteClient
from configtool.whitelist import ConfigWhitelist
from .base import ConfigCenterBase

logger = get_logger("config_center.nacos")

class NacosClient(ConfigCenterBase):
    def _init_client(self) -> None:
        prefix = f"NACOS_{self.env.upper()}_" if self.env != "default" else "NACOS_"

        self.server_url = os.environ.get(f"{prefix}SERVER_URL") or os.environ.get("NACOS_SERVER_URL")
        self.namespace = os.environ.get(f"{prefix}NAMESPACE") or os.environ.get("NACOS_NAMESPACE", "")
        self.group = os.environ.get(f"{prefix}GROUP") or os.environ.get("NACOS_GROUP", "DEFAULT_GROUP")
        self.username = os.environ.get(f"{prefix}USERNAME") or os.environ.get("NACOS_USERNAME", "nacos")
        self.password = os.environ.get(f"{prefix}PASSWORD") or os.environ.get("NACOS_PASSWORD", "nacos")

        if not self.server_url:
            raise ConfigError(
                f"Nacos配置不完整，请设置 {prefix}SERVER_URL 环境变量"
            )

        self.client = RemoteClient(base_url=self.server_url)
        self.access_token = None
        self._login()

        logger.info(
            f"Nacos客户端初始化完成: server={self.server_url}, "
            f"namespace={self.namespace}, env={self.env}"
        )

    def _login(self) -> None:
        logger.debug("Nacos登录")
        url = "/nacos/v1/auth/login"
        response = self.client.post(
            url,
            data={"username": self.username, "password": self.password},
        )

        if not response.success or not isinstance(response.data, dict):
            raise NetworkError(f"Nacos登录失败: {response.error}")

        self.access_token = response.data.get("accessToken", "")
        if not self.access_token:
            raise ConfigError("Nacos登录失败，未获取到accessToken")

    def get_config(
        self,
        namespace: str = "application",
        key: Optional[str] = None,
        default: Any = None,
    ) -> Any:
        configs = self.get_all_configs(namespace)
        if key is None:
            return configs
        return configs.get(key, default)

    def get_all_configs(self, namespace: str = "application") -> Dict[str, Any]:
        logger.debug(f"获取Nacos配置: data_id={namespace}, group={self.group}")

        url = "/nacos/v1/cs/configs"
        params = {
            "dataId": namespace,
            "group": self.group,
            "tenant": self.namespace,
            "accessToken": self.access_token,
        }

        response = self.client.get(url, params=params)

        if not response.success:
            raise NetworkError(
                f"获取Nacos配置失败: data_id={namespace}, "
                f"status={response.status_code}, error={response.error}"
            )

        content = response.data
        if not content:
            return {}

        if isinstance(content, str):
            return self._parse_config_content(content, namespace)
        elif isinstance(content, dict):
            return content
        else:
            return {}

    def publish_config(
        self,
        namespace: str,
        config_data: Dict[str, Any],
        comment: str = "",
        whitelist: Optional[ConfigWhitelist] = None,
    ) -> Dict[str, Any]:
        logger.info(f"发布Nacos配置: data_id={namespace}, comment={comment}")

        if whitelist:
            config_data = whitelist.filter_dict(config_data)

        content = self._format_config_content(config_data, namespace)

        url = "/nacos/v1/cs/configs"
        data = {
            "dataId": namespace,
            "group": self.group,
            "tenant": self.namespace,
            "content": content,
            "type": self._get_config_type(namespace),
            "configTags": "",
            "appName": self.namespace or "configtool",
            "srcUser": "configtool",
            "cascade": "true",
            "accessToken": self.access_token,
        }
        if comment:
            data["desc"] = comment

        response = self.client.post(url, data=data)

        success = response.success and response.data is True
        return {
            "namespace": namespace,
            "success": success,
            "status_code": response.status_code,
            "message": str(response.data) if not success else "success",
        }

    def update_config(
        self,
        namespace: str,
        key: str,
        value: Any,
        comment: str = "",
    ) -> bool:
        logger.info(f"更新Nacos配置项: data_id={namespace}, key={key}")

        current_config = self.get_all_configs(namespace)
        self._set_nested_value(current_config, key, value)

        result = self.publish_config(namespace, current_config, comment)
        return result.get("success", False)

    def delete_config(self, namespace: str, key: str) -> bool:
        logger.info(f"删除Nacos配置项: data_id={namespace}, key={key}")

        current_config = self.get_all_configs(namespace)
        if self._delete_nested_value(current_config, key):
            result = self.publish_config(namespace, current_config, f"删除配置项: {key}")
            return result.get("success", False)
        return False

    def list_namespaces(self) -> List[str]:
        logger.debug("获取Nacos配置列表")

        url = "/nacos/v1/cs/configs"
        params = {
            "group": self.group,
            "tenant": self.namespace,
            "dataId": "",
            "pageNo": 1,
            "pageSize": 100,
            "accessToken": self.access_token,
        }

        response = self.client.get(url, params=params)

        if not response.success or not isinstance(response.data, dict):
            return []

        page_items = response.data.get("pageItems", [])
        if not isinstance(page_items, list):
            return []

        return [item.get("dataId", "") for item in page_items if isinstance(item, dict)]

    def publish_history(
        self,
        namespace: str,
        page: int = 1,
        page_size: int = 20,
    ) -> List[Dict[str, Any]]:
        logger.debug(
            f"获取Nacos发布历史: data_id={namespace}, page={page}, page_size={page_size}"
        )

        url = "/nacos/v1/cs/history"
        params = {
            "dataId": namespace,
            "group": self.group,
            "tenant": self.namespace,
            "pageNo": page,
            "pageSize": page_size,
            "accessToken": self.access_token,
        }

        response = self.client.get(url, params=params)

        if not response.success or not isinstance(response.data, dict):
            return []

        page_items = response.data.get("pageItems", [])
        if not isinstance(page_items, list):
            return []

        return [
            {
                "version": item.get("id"),
                "name": item.get("dataId"),
                "comment": item.get("srcUser", ""),
                "operator": item.get("srcUser"),
                "created_at": item.get("createdTime"),
                "config": self._parse_config_content(item.get("content", ""), namespace),
            }
            for item in page_items
            if isinstance(item, dict)
        ]

    def _parse_config_content(self, content: str, data_id: str) -> Dict[str, Any]:
        if not content:
            return {}

        lower_id = data_id.lower()

        if lower_id.endswith((".yaml", ".yml")) or lower_id.endswith("-yaml"):
            try:
                import yaml
                return yaml.safe_load(content) or {}
            except Exception as e:
                logger.warning(f"解析YAML配置失败: {e}")
                return {"content": content}
        elif lower_id.endswith(".json") or lower_id.endswith("-json"):
            try:
                return json.loads(content)
            except json.JSONDecodeError as e:
                logger.warning(f"解析JSON配置失败: {e}")
                return {"content": content}
        else:
            result = {}
            for line in content.split("\n"):
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, value = line.split("=", 1)
                    result[key.strip()] = value.strip()
            return result

    def _format_config_content(self, config_data: Dict[str, Any], data_id: str) -> str:
        lower_id = data_id.lower()

        if lower_id.endswith((".yaml", ".yml")) or lower_id.endswith("-yaml"):
            import yaml
            return yaml.dump(config_data, default_flow_style=False, allow_unicode=True, sort_keys=False)
        elif lower_id.endswith(".json") or lower_id.endswith("-json"):
            return json.dumps(config_data, ensure_ascii=False, indent=2)
        else:
            lines = []
            for key, value in self._flatten_config(config_data).items():
                lines.append(f"{key}={value}")
            return "\n".join(lines)

    def _get_config_type(self, data_id: str) -> str:
        lower_id = data_id.lower()
        if lower_id.endswith((".yaml", ".yml")) or lower_id.endswith("-yaml"):
            return "yaml"
        elif lower_id.endswith(".json") or lower_id.endswith("-json"):
            return "json"
        elif lower_id.endswith(".xml"):
            return "xml"
        else:
            return "properties"

    def _flatten_config(
        self,
        config: Dict[str, Any],
        prefix: str = "",
    ) -> Dict[str, str]:
        flattened = {}
        for key, value in config.items():
            full_key = f"{prefix}{key}" if prefix else key
            if isinstance(value, dict):
                flattened.update(self._flatten_config(value, f"{full_key}."))
            elif isinstance(value, list):
                flattened[full_key] = json.dumps(value, ensure_ascii=False)
            else:
                flattened[full_key] = str(value)
        return flattened

    def _set_nested_value(self, config: Dict[str, Any], key_path: str, value: Any) -> None:
        keys = key_path.split(".")
        current = config
        for key in keys[:-1]:
            if key not in current or not isinstance(current[key], dict):
                current[key] = {}
            current = current[key]
        current[keys[-1]] = value

    def _delete_nested_value(self, config: Dict[str, Any], key_path: str) -> bool:
        keys = key_path.split(".")
        current = config
        for key in keys[:-1]:
            if key not in current or not isinstance(current[key], dict):
                return False
            current = current[key]
        if keys[-1] in current:
            del current[keys[-1]]
            return True
        return False
