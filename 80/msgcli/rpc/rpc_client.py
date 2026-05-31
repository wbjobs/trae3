import json
import time
import hashlib
import hmac
from dataclasses import dataclass, field
from typing import Dict, Any, Optional, List, Callable
from datetime import datetime

import requests
from requests.exceptions import RequestException, Timeout, ConnectionError

from ..common import get_logger, load_config


@dataclass
class RPCResponse:
    success: bool
    status_code: int = 0
    data: Any = None
    error: Optional[str] = None
    response_time: float = 0.0
    headers: Dict[str, str] = field(default_factory=dict)
    retry_count: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "status_code": self.status_code,
            "data": self.data,
            "error": self.error,
            "response_time": self.response_time,
            "headers": dict(self.headers),
            "retry_count": self.retry_count,
        }


class RPCClient:
    def __init__(self, endpoint: Optional[str] = None, api_key: Optional[str] = None,
                 max_retries: int = 3, retry_delay: float = 1.0):
        config = load_config()
        self.logger = get_logger("RPCClient")
        self.endpoint = endpoint or config.rpc.endpoint
        self.api_key = api_key or config.rpc.api_key
        self.timeout = config.rpc.timeout
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.session = requests.Session()
        self.session.verify = False

    def _get_headers(self, additional_headers: Optional[Dict[str, str]] = None) -> Dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "msgcli-rpc/1.0",
        }
        
        if self.api_key:
            headers["X-API-Key"] = self.api_key
        
        if additional_headers:
            headers.update(additional_headers)
        
        return headers

    def _generate_signature(self, data: str, timestamp: str) -> str:
        if not self.api_key:
            return ""
        
        message = f"{timestamp}:{data}"
        return hmac.new(
            self.api_key.encode('utf-8'),
            message.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()

    def call(self, method: str, params: Optional[Dict[str, Any]] = None, 
             path: str = "/rpc") -> RPCResponse:
        url = f"{self.endpoint.rstrip('/')}{path}"
        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params or {},
            "id": int(time.time() * 1000),
        }
        
        return self._request("POST", url, json=payload)

    def _request_with_retry(self, method: str, url: str, **kwargs) -> RPCResponse:
        last_exception = None
        total_start_time = time.time()
        
        for attempt in range(self.max_retries):
            start_time = time.time()
            try:
                if "headers" not in kwargs:
                    kwargs["headers"] = {}
                kwargs["headers"] = self._get_headers(kwargs["headers"])
                
                self.logger.debug(f"RPC Request (attempt {attempt + 1}/{self.max_retries}): {method} {url}")
                
                response = self.session.request(
                    method,
                    url,
                    timeout=self.timeout,
                    **kwargs
                )
                
                response_time = time.time() - start_time
                
                try:
                    data = response.json()
                except ValueError:
                    data = response.text
                
                success = 200 <= response.status_code < 300
                
                if not success:
                    self.logger.warning(
                        f"RPC request failed (attempt {attempt + 1}): {response.status_code} - {data}"
                    )
                    if attempt < self.max_retries - 1 and response.status_code >= 500:
                        time.sleep(self.retry_delay)
                        continue
                
                return RPCResponse(
                    success=success,
                    status_code=response.status_code,
                    data=data,
                    error=None if success else f"HTTP {response.status_code}",
                    response_time=response_time,
                    headers=dict(response.headers),
                    retry_count=attempt,
                )
                
            except (Timeout, ConnectionError) as e:
                last_exception = e
                if attempt < self.max_retries - 1:
                    self.logger.warning(
                        f"RPC request timed out (attempt {attempt + 1}/{self.max_retries}): {e}. "
                        f"Retrying in {self.retry_delay}s..."
                    )
                    time.sleep(self.retry_delay)
                else:
                    self.logger.error(f"RPC request failed after {self.max_retries} attempts: {e}")
            except RequestException as e:
                last_exception = e
                self.logger.error(f"RPC request error: {e}")
                break
        
        total_time = time.time() - total_start_time
        return RPCResponse(
            success=False,
            status_code=0,
            data=None,
            error=str(last_exception) if last_exception else "Unknown error",
            response_time=total_time,
            retry_count=self.max_retries,
        )

    def _request(self, method: str, url: str, **kwargs) -> RPCResponse:
        return self._request_with_retry(method, url, **kwargs)

    def get(self, path: str, params: Optional[Dict[str, Any]] = None) -> RPCResponse:
        url = f"{self.endpoint.rstrip('/')}{path}"
        return self._request("GET", url, params=params)

    def post(self, path: str, data: Optional[Dict[str, Any]] = None,
             json_data: Optional[Dict[str, Any]] = None) -> RPCResponse:
        url = f"{self.endpoint.rstrip('/')}{path}"
        kwargs = {}
        if data:
            kwargs["data"] = data
        if json_data:
            kwargs["json"] = json_data
        return self._request("POST", url, **kwargs)

    def put(self, path: str, data: Optional[Dict[str, Any]] = None,
            json_data: Optional[Dict[str, Any]] = None) -> RPCResponse:
        url = f"{self.endpoint.rstrip('/')}{path}"
        kwargs = {}
        if data:
            kwargs["data"] = data
        if json_data:
            kwargs["json"] = json_data
        return self._request("PUT", url, **kwargs)

    def delete(self, path: str) -> RPCResponse:
        url = f"{self.endpoint.rstrip('/')}{path}"
        return self._request("DELETE", url)

    def batch_call(self, requests: List[Dict[str, Any]], 
                   path: str = "/rpc/batch") -> List[RPCResponse]:
        self.logger.info(f"Executing batch RPC call with {len(requests)} requests")
        
        url = f"{self.endpoint.rstrip('/')}{path}"
        payload = [
            {
                "jsonrpc": "2.0",
                "method": req["method"],
                "params": req.get("params", {}),
                "id": idx,
            }
            for idx, req in enumerate(requests)
        ]
        
        response = self._request("POST", url, json=payload)
        
        if not response.success or not isinstance(response.data, list):
            return [response] * len(requests)
        
        result_map = {item.get("id"): item for item in response.data}
        results = []
        
        for idx in range(len(requests)):
            item = result_map.get(idx, {})
            results.append(RPCResponse(
                success="error" not in item,
                status_code=response.status_code,
                data=item.get("result"),
                error=item.get("error", {}).get("message") if "error" in item else None,
                response_time=response.response_time / len(requests),
            ))
        
        return results

    def send_message_via_rpc(self, topic: str, message: Dict[str, Any],
                              key: Optional[str] = None) -> RPCResponse:
        return self.call(
            "kafka.send",
            {"topic": topic, "message": message, "key": key}
        )

    def consume_messages_via_rpc(self, topic: str, group_id: Optional[str] = None,
                                  max_messages: int = 10) -> RPCResponse:
        return self.call(
            "kafka.consume",
            {"topic": topic, "group_id": group_id, "max_messages": max_messages}
        )

    def list_topics_via_rpc(self) -> RPCResponse:
        return self.call("kafka.list_topics")

    def create_topic_via_rpc(self, topic_name: str, num_partitions: int = 3,
                              replication_factor: int = 1) -> RPCResponse:
        return self.call(
            "kafka.create_topic",
            {
                "topic": topic_name,
                "num_partitions": num_partitions,
                "replication_factor": replication_factor,
            }
        )

    def health_check(self) -> RPCResponse:
        return self.get("/health")

    def get_metrics(self) -> RPCResponse:
        return self.get("/metrics")

    def close(self):
        self.session.close()
        self.logger.info("RPC client closed")


class ServiceDiscovery:
    def __init__(self, consul_endpoint: str = "http://localhost:8500"):
        self.consul_endpoint = consul_endpoint
        self.logger = get_logger("ServiceDiscovery")
        self.services: Dict[str, List[str]] = {}

    def discover(self, service_name: str) -> List[str]:
        self.logger.info(f"Discovering service: {service_name}")
        
        try:
            url = f"{self.consul_endpoint}/v1/catalog/service/{service_name}"
            response = requests.get(url, timeout=5)
            
            if response.status_code == 200:
                services = response.json()
                endpoints = [
                    f"http://{s['ServiceAddress']}:{s['ServicePort']}"
                    for s in services
                ]
                self.services[service_name] = endpoints
                self.logger.info(f"Found {len(endpoints)} endpoints for {service_name}")
                return endpoints
        except Exception as e:
            self.logger.error(f"Service discovery error: {e}")
        
        return self.services.get(service_name, [])

    def get_rpc_client(self, service_name: str) -> Optional[RPCClient]:
        endpoints = self.discover(service_name)
        if endpoints:
            return RPCClient(endpoint=endpoints[0])
        return None
