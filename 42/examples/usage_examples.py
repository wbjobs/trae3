import asyncio
import sys
sys.path.insert(0, '.')

from core import get_logger
from protocols import (
    ProtocolMessage,
    ProtocolType,
    MessageType,
    MQTTProtocolConfig,
    SerialProtocolConfig,
    HTTPProtocolConfig,
    MQTTAdapter,
    SerialAdapter,
    HTTPAdapter,
    ProtocolManager
)
from gateway import MessageRouter, RouteRule, RouteStrategy
from storage import DataStorage

logger = get_logger(__name__)


async def example_protocol_manager():
    logger.info("=== Protocol Manager Example ===")

    manager = ProtocolManager()

    mqtt_config = MQTTProtocolConfig(
        name="mqtt_example",
        host="localhost",
        port=1883,
        topics=["device/+/data", "device/+/status"]
    )
    mqtt_adapter = await manager.add_mqtt_adapter(mqtt_config)

    serial_config = SerialProtocolConfig(
        name="serial_example",
        port="COM1",
        baudrate=9600
    )
    serial_adapter = await manager.add_serial_adapter(serial_config)

    http_config = HTTPProtocolConfig(
        name="http_example",
        base_url="http://api.example.com"
    )
    http_adapter = await manager.add_http_adapter(http_config)

    def on_message(message):
        logger.info(f"Received message: {message.source} -> {message.payload}")

    manager.on_message(on_message)

    test_message = ProtocolMessage(
        protocol=ProtocolType.MQTT,
        message_type=MessageType.DATA,
        source="test",
        topic="device/test/data",
        payload={"temperature": 25.5, "humidity": 60}
    )
    if mqtt_adapter:
        await manager.send("mqtt_example", test_message)

    await asyncio.sleep(2)
    await manager.shutdown()
    logger.info("=== Protocol Manager Example Complete ===")


async def example_message_router():
    logger.info("=== Message Router Example ===")

    router = MessageRouter()

    async def mqtt_handler(message):
        logger.info(f"MQTT Handler: {message.payload}")
        return True

    async def http_handler(message):
        logger.info(f"HTTP Handler: {message.payload}")
        return True

    router.register_target_handler("mqtt_broker", mqtt_handler)
    router.register_target_handler("http_service", http_handler)

    rule1 = RouteRule(
        name="all_to_mqtt",
        source="*",
        targets=["mqtt_broker"],
        strategy=RouteStrategy.DIRECT
    )
    router.add_rule(rule1)

    rule2 = RouteRule(
        name="serial_http_round_robin",
        source="serial1",
        targets=["mqtt_broker", "http_service"],
        strategy=RouteStrategy.ROUND_ROBIN
    )
    router.add_rule(rule2)

    test_message = ProtocolMessage(
        protocol=ProtocolType.SERIAL,
        message_type=MessageType.DATA,
        source="serial1",
        payload={"device_id": "sensor001", "value": 42}
    )

    for i in range(5):
        results = await router.route(test_message)
        logger.info(f"Route {i+1} results: {results}")
        await asyncio.sleep(0.5)

    logger.info("=== Message Router Example Complete ===")


async def example_data_storage():
    logger.info("=== Data Storage Example ===")

    storage = DataStorage()

    test_message = ProtocolMessage(
        protocol=ProtocolType.MQTT,
        message_type=MessageType.DATA,
        source="mqtt_broker",
        topic="device/sensor1/data",
        payload={"temperature": 25.5, "humidity": 60}
    )

    if storage.save_message(test_message):
        logger.info("Message saved successfully")

    messages = storage.get_messages(protocol="mqtt", limit=10)
    logger.info(f"Retrieved {len(messages)} messages from database")

    count = storage.get_message_count()
    logger.info(f"Total messages in database: {count}")

    storage.record_traffic("mqtt", "sensor1", 1024, 5)

    summary = storage.get_traffic_summary()
    logger.info(f"Traffic summary: {summary}")

    storage.close()
    logger.info("=== Data Storage Example Complete ===")


async def main():
    try:
        await example_protocol_manager()
        print("\n" + "="*50 + "\n")
        await example_message_router()
        print("\n" + "="*50 + "\n")
        await example_data_storage()
    except Exception as e:
        logger.error(f"Example error: {e}", exc_info=True)


if __name__ == "__main__":
    asyncio.run(main())
