import asyncio
import signal
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
import uvicorn

sys.path.insert(0, '.')

from core import get_config, get_logger, load_config
from protocols import ProtocolManager
from gateway import MessageRouter, GatewayAPI
from stats import TrafficMonitor
from storage import DataStorage
from cluster import ServiceDiscovery, LoadBalancer, LoadBalanceStrategy

logger = get_logger(__name__)


class GatewayApplication:
    def __init__(self):
        self.config = load_config()
        self.protocol_manager: ProtocolManager = None
        self.message_router: MessageRouter = None
        self.traffic_monitor: TrafficMonitor = None
        self.data_storage: DataStorage = None
        self.service_discovery: ServiceDiscovery = None
        self.load_balancer: LoadBalancer = None
        self.gateway_api: GatewayAPI = None
        self._shutdown_event = asyncio.Event()

    async def initialize(self):
        logger.info("Initializing Gateway Application...")

        self.data_storage = DataStorage()
        logger.info("Data storage initialized")

        self.traffic_monitor = TrafficMonitor()
        await self.traffic_monitor.start()
        logger.info("Traffic monitor started")

        self.protocol_manager = ProtocolManager()
        await self.protocol_manager.initialize()
        self.protocol_manager.on_message(self._on_protocol_message)
        logger.info("Protocol manager initialized")

        self.message_router = MessageRouter()
        self._setup_default_routes()
        logger.info("Message router initialized")

        if self.config.cluster.enabled:
            self.service_discovery = ServiceDiscovery()
            await self.service_discovery.initialize()
            await self.service_discovery.register()
            await self.service_discovery.start_heartbeat()

            self.load_balancer = LoadBalancer(LoadBalanceStrategy.ROUND_ROBIN)
            self.service_discovery.add_watcher(self.load_balancer.update_nodes)
            await self.service_discovery.discover()

            logger.info("Cluster mode enabled")
        else:
            logger.info("Cluster mode disabled, running in standalone mode")

        self.gateway_api = GatewayAPI(
            protocol_manager=self.protocol_manager,
            message_router=self.message_router,
            traffic_monitor=self.traffic_monitor,
            data_storage=self.data_storage,
            service_discovery=self.service_discovery,
            load_balancer=self.load_balancer
        )
        logger.info("Gateway API initialized")

        logger.info("Gateway Application initialized successfully")

    def _setup_default_routes(self):
        def create_route_handler(adapter: str):
            async def route_to_adapter(message):
                return await self.protocol_manager.send(adapter, message)
            return route_to_adapter

        for adapter_name in self.protocol_manager.adapters.keys():
            handler = create_route_handler(adapter_name)
            self.message_router.register_target_handler(adapter_name, handler)

    def _on_protocol_message(self, message):
        if self.traffic_monitor:
            self.traffic_monitor.record_message(message, success=True)

        if self.data_storage:
            self.data_storage.save_message(message)

        asyncio.create_task(self.message_router.route(message))

    def get_app(self) -> FastAPI:
        return self.gateway_api.get_app()

    async def shutdown(self):
        logger.info("Shutting down Gateway Application...")

        if self.traffic_monitor:
            await self.traffic_monitor.stop()
            logger.info("Traffic monitor stopped")

        if self.protocol_manager:
            await self.protocol_manager.shutdown()
            logger.info("Protocol manager shutdown")

        if self.service_discovery:
            await self.service_discovery.stop()
            logger.info("Service discovery stopped")

        if self.data_storage:
            self.data_storage.close()
            logger.info("Data storage closed")

        logger.info("Gateway Application shutdown complete")


@asynccontextmanager
async def lifespan(app: FastAPI):
    gateway_app = GatewayApplication()
    await gateway_app.initialize()
    yield
    await gateway_app.shutdown()


def create_app() -> FastAPI:
    gateway_app = GatewayApplication()

    async def _lifespan(app: FastAPI):
        await gateway_app.initialize()
        yield
        await gateway_app.shutdown()

    app = gateway_app.get_app()
    app.router.lifespan_context = _lifespan
    return app


async def run_server():
    config = get_config()
    app = create_app()

    config = uvicorn.Config(
        app,
        host=config.server.host,
        port=config.server.port,
        log_level="info"
    )
    server = uvicorn.Server(config)

    logger.info(f"Starting server on {config.host}:{config.port}")
    await server.serve()


def main():
    try:
        asyncio.run(run_server())
    except KeyboardInterrupt:
        logger.info("Received shutdown signal")
    except Exception as e:
        logger.error(f"Server error: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
