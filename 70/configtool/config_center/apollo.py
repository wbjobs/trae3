import os
import json
import time
from typing import Any, Dict, List, Optional
from configtool.utils import get_logger, NetworkError, ConfigError
from configtool.remote import RemoteClient
from configtool.whitelist import ConfigWhitelist
from .base import ConfigCenterBase

logger = get_logger("config_center.apollo")

class ApolloClient(ConfigCenterBase):
    def _init_client(self) -> None:
        prefix = f"APOLLO_{self.env.upper()}_" if self.env != "default" else "APOLLO_"

        self.server_url = os.environ.get(f"{prefix}SERVER_URL") or os.environ.get("APOLLO_SERVER_URL")
        self.app_id = os.environ.get(f"{prefix}APP_ID") or os.environ.get("APOLLO_APP_ID")
        self.cluster = os.environ.get(f"{prefix}CLUSTER") or os.environ.get("APOLLO_CLUSTER", "default")
        self.token = os.environ.get(f"{prefix}TOKEN") or os.environ.get("APOLLO_TOKEN", "")

        if not self.server_url or not self.app_id:
            raise ConfigError(
                f"Apollo配置不完整，请设置 {prefix}SERVER_URL 和 {prefix}APP_ID 环境变量"
            )

        self.client = RemoteClient(base_url=self.server_url)
        logger.info(f"Apollo客户端初始化完成: server={self.server_url}, app_id={self.app_id}, env={self.env}")

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
        logger.debug(f"获取Apollo配置: namespace={namespace}")

        url = f"/configfiles/json/{self.app_id}/{self.cluster}/{namespace}"
        params = {}
        if self.token:
            params["token"] = self.token

        response = self.client.get(url, params=params)

        if not response.success:
            raise NetworkError(
                f"获取Apollo配置失败: namespace={namespace}, "
                f"status={response.status_code}, error={response.error}"
            )

        data = response.data or {}
        if isinstance(data, dict):
            return data
        elif isinstance(data, str):
            try:
                return json.loads(data)
            except json.JSONDecodeError:
                return {"content": data}
        else:
            return {}

    def publish_config(
        self,
        namespace: str,
        config_data: Dict[str, Any],
        comment: str = "",
        whitelist: Optional[ConfigWhitelist] = None,
    ) -> Dict[str, Any]:
        logger.info(f"发布Apollo配置: namespace={namespace}, comment={comment}")

        if whitelist:
            config_data = whitelist.filter_dict(config_data)

        url = f"/openapi/v1/envs/{self.env}/apps/{self.app_id}/clusters/{self.cluster}/namespaces/{namespace}/items"

        items = self._flatten_config(config_data)
        results = []

        for key, value in items.items():
            item_url = url
            existing_item = self._get_item(namespace, key)

            if existing_item:
                item_id = existing_item["id"]
                update_url = f"{url}/{item_id}"
                response = self.client.put(
                    update_url,
                    json_data={
                        "key": key,
                        "value": str(value),
                        "comment": comment,
                        "dataChangeLastModifiedBy": "configtool",
                    },
                    headers=self._get_auth_headers(),
                )
            else:
                response = self.client.post(
                    item_url,
                    json_data={
                        "key": key,
                        "value": str(value),
                        "comment": comment,
                        "dataChangeCreatedBy": "configtool",
                    },
                    headers=self._get_auth_headers(),
                )

            results.append({
                "key": key,
                "value": value,
                "success": response.success,
                "status_code": response.status_code,
            })

        release_url = (
            f"/openapi/v1/envs/{self.env}/apps/{self.app_id}/clusters/{self.cluster}"
            f"/namespaces/{namespace}/releases"
        )
        release_response = self.client.post(
            release_url,
            json_data={
                "releaseTitle": f"configtool-release-{int(time.time())}",
                "releaseComment": comment,
                "releasedBy": "configtool",
            },
            headers=self._get_auth_headers(),
        )

        success_count = sum(1 for r in results if r["success"])
        return {
            "namespace": namespace,
            "total_items": len(results),
            "success_items": success_count,
            "release_success": release_response.success,
            "results": results,
        }

    def update_config(
        self,
        namespace: str,
        key: str,
        value: Any,
        comment: str = "",
    ) -> bool:
        logger.info(f"更新Apollo配置项: namespace={namespace}, key={key}")

        existing_item = self._get_item(namespace, key)

        url = (
            f"/openapi/v1/envs/{self.env}/apps/{self.app_id}/clusters/{self.cluster}"
            f"/namespaces/{namespace}/items"
        )

        if existing_item:
            item_id = existing_item["id"]
            update_url = f"{url}/{item_id}"
            response = self.client.put(
                update_url,
                json_data={
                    "key": key,
                    "value": str(value),
                    "comment": comment,
                    "dataChangeLastModifiedBy": "configtool",
                },
                headers=self._get_auth_headers(),
            )
        else:
            response = self.client.post(
                url,
                json_data={
                    "key": key,
                    "value": str(value),
                    "comment": comment,
                    "dataChangeCreatedBy": "configtool",
                },
                headers=self._get_auth_headers(),
            )

        return response.success

    def delete_config(self, namespace: str, key: str) -> bool:
        logger.info(f"删除Apollo配置项: namespace={namespace}, key={key}")

        existing_item = self._get_item(namespace, key)
        if not existing_item:
            logger.warning(f"配置项不存在: {key}")
            return False

        item_id = existing_item["id"]
        url = (
            f"/openapi/v1/envs/{self.env}/apps/{self.app_id}/clusters/{self.cluster}"
            f"/namespaces/{namespace}/items/{item_id}?operator=configtool"
        )

        response = self.client.delete(url, headers=self._get_auth_headers())
        return response.success

    def list_namespaces(self) -> List[str]:
        logger.debug("获取Apollo命名空间列表")

        url = f"/openapi/v1/apps/{self.app_id}/appnamespaces"
        response = self.client.get(url, headers=self._get_auth_headers())

        if not response.success or not isinstance(response.data, list):
            return []

        return [ns.get("name", "") for ns in response.data if isinstance(ns, dict)]

    def publish_history(
        self,
        namespace: str,
        page: int = 1,
        page_size: int = 20,
    ) -> List[Dict[str, Any]]:
        logger.debug(
            f"获取Apollo发布历史: namespace={namespace}, page={page}, page_size={page_size}"
        )

        url = (
            f"/openapi/v1/envs/{self.env}/apps/{self.app_id}/clusters/{self.cluster}"
            f"/namespaces/{namespace}/releases/all"
        )
        params = {"page": page - 1, "size": page_size}

        response = self.client.get(url, params=params, headers=self._get_auth_headers())

        if not response.success or not isinstance(response.data, list):
            return []

        return [
            {
                "version": item.get("id"),
                "name": item.get("name"),
                "comment": item.get("comment"),
                "operator": item.get("dataChangeCreatedBy"),
                "created_at": item.get("dataChangeCreatedTime"),
                "config": item.get("configurations", {}),
            }
            for item in response.data
            if isinstance(item, dict)
        ]

    def _get_item(self, namespace: str, key: str) -> Optional[Dict[str, Any]]:
        url = (
            f"/openapi/v1/envs/{self.env}/apps/{self.app_id}/clusters/{self.cluster}"
            f"/namespaces/{namespace}/items/{key}"
        )
        response = self.client.get(url, headers=self._get_auth_headers())
        if response.success and isinstance(response.data, dict):
            return response.data
        return None

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

    def _get_auth_headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = self.token
        return headers
