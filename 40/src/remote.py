import base64
import json
import time
import logging
from typing import Any, Dict, List, Optional, Tuple
from pathlib import Path
from urllib.parse import urljoin
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from .parser import ConfigParser

logger = logging.getLogger(__name__)


class ConfigCenterError(Exception):
    pass


class ConfigNotFoundError(ConfigCenterError):
    pass


class ConfigCenterTimeoutError(ConfigCenterError):
    pass


class ConfigCenterConnectionError(ConfigCenterError):
    pass


class ConfigCenterClient:
    def __init__(
        self,
        base_url: str,
        username: str = None,
        password: str = None,
        namespace: str = "public",
        timeout: int = 30,
        connect_timeout: int = 5,
        max_retries: int = 3
    ):
        self.base_url = base_url.rstrip('/')
        self.username = username
        self.password = password
        self.namespace = namespace
        self.timeout = timeout
        self.connect_timeout = connect_timeout
        self.max_retries = max_retries
        
        self.session = self._create_session()
        self.access_token = None
        self.token_expire_time = 0

    def _create_session(self) -> requests.Session:
        session = requests.Session()
        retry_strategy = Retry(
            total=self.max_retries,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET", "POST", "PUT", "DELETE"]
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        return session

    def _get_headers(self, content_type: str = "application/json") -> Dict[str, str]:
        headers = {"Content-Type": content_type}
        if self.access_token and time.time() < self.token_expire_time:
            headers["Authorization"] = f"Bearer {self.access_token}"
        return headers

    def _request(self, method: str, endpoint: str, **kwargs) -> requests.Response:
        url = urljoin(self.base_url + '/', endpoint.lstrip('/'))
        timeout = kwargs.pop("timeout", (self.connect_timeout, self.timeout))
        kwargs.setdefault("headers", self._get_headers())
        kwargs["timeout"] = timeout
        
        try:
            response = self.session.request(method, url, **kwargs)
            if response.status_code == 401:
                if self._login():
                    kwargs["headers"] = self._get_headers()
                    response = self.session.request(method, url, **kwargs)
            
            if response.status_code == 404:
                raise ConfigNotFoundError(
                    f"配置不存在: {endpoint}"
                )
            
            response.raise_for_status()
            return response
        except ConfigNotFoundError:
            raise
        except ConfigCenterError:
            raise
        except requests.exceptions.ConnectTimeout as e:
            raise ConfigCenterConnectionError(
                f"连接配置中心超时({self.connect_timeout}s): {self.base_url}"
            ) from e
        except requests.exceptions.ReadTimeout as e:
            raise ConfigCenterTimeoutError(
                f"读取配置中心响应超时({self.timeout}s): {endpoint}"
            ) from e
        except requests.exceptions.ConnectionError as e:
            raise ConfigCenterConnectionError(
                f"无法连接配置中心: {self.base_url}"
            ) from e
        except requests.exceptions.HTTPError as e:
            raise ConfigCenterError(
                f"HTTP错误 {e.response.status_code}: {str(e)}"
            ) from e
        except requests.exceptions.RequestException as e:
            raise ConfigCenterError(f"请求失败: {str(e)}") from e

    def _login(self) -> bool:
        if not self.username or not self.password:
            return False
        
        try:
            url = urljoin(self.base_url + '/', 'nacos/v1/auth/login')
            response = self.session.post(
                url,
                data={"username": self.username, "password": self.password},
                timeout=(self.connect_timeout, self.timeout)
            )
            if response.ok:
                data = response.json()
                self.access_token = data.get("accessToken")
                self.token_expire_time = time.time() + data.get("tokenTtl", 18000) - 60
                return True
        except Exception as e:
            logger.warning(f"登录配置中心失败: {str(e)}")
        return False


class NacosClient(ConfigCenterClient):
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((ConfigCenterTimeoutError, ConfigCenterConnectionError)),
        reraise=True
    )
    def get_config(
        self,
        data_id: str,
        group: str = "DEFAULT_GROUP",
        namespace: str = None
    ) -> Optional[str]:
        params = {
            "dataId": data_id,
            "group": group,
            "tenant": namespace or self.namespace
        }
        
        try:
            response = self._request("GET", "nacos/v1/cs/configs", params=params)
            return response.text
        except ConfigNotFoundError:
            return None

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((ConfigCenterTimeoutError, ConfigCenterConnectionError)),
        reraise=True
    )
    def publish_config(
        self,
        data_id: str,
        group: str = "DEFAULT_GROUP",
        content: str = "",
        config_type: str = "yaml",
        namespace: str = None,
        description: str = ""
    ) -> bool:
        data = {
            "dataId": data_id,
            "group": group,
            "content": content,
            "type": config_type,
            "tenant": namespace or self.namespace,
            "desc": description
        }
        
        try:
            response = self._request(
                "POST",
                "nacos/v1/cs/configs",
                data=data,
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            return response.ok and response.text == "true"
        except ConfigCenterError:
            raise

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((ConfigCenterTimeoutError, ConfigCenterConnectionError)),
        reraise=True
    )
    def delete_config(
        self,
        data_id: str,
        group: str = "DEFAULT_GROUP",
        namespace: str = None
    ) -> bool:
        data = {
            "dataId": data_id,
            "group": group,
            "tenant": namespace or self.namespace
        }
        
        try:
            response = self._request(
                "DELETE",
                "nacos/v1/cs/configs",
                data=data,
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            return response.ok and response.text == "true"
        except ConfigNotFoundError:
            return False
        except ConfigCenterError:
            raise

    def list_configs(
        self,
        group: str = None,
        namespace: str = None,
        page_no: int = 1,
        page_size: int = 100
    ) -> Dict[str, Any]:
        params = {
            "pageNo": page_no,
            "pageSize": page_size,
            "tenant": namespace or self.namespace,
            "search": "accurate"
        }
        if group:
            params["group"] = group
        
        try:
            response = self._request("GET", "nacos/v1/cs/configs", params=params)
            return response.json()
        except ConfigCenterError:
            raise

    def list_all_configs(
        self,
        group: str = None,
        namespace: str = None
    ) -> List[Dict[str, Any]]:
        all_configs = []
        page_no = 1
        page_size = 100
        
        while True:
            try:
                result = self.list_configs(group, namespace, page_no, page_size)
            except (ConfigCenterTimeoutError, ConfigCenterConnectionError) as e:
                if all_configs:
                    logger.warning(f"获取配置列表部分失败(已获取{len(all_configs)}项): {str(e)}")
                    break
                raise
            
            items = result.get("pageItems", [])
            if not items:
                break
            
            all_configs.extend(items)
            
            total_count = result.get("totalCount", 0)
            if total_count <= len(all_configs) or len(items) < page_size:
                break
            page_no += 1
        
        return all_configs

    def get_config_history(
        self,
        data_id: str,
        group: str = "DEFAULT_GROUP",
        namespace: str = None,
        page_no: int = 1,
        page_size: int = 20
    ) -> Dict[str, Any]:
        params = {
            "dataId": data_id,
            "group": group,
            "tenant": namespace or self.namespace,
            "pageNo": page_no,
            "pageSize": page_size
        }
        
        try:
            response = self._request("GET", "nacos/v1/cs/history", params=params)
            return response.json()
        except ConfigCenterError:
            raise


class ApolloClient(ConfigCenterClient):
    def get_config(
        self,
        app_id: str,
        cluster_name: str = "default",
        namespace: str = "application",
        release_key: str = None
    ) -> Optional[Dict[str, Any]]:
        endpoint = f"configs/{app_id}/{cluster_name}/{namespace}"
        if release_key:
            endpoint += f"?releaseKey={release_key}"
        
        try:
            response = self._request("GET", endpoint)
            return response.json()
        except ConfigNotFoundError:
            return None

    def publish_config(
        self,
        app_id: str,
        namespace: str,
        key: str,
        value: str,
        comment: str = "",
        data_change_created_by: str = "config-tool"
    ) -> bool:
        data = {
            "key": key,
            "value": value,
            "comment": comment,
            "dataChangeCreatedBy": data_change_created_by
        }
        
        try:
            response = self._request(
                "POST",
                f"configs/{app_id}/default/{namespace}/items",
                json=data
            )
            return response.ok
        except ConfigCenterError:
            raise


class ConfigCenterFactory:
    @staticmethod
    def create_client(
        client_type: str,
        base_url: str,
        username: str = None,
        password: str = None,
        namespace: str = "public",
        **kwargs
    ) -> ConfigCenterClient:
        client_type = client_type.lower()
        
        if client_type == "nacos":
            return NacosClient(base_url, username, password, namespace, **kwargs)
        elif client_type == "apollo":
            return ApolloClient(base_url, username, password, namespace, **kwargs)
        else:
            raise ValueError(f"不支持的配置中心类型: {client_type}")

    @classmethod
    def create_from_cluster_config(cls, cluster_config: Dict[str, Any]) -> ConfigCenterClient:
        cc_config = cluster_config.get("config_center", {})
        parser = ConfigParser()
        cc_config = parser.resolve_environment_variables(cc_config)
        
        return cls.create_client(
            client_type=cc_config.get("type", "nacos"),
            base_url=cc_config.get("url"),
            username=cc_config.get("username"),
            password=cc_config.get("password"),
            namespace=cluster_config.get("namespace", "public")
        )
