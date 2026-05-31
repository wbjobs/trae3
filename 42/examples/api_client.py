import requests
import json
from typing import Dict, Any, Optional


class GatewayAPIClient:
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url

    def _request(self, method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
        url = f"{self.base_url}{endpoint}"
        response = requests.request(method, url, **kwargs)
        response.raise_for_status()
        return response.json()

    def get_health(self) -> Dict[str, Any]:
        return self._request("GET", "/health")

    def send_message(
        self,
        protocol: str,
        adapter_name: str,
        payload: Dict[str, Any],
        target: Optional[str] = None,
        topic: Optional[str] = None,
        message_type: str = "data"
    ) -> Dict[str, Any]:
        data = {
            "protocol": protocol,
            "adapter_name": adapter_name,
            "payload": payload,
            "target": target,
            "topic": topic,
            "message_type": message_type,
            "headers": {}
        }
        return self._request("POST", "/api/v1/messages/send", json=data)

    def broadcast_message(
        self,
        protocol: str,
        adapter_name: str,
        payload: Dict[str, Any],
        adapter_names: Optional[list] = None
    ) -> Dict[str, Any]:
        data = {
            "protocol": protocol,
            "adapter_name": adapter_name,
            "payload": payload
        }
        params = {"adapter_names": adapter_names} if adapter_names else {}
        return self._request(
            "POST",
            "/api/v1/messages/broadcast",
            json=data,
            params=params
        )

    def list_adapters(self) -> Dict[str, Any]:
        return self._request("GET", "/api/v1/adapters")

    def get_adapter(self, name: str) -> Dict[str, Any]:
        return self._request("GET", f"/api/v1/adapters/{name}")

    def list_routes(self) -> Dict[str, Any]:
        return self._request("GET", "/api/v1/routes")

    def add_route(
        self,
        name: str,
        source: str,
        targets: list,
        strategy: str = "direct",
        condition: Optional[str] = None,
        enabled: bool = True
    ) -> Dict[str, Any]:
        data = {
            "name": name,
            "source": source,
            "targets": targets,
            "strategy": strategy,
            "condition": condition,
            "enabled": enabled
        }
        return self._request("POST", "/api/v1/routes", json=data)

    def delete_route(self, name: str) -> Dict[str, Any]:
        return self._request("DELETE", f"/api/v1/routes/{name}")

    def enable_route(self, name: str) -> Dict[str, Any]:
        return self._request("POST", f"/api/v1/routes/{name}/enable")

    def disable_route(self, name: str) -> Dict[str, Any]:
        return self._request("POST", f"/api/v1/routes/{name}/disable")

    def get_traffic_stats(self) -> Dict[str, Any]:
        return self._request("GET", "/api/v1/stats")

    def get_stats_history(self, limit: int = 100) -> Dict[str, Any]:
        return self._request("GET", f"/api/v1/stats/history?limit={limit}")

    def get_recent_messages(self, limit: int = 100) -> Dict[str, Any]:
        return self._request("GET", f"/api/v1/stats/recent?limit={limit}")

    def reset_stats(self) -> Dict[str, Any]:
        return self._request("POST", "/api/v1/stats/reset")

    def get_stored_messages(
        self,
        protocol: Optional[str] = None,
        source: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> Dict[str, Any]:
        params = {"limit": limit, "offset": offset}
        if protocol:
            params["protocol"] = protocol
        if source:
            params["source"] = source
        return self._request("GET", "/api/v1/data/messages", params=params)

    def get_traffic_data(self) -> Dict[str, Any]:
        return self._request("GET", "/api/v1/data/traffic")

    def get_cluster_nodes(self) -> Dict[str, Any]:
        return self._request("GET", "/api/v1/cluster/nodes")

    def get_load_balancer_status(self) -> Dict[str, Any]:
        return self._request("GET", "/api/v1/cluster/load-balancer")

    def set_load_balancer_strategy(self, strategy: str) -> Dict[str, Any]:
        return self._request(
            "POST",
            f"/api/v1/cluster/load-balancer/strategy?strategy={strategy}"
        )


def main():
    client = GatewayAPIClient()

    print("=== Testing Gateway API ===")

    try:
        print("\n1. Health Check:")
        result = client.get_health()
        print(json.dumps(result, indent=2))

        print("\n2. List Adapters:")
        result = client.list_adapters()
        print(json.dumps(result, indent=2))

        print("\n3. List Routes:")
        result = client.list_routes()
        print(json.dumps(result, indent=2))

        print("\n4. Traffic Stats:")
        result = client.get_traffic_stats()
        print(json.dumps(result, indent=2))

    except requests.exceptions.ConnectionError:
        print("Error: Could not connect to the gateway server.")
        print("Please make sure the server is running on http://localhost:8000")
    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    main()
