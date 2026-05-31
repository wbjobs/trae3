from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List, Optional, Any
from datetime import datetime

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.logger import get_logger
from core.config import get_config
from protocols.models import (
    ProtocolMessage,
    ProtocolType,
    MessageType,
)
from protocols.manager import ProtocolManager
from gateway.router import MessageRouter, RouteRule, RouteStrategy
from gateway.dynamic_router import DynamicRouter, DynamicRouteRule, DynamicRouteCondition, MatchType
from gateway.protection import ProtocolFilter, CircuitBreakerRegistry, FilterMode, ProtocolFilterRule

logger = get_logger(__name__)


class SendMessageRequest(BaseModel):
    protocol: ProtocolType
    adapter_name: str
    target: Optional[str] = None
    topic: Optional[str] = None
    payload: Dict[str, Any]
    message_type: MessageType = MessageType.DATA
    headers: Dict[str, str] = {}


class RouteRuleRequest(BaseModel):
    name: str
    source: str
    targets: List[str]
    strategy: RouteStrategy = RouteStrategy.DIRECT
    condition: Optional[str] = None
    enabled: bool = True


class APIResponse(BaseModel):
    success: bool
    message: str = ""
    data: Optional[Dict[str, Any]] = None


class GatewayAPI:
    def __init__(
        self,
        protocol_manager: ProtocolManager,
        message_router: MessageRouter,
        traffic_monitor=None,
        data_storage=None,
        service_discovery=None,
        load_balancer=None,
        protocol_filter: ProtocolFilter = None,
        circuit_breaker_registry: CircuitBreakerRegistry = None,
        dynamic_router: DynamicRouter = None
    ):
        self.app = FastAPI(
            title="Multi-Protocol API Gateway",
            description="统一多协议后端API服务",
            version="2.0.0"
        )
        self.protocol_manager = protocol_manager
        self.message_router = message_router
        self.traffic_monitor = traffic_monitor
        self.data_storage = data_storage
        self.service_discovery = service_discovery
        self.load_balancer = load_balancer
        self.protocol_filter = protocol_filter or ProtocolFilter()
        self.circuit_breaker_registry = circuit_breaker_registry or CircuitBreakerRegistry()
        self.dynamic_router = dynamic_router or DynamicRouter()
        self._setup_routes()
        self._setup_middleware()

    def _setup_middleware(self) -> None:
        self.app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    def _setup_routes(self) -> None:
        @self.app.get("/", response_model=APIResponse)
        async def root():
            return APIResponse(
                success=True,
                message="Multi-Protocol API Gateway is running",
                data={
                    "version": "1.0.0",
                    "adapters": list(self.protocol_manager.adapters.keys())
                }
            )

        @self.app.get("/health", response_model=APIResponse)
        async def health_check():
            adapter_status = {
                name: adapter.is_connected
                for name, adapter in self.protocol_manager.adapters.items()
            }
            return APIResponse(
                success=True,
                message="Health check passed",
                data={
                    "status": "healthy",
                    "timestamp": datetime.now().isoformat(),
                    "adapters": adapter_status
                }
            )

        @self.app.post("/api/v1/messages/send", response_model=APIResponse)
        async def send_message(request: SendMessageRequest):
            try:
                if not request.adapter_name:
                    raise HTTPException(status_code=400, detail="adapter_name is required")

                if not request.payload:
                    raise HTTPException(status_code=400, detail="payload is required")

                adapter = self.protocol_manager.get_adapter(request.adapter_name)
                if not adapter:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Adapter '{request.adapter_name}' not found. Available: {list(self.protocol_manager.adapters.keys())}"
                    )

                if not adapter.is_connected:
                    raise HTTPException(status_code=400, detail=f"Adapter '{request.adapter_name}' is not connected")

                message = ProtocolMessage(
                    protocol=request.protocol,
                    message_type=request.message_type,
                    source="api",
                    target=request.target,
                    topic=request.topic,
                    payload=request.payload,
                    headers=request.headers or {}
                )

                if not self.protocol_filter.allow(message):
                    raise HTTPException(status_code=403, detail="Message blocked by protocol filter")

                cb = self.circuit_breaker_registry.get_or_create(request.adapter_name)
                if not cb.allow_request():
                    raise HTTPException(
                        status_code=503,
                        detail=f"Circuit breaker '{request.adapter_name}' is OPEN. Service temporarily unavailable"
                    )

                success = await self.protocol_manager.send(request.adapter_name, message)

                if success:
                    cb.record_success()
                    return APIResponse(
                        success=True,
                        message="Message sent successfully",
                        data={"message_id": message.message_id}
                    )
                else:
                    cb.record_failure()
                    raise HTTPException(status_code=500, detail="Failed to send message")
            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"Send message error: {e}", exc_info=True)
                raise HTTPException(status_code=500, detail=str(e))

        @self.app.post("/api/v1/messages/broadcast", response_model=APIResponse)
        async def broadcast_message(
            request: SendMessageRequest,
            adapter_names: Optional[List[str]] = None
        ):
            try:
                message = ProtocolMessage(
                    protocol=request.protocol,
                    message_type=request.message_type,
                    source="api",
                    target=request.target,
                    topic=request.topic,
                    payload=request.payload,
                    headers=request.headers
                )
                
                results = await self.protocol_manager.broadcast(
                    message,
                    adapter_names
                )
                
                return APIResponse(
                    success=all(results.values()),
                    message="Broadcast completed",
                    data={"results": results}
                )
            except Exception as e:
                logger.error(f"Broadcast error: {e}")
                raise HTTPException(status_code=500, detail=str(e))

        @self.app.get("/api/v1/adapters", response_model=APIResponse)
        async def list_adapters():
            adapters_info = []
            for name, adapter in self.protocol_manager.adapters.items():
                adapters_info.append({
                    "name": name,
                    "connected": adapter.is_connected,
                    "type": type(adapter).__name__
                })
            
            return APIResponse(
                success=True,
                data={"adapters": adapters_info}
            )

        @self.app.get("/api/v1/adapters/{name}", response_model=APIResponse)
        async def get_adapter(name: str):
            adapter = self.protocol_manager.get_adapter(name)
            if not adapter:
                raise HTTPException(status_code=404, detail="Adapter not found")
            
            return APIResponse(
                success=True,
                data={
                    "name": name,
                    "connected": adapter.is_connected,
                    "type": type(adapter).__name__
                }
            )

        @self.app.get("/api/v1/routes", response_model=APIResponse)
        async def list_routes():
            rules = []
            for rule in self.message_router.get_rules():
                rules.append({
                    "name": rule.name,
                    "source": rule.source,
                    "targets": rule.targets,
                    "strategy": rule.strategy,
                    "condition": rule.condition,
                    "enabled": rule.enabled
                })
            
            return APIResponse(
                success=True,
                data={"rules": rules}
            )

        @self.app.post("/api/v1/routes", response_model=APIResponse)
        async def add_route(request: RouteRuleRequest):
            rule = RouteRule(
                name=request.name,
                source=request.source,
                targets=request.targets,
                strategy=request.strategy,
                condition=request.condition,
                enabled=request.enabled
            )
            self.message_router.add_rule(rule)
            
            return APIResponse(
                success=True,
                message="Route rule added successfully"
            )

        @self.app.delete("/api/v1/routes/{name}", response_model=APIResponse)
        async def delete_route(name: str):
            if self.message_router.remove_rule(name):
                return APIResponse(
                    success=True,
                    message="Route rule deleted successfully"
                )
            raise HTTPException(status_code=404, detail="Route rule not found")

        @self.app.post("/api/v1/routes/{name}/enable", response_model=APIResponse)
        async def enable_route(name: str):
            if self.message_router.enable_rule(name):
                return APIResponse(
                    success=True,
                    message="Route rule enabled"
                )
            raise HTTPException(status_code=404, detail="Route rule not found")

        @self.app.post("/api/v1/routes/{name}/disable", response_model=APIResponse)
        async def disable_route(name: str):
            if self.message_router.disable_rule(name):
                return APIResponse(
                    success=True,
                    message="Route rule disabled"
                )
            raise HTTPException(status_code=404, detail="Route rule not found")

        @self.app.get("/api/v1/stats", response_model=APIResponse)
        async def get_traffic_stats():
            if not self.traffic_monitor:
                raise HTTPException(
                    status_code=503,
                    detail="Traffic monitor is not available"
                )
            return APIResponse(
                success=True,
                data=self.traffic_monitor.get_current_stats()
            )

        @self.app.get("/api/v1/stats/history", response_model=APIResponse)
        async def get_stats_history(limit: int = 100):
            if not self.traffic_monitor:
                raise HTTPException(
                    status_code=503,
                    detail="Traffic monitor is not available"
                )
            return APIResponse(
                success=True,
                data={"history": self.traffic_monitor.get_history(limit)}
            )

        @self.app.get("/api/v1/stats/recent", response_model=APIResponse)
        async def get_recent_messages(limit: int = 100):
            if not self.traffic_monitor:
                raise HTTPException(
                    status_code=503,
                    detail="Traffic monitor is not available"
                )
            return APIResponse(
                success=True,
                data={"messages": self.traffic_monitor.get_recent_messages(limit)}
            )

        @self.app.post("/api/v1/stats/reset", response_model=APIResponse)
        async def reset_stats():
            if not self.traffic_monitor:
                raise HTTPException(
                    status_code=503,
                    detail="Traffic monitor is not available"
                )
            self.traffic_monitor.reset_stats()
            return APIResponse(
                success=True,
                message="Traffic statistics reset successfully"
            )

        @self.app.get("/api/v1/data/messages", response_model=APIResponse)
        async def get_stored_messages(
            protocol: Optional[str] = None,
            source: Optional[str] = None,
            limit: int = 100,
            offset: int = 0
        ):
            if not self.data_storage:
                raise HTTPException(
                    status_code=503,
                    detail="Data storage is not available"
                )
            messages = self.data_storage.get_messages(
                protocol=protocol,
                source=source,
                limit=limit,
                offset=offset
            )
            total = self.data_storage.get_message_count(
                protocol=protocol,
                source=source
            )
            return APIResponse(
                success=True,
                data={
                    "messages": messages,
                    "total": total,
                    "limit": limit,
                    "offset": offset
                }
            )

        @self.app.get("/api/v1/data/traffic", response_model=APIResponse)
        async def get_traffic_data():
            if not self.data_storage:
                raise HTTPException(
                    status_code=503,
                    detail="Data storage is not available"
                )
            summary = self.data_storage.get_traffic_summary()
            return APIResponse(
                success=True,
                data=summary
            )

        @self.app.get("/api/v1/cluster/nodes", response_model=APIResponse)
        async def get_cluster_nodes():
            if not self.service_discovery:
                raise HTTPException(
                    status_code=503,
                    detail="Service discovery is not available"
                )
            nodes = await self.service_discovery.discover()
            return APIResponse(
                success=True,
                data={
                    "nodes": [n.to_dict() for n in nodes],
                    "count": len(nodes)
                }
            )

        @self.app.get("/api/v1/cluster/load-balancer", response_model=APIResponse)
        async def get_load_balancer_status():
            if not self.load_balancer:
                raise HTTPException(
                    status_code=503,
                    detail="Load balancer is not available"
                )
            return APIResponse(
                success=True,
                data=self.load_balancer.get_node_stats()
            )

        @self.app.post("/api/v1/cluster/load-balancer/strategy", response_model=APIResponse)
        async def set_load_balancer_strategy(strategy: str):
            if not self.load_balancer:
                raise HTTPException(
                    status_code=503,
                    detail="Load balancer is not available"
                )
            self.load_balancer.set_strategy(strategy)
            return APIResponse(
                success=True,
                message=f"Load balancer strategy set to {strategy}"
            )

        @self.app.get("/api/v1/filter", response_model=APIResponse)
        async def get_filter_status():
            return APIResponse(
                success=True,
                data=self.protocol_filter.get_stats()
            )

        @self.app.get("/api/v1/filter/rules", response_model=APIResponse)
        async def get_filter_rules():
            return APIResponse(
                success=True,
                data={"rules": self.protocol_filter.get_rules()}
            )

        @self.app.post("/api/v1/filter/mode", response_model=APIResponse)
        async def set_filter_mode(mode: str):
            try:
                self.protocol_filter.set_mode(FilterMode(mode))
                return APIResponse(success=True, message=f"Filter mode set to {mode}")
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid mode. Valid: {[m.value for m in FilterMode]}"
                )

        @self.app.post("/api/v1/filter/rules", response_model=APIResponse)
        async def add_filter_rule(
            name: str,
            protocol: Optional[str] = None,
            source_pattern: Optional[str] = None,
            topic_pattern: Optional[str] = None,
            target_pattern: Optional[str] = None,
            payload_field: Optional[str] = None,
            payload_value: Optional[str] = None,
            enabled: bool = True
        ):
            rule = ProtocolFilterRule(
                name=name,
                protocol=ProtocolType(protocol) if protocol else None,
                source_pattern=source_pattern,
                topic_pattern=topic_pattern,
                target_pattern=target_pattern,
                payload_field=payload_field,
                payload_value=payload_value,
                enabled=enabled
            )
            self.protocol_filter.add_rule(rule)
            return APIResponse(success=True, message=f"Filter rule '{name}' added")

        @self.app.delete("/api/v1/filter/rules/{name}", response_model=APIResponse)
        async def delete_filter_rule(name: str):
            if self.protocol_filter.remove_rule(name):
                return APIResponse(success=True, message=f"Filter rule '{name}' deleted")
            raise HTTPException(status_code=404, detail="Filter rule not found")

        @self.app.get("/api/v1/circuit-breakers", response_model=APIResponse)
        async def get_circuit_breakers():
            return APIResponse(
                success=True,
                data={"breakers": self.circuit_breaker_registry.get_all_stats()}
            )

        @self.app.get("/api/v1/circuit-breakers/{name}", response_model=APIResponse)
        async def get_circuit_breaker(name: str):
            cb = self.circuit_breaker_registry.get(name)
            if not cb:
                raise HTTPException(status_code=404, detail="Circuit breaker not found")
            return APIResponse(success=True, data=cb.get_stats())

        @self.app.post("/api/v1/circuit-breakers/{name}/reset", response_model=APIResponse)
        async def reset_circuit_breaker(name: str):
            cb = self.circuit_breaker_registry.get(name)
            if not cb:
                raise HTTPException(status_code=404, detail="Circuit breaker not found")
            cb.reset()
            return APIResponse(success=True, message=f"Circuit breaker '{name}' reset")

        @self.app.get("/api/v1/dynamic-routes", response_model=APIResponse)
        async def get_dynamic_routes():
            return APIResponse(
                success=True,
                data=self.dynamic_router.get_stats()
            )

        @self.app.post("/api/v1/dynamic-routes", response_model=APIResponse)
        async def add_dynamic_route(
            name: str,
            targets: List[str],
            strategy: str = "direct",
            priority: int = 0,
            enabled: bool = True,
            conditions: Optional[List[Dict]] = None
        ):
            parsed_conditions = []
            if conditions:
                for cond in conditions:
                    parsed_conditions.append(DynamicRouteCondition(
                        field=cond.get("field", "source"),
                        match_type=MatchType(cond.get("match_type", "exact")),
                        pattern=cond.get("pattern"),
                        values=cond.get("values")
                    ))
            rule = DynamicRouteRule(
                name=name,
                conditions=parsed_conditions,
                targets=targets,
                strategy=strategy,
                priority=priority,
                enabled=enabled
            )
            self.dynamic_router.add_rule(rule)
            return APIResponse(success=True, message=f"Dynamic route '{name}' added")

        @self.app.delete("/api/v1/dynamic-routes/{name}", response_model=APIResponse)
        async def delete_dynamic_route(name: str):
            if self.dynamic_router.remove_rule(name):
                return APIResponse(success=True, message=f"Dynamic route '{name}' deleted")
            raise HTTPException(status_code=404, detail="Dynamic route not found")

        @self.app.post("/api/v1/dynamic-routes/{name}/targets", response_model=APIResponse)
        async def update_dynamic_route_targets(name: str, targets: List[str]):
            if self.dynamic_router.update_rule_targets(name, targets):
                return APIResponse(success=True, message=f"Route '{name}' targets updated")
            raise HTTPException(status_code=404, detail="Dynamic route not found")

        @self.app.get("/api/v1/data/writer-stats", response_model=APIResponse)
        async def get_writer_stats():
            if not self.data_storage:
                raise HTTPException(status_code=503, detail="Data storage not available")
            return APIResponse(success=True, data=self.data_storage.get_writer_stats())

        @self.app.post("/api/v1/data/flush", response_model=APIResponse)
        async def flush_data():
            if not self.data_storage:
                raise HTTPException(status_code=503, detail="Data storage not available")
            count = self.data_storage.flush()
            return APIResponse(success=True, data={"flushed_records": count})

    def get_app(self) -> FastAPI:
        return self.app
