import json
from typing import Optional, Callable
import requests
from cache_toolkit.utils.logger import get_logger

logger = get_logger()


class RpcError(Exception):
    pass


class RpcClient:
    def __init__(self, timeout: int = 30, retry_count: int = 3, retry_delay: float = 2.0):
        self._timeout = timeout
        self._retry_count = retry_count
        self._retry_delay = retry_delay
        self._session = requests.Session()
        self._session.headers.update({"Content-Type": "application/json"})
        self._node_registry: dict = {}

    def register_node(self, node_id: str, endpoint: str, token: Optional[str] = None):
        self._node_registry[node_id] = {
            "endpoint": endpoint.rstrip("/"),
            "token": token,
        }
        logger.info(f"Registered RPC node: {node_id} -> {endpoint}")

    def unregister_node(self, node_id: str) -> bool:
        if node_id in self._node_registry:
            del self._node_registry[node_id]
            return True
        return False

    def get_registered_nodes(self) -> list:
        return [
            {"node_id": k, "endpoint": v["endpoint"]}
            for k, v in self._node_registry.items()
        ]

    def call(self, node_id: str, method: str, params: Optional[dict] = None) -> dict:
        if node_id not in self._node_registry:
            raise RpcError(f"Node {node_id} not registered")

        node = self._node_registry[node_id]
        url = f"{node['endpoint']}/rpc"
        headers = {}
        if node.get("token"):
            headers["Authorization"] = f"Bearer {node['token']}"

        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params or {},
            "id": 1,
        }

        last_error = None
        for attempt in range(self._retry_count):
            try:
                resp = self._session.post(
                    url,
                    json=payload,
                    headers=headers,
                    timeout=self._timeout,
                )
                resp.raise_for_status()
                result = resp.json()

                if "error" in result:
                    raise RpcError(f"RPC error: {result['error']}")

                return result.get("result", {})

            except requests.exceptions.Timeout as e:
                last_error = e
                logger.warning(f"RPC call to {node_id} timed out (attempt {attempt + 1}/{self._retry_count})")
            except requests.exceptions.ConnectionError as e:
                last_error = e
                logger.warning(f"RPC connection to {node_id} failed (attempt {attempt + 1}/{self._retry_count})")
            except requests.exceptions.HTTPError as e:
                last_error = e
                logger.warning(f"RPC HTTP error from {node_id}: {e} (attempt {attempt + 1}/{self._retry_count})")
            except json.JSONDecodeError as e:
                last_error = e
                logger.warning(f"Invalid RPC response from {node_id}: {e}")

            if attempt < self._retry_count - 1:
                import time
                time.sleep(self._retry_delay)

        raise RpcError(f"RPC call to {node_id} failed after {self._retry_count} retries: {last_error}")

    def ping(self, node_id: str) -> dict:
        return self.call(node_id, "ping")

    def remote_inspect(self, node_id: str, pattern: str = "*", scan_count: int = 200) -> dict:
        return self.call(node_id, "inspect_keys", {"pattern": pattern, "scan_count": scan_count})

    def remote_migrate(self, node_id: str, source: str, target: str, keys_pattern: str = "*") -> dict:
        return self.call(node_id, "migrate", {
            "source_node": source,
            "target_node": target,
            "keys_pattern": keys_pattern,
        })

    def remote_health(self, node_id: str) -> dict:
        return self.call(node_id, "health_check")

    def remote_node_info(self, node_id: str) -> dict:
        return self.call(node_id, "node_info")

    def batch_call(self, node_ids: list, method: str, params: Optional[dict] = None) -> dict:
        results = {}
        for nid in node_ids:
            try:
                results[nid] = {"success": True, "data": self.call(nid, method, params)}
            except RpcError as e:
                results[nid] = {"success": False, "error": str(e)}
        return results

    def close(self):
        self._session.close()


class RpcServer:
    def __init__(self, host: str = "0.0.0.0", port: int = 8900):
        self._host = host
        self._port = port
        self._handlers: dict = {}
        self._app = None

    def register_handler(self, method: str, handler: Callable):
        self._handlers[method] = handler

    def _handle_request(self, body: dict) -> dict:
        method = body.get("method")
        params = body.get("params", {})
        req_id = body.get("id", 1)

        if method not in self._handlers:
            return {
                "jsonrpc": "2.0",
                "error": {"code": -32601, "message": f"Method not found: {method}"},
                "id": req_id,
            }

        try:
            result = self._handlers[method](**params)
            return {"jsonrpc": "2.0", "result": result, "id": req_id}
        except Exception as e:
            return {
                "jsonrpc": "2.0",
                "error": {"code": -32603, "message": str(e)},
                "id": req_id,
            }

    def start(self, blocking: bool = True):
        try:
            from flask import Flask, request as flask_request, jsonify
        except ImportError:
            raise RpcError("Flask is required for RPC server. Install with: pip install flask")

        self._app = Flask(__name__)

        @self._app.route("/rpc", methods=["POST"])
        def rpc_endpoint():
            body = flask_request.get_json(force=True)
            result = self._handle_request(body)
            return jsonify(result)

        @self._app.route("/health", methods=["GET"])
        def health():
            return jsonify({"status": "ok"})

        self._app.run(host=self._host, port=self._port, threaded=True)
