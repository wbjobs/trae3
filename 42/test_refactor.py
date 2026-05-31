import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core.logger import get_logger
from protocols.models import ProtocolMessage, ProtocolType, MessageType
from protocols.pipeline import (
    ProtocolPipeline, JSONCodec, BinaryCodec, CSVCodec,
    FieldMappingTransformer, TimestampEnricherTransformer,
    ProtocolConverterTransformer, PipelineRegistry
)
from gateway.dynamic_router import DynamicRouter, DynamicRouteRule, DynamicRouteCondition, MatchType
from gateway.protection import (
    ProtocolFilter, FilterMode, ProtocolFilterRule,
    CircuitBreaker, CircuitBreakerRegistry, CircuitState
)
from gateway.router import MessageRouter, RouteRule, RouteStrategy

logger = get_logger(__name__)


async def test_pipeline():
    logger.info("=== Testing Protocol Pipeline ===")

    pipeline = ProtocolPipeline("test_pipeline", JSONCodec())
    pipeline.add_transformer(TimestampEnricherTransformer())
    pipeline.add_transformer(FieldMappingTransformer({"temp": "temperature", "hum": "humidity"}))
    pipeline.add_stage("validate", lambda msg: msg)

    raw = b'{"temp": 25.5, "hum": 60}'
    message = pipeline.process_inbound(raw)

    assert message is not None, "Pipeline inbound failed"
    assert "temperature" in message.payload, f"Field mapping failed: {message.payload}"
    assert message.payload["temperature"] == 25.5
    assert "_ingest_timestamp" in message.payload
    logger.info(f"Pipeline inbound result: {message.payload}")

    outbound = pipeline.process_outbound(message)
    assert outbound is not None, "Pipeline outbound failed"
    logger.info("✓ Pipeline test passed")


async def test_codec_system():
    logger.info("\n=== Testing Codec System ===")

    json_codec = JSONCodec()
    data = {"key": "value", "num": 42}
    encoded = json_codec.encode(data)
    decoded = json_codec.decode(encoded)
    assert decoded == data, f"JSON codec roundtrip failed: {decoded}"

    binary_codec = BinaryCodec("!II", ["value1", "value2"])
    bdata = {"value1": 100, "value2": 200}
    bencoded = binary_codec.encode(bdata)
    bdecoded = binary_codec.decode(bencoded)
    assert bdecoded["value1"] == 100, f"Binary codec failed: {bdecoded}"

    csv_codec = CSVCodec(",", ["name", "age"])
    cdata = {"name": "test", "age": "25"}
    cencoded = csv_codec.encode(cdata)
    cdecoded = csv_codec.decode(cencoded)
    assert cdecoded["name"] == "test", f"CSV codec failed: {cdecoded}"

    logger.info("✓ Codec system test passed")


async def test_protocol_converter():
    logger.info("\n=== Testing Protocol Converter Transformer ===")

    converter = ProtocolConverterTransformer(ProtocolType.SERIAL, ProtocolType.MQTT)
    msg = ProtocolMessage(protocol=ProtocolType.SERIAL, source="serial1", payload={"data": 123})

    converted = converter.transform(msg)
    assert converted.protocol == ProtocolType.MQTT, f"Protocol conversion failed: {converted.protocol}"
    assert converted.topic is not None, "MQTT topic should be auto-set"
    logger.info(f"Converted: {converted.protocol}, topic: {converted.topic}")

    reverted = converter.reverse_transform(converted)
    assert reverted.protocol == ProtocolType.SERIAL, f"Reverse conversion failed: {reverted.protocol}"
    logger.info("✓ Protocol converter test passed")


async def test_pipeline_registry():
    logger.info("\n=== Testing Pipeline Registry ===")

    registry = PipelineRegistry()
    p1 = ProtocolPipeline("serial", BinaryCodec("!I"))
    p2 = ProtocolPipeline("mqtt", JSONCodec())
    registry.register(p1)
    registry.register(p2)

    found = registry.get_pipeline_for_protocol(ProtocolType.MQTT)
    assert found is not None, "Should find MQTT pipeline"
    assert found.name == "mqtt"

    info = registry.list_pipelines()
    assert "serial" in info
    assert "mqtt" in info
    logger.info(f"Registry: {list(info.keys())}")
    logger.info("✓ Pipeline registry test passed")


async def test_dynamic_router():
    logger.info("\n=== Testing Dynamic Router ===")

    router = DynamicRouter()
    handler_results = {}
    def create_handler(name):
        async def handler(msg):
            handler_results[name] = handler_results.get(name, 0) + 1
            return True
        return handler

    router.register_handler("mqtt1", create_handler("mqtt1"))
    router.register_handler("http1", create_handler("http1"))

    rule = DynamicRouteRule(
        name="serial_to_mqtt",
        conditions=[DynamicRouteCondition("protocol", MatchType.EXACT, values=["serial"])],
        targets=["mqtt1"],
        priority=10
    )
    router.add_rule(rule)

    msg = ProtocolMessage(protocol=ProtocolType.SERIAL, source="sensor1", payload={"t": 25})
    result = await router.route(msg)
    logger.info(f"Dynamic route result: {result}")
    assert handler_results.get("mqtt1", 0) == 1
    logger.info("✓ Dynamic router test passed")


async def test_protocol_filter():
    logger.info("\n=== Testing Protocol Filter (Blacklist/Whitelist) ===")

    pf = ProtocolFilter(FilterMode.BLACKLIST)
    pf.add_rule(ProtocolFilterRule(
        name="block_unknown",
        source_pattern="unknown*"
    ))
    pf.add_rule(ProtocolFilterRule(
        name="block_debug_topic",
        topic_pattern="*/debug"
    ))

    allowed_msg = ProtocolMessage(protocol=ProtocolType.MQTT, source="sensor1", topic="device/data", payload={})
    blocked_msg = ProtocolMessage(protocol=ProtocolType.MQTT, source="unknown_device", topic="device/data", payload={})
    blocked_topic_msg = ProtocolMessage(protocol=ProtocolType.MQTT, source="sensor1", topic="device/debug", payload={})

    assert pf.allow(allowed_msg) is True, "Should allow normal message"
    assert pf.allow(blocked_msg) is False, "Should block unknown source"
    assert pf.allow(blocked_topic_msg) is False, "Should block debug topic"

    pf.remove_rule("block_unknown")
    pf.remove_rule("block_debug_topic")
    pf.set_mode(FilterMode.WHITELIST)
    pf.add_rule(ProtocolFilterRule(name="allow_sensors", source_pattern="sensor*"))

    assert pf.allow(allowed_msg) is True, "Should allow whitelisted source"
    assert pf.allow(blocked_msg) is False, "Should block non-whitelisted"

    stats = pf.get_stats()
    logger.info(f"Filter stats: {stats}")
    logger.info("✓ Protocol filter test passed")


async def test_circuit_breaker():
    logger.info("\n=== Testing Circuit Breaker ===")

    cb = CircuitBreaker("test_adapter", failure_threshold=3, recovery_timeout=0.5)

    assert cb.state == CircuitState.CLOSED, "Should start CLOSED"

    cb.record_failure()
    cb.record_failure()
    assert cb.state == CircuitState.CLOSED, "Should still be CLOSED (2 < 3)"

    cb.record_failure()
    assert cb.state == CircuitState.OPEN, "Should be OPEN after 3 failures"

    assert cb.allow_request() is False, "Should reject when OPEN"

    await asyncio.sleep(0.6)

    assert cb.state == CircuitState.HALF_OPEN, "Should be HALF_OPEN after recovery timeout"
    assert cb.allow_request() is True, "Should allow in HALF_OPEN"

    cb.record_success()
    cb.record_success()
    cb.record_success()
    assert cb.state == CircuitState.CLOSED, "Should be CLOSED after 3 successes"

    stats = cb.get_stats()
    logger.info(f"Circuit breaker stats: {stats}")
    logger.info("✓ Circuit breaker test passed")


async def test_circuit_breaker_registry():
    logger.info("\n=== Testing Circuit Breaker Registry ===")

    registry = CircuitBreakerRegistry()
    cb1 = registry.get_or_create("adapter1", failure_threshold=5)
    cb2 = registry.get_or_create("adapter2", failure_threshold=10)

    assert registry.get("adapter1") is cb1
    assert registry.get("adapter2") is cb2

    all_stats = registry.get_all_stats()
    assert "adapter1" in all_stats
    assert "adapter2" in all_stats
    logger.info(f"Registry stats: {list(all_stats.keys())}")
    logger.info("✓ Circuit breaker registry test passed")


async def main():
    logger.info("Starting refactoring verification tests...\n")

    try:
        await test_pipeline()
        await test_codec_system()
        await test_protocol_converter()
        await test_pipeline_registry()
        await test_dynamic_router()
        await test_protocol_filter()
        await test_circuit_breaker()
        await test_circuit_breaker_registry()

        logger.info("\n" + "="*50)
        logger.info("ALL TESTS PASSED! ✓")
        logger.info("="*50)

    except AssertionError as e:
        logger.error(f"Test failed: {e}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Test error: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
