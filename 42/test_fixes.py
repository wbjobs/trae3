import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core.logger import get_logger
from protocols.models import ProtocolMessage, ProtocolType, MessageType
from gateway.router import MessageRouter, RouteRule, RouteStrategy

logger = get_logger(__name__)


async def test_protocol_message():
    logger.info("=== Testing Protocol Message (Parameter Loss Fix) ===")
    
    message = ProtocolMessage(
        protocol=ProtocolType.MQTT,
        source="test",
        payload={"test": "value", "number": 42}
    )
    
    logger.info(f"Created message: {message.message_id}")
    logger.info(f"Protocol: {message.protocol}")
    logger.info(f"Payload: {message.payload}")
    logger.info(f"Raw data type: {type(message.raw_data)}")
    
    message_dict = message.to_dict()
    logger.info(f"Serialized to dict: {list(message_dict.keys())}")
    
    restored = ProtocolMessage.from_dict(message_dict)
    logger.info(f"Restored message ID: {restored.message_id}")
    
    assert message.message_id == restored.message_id, "Message ID mismatch after serialization"
    assert message.payload == restored.payload, "Payload mismatch after serialization"
    logger.info("✓ Protocol message serialization test passed")


async def test_router_thread_safety():
    logger.info("\n=== Testing Router Thread Safety (Routing Fix) ===")
    
    router = MessageRouter()
    
    handler_results = {}
    def create_handler(name):
        async def handler(message):
            handler_results[name] = handler_results.get(name, 0) + 1
            return True
        return handler
    
    router.register_target_handler("mqtt1", create_handler("mqtt1"))
    router.register_target_handler("mqtt2", create_handler("mqtt2"))
    router.register_target_handler("http1", create_handler("http1"))
    
    rule = RouteRule(
        name="test_round_robin",
        source="test",
        targets=["mqtt1", "mqtt2", "http1"],
        strategy=RouteStrategy.ROUND_ROBIN
    )
    router.add_rule(rule)
    
    test_message = ProtocolMessage(
        protocol=ProtocolType.MQTT,
        source="test",
        payload={"test": "data"}
    )
    
    results = []
    for i in range(9):
        result = await router.route(test_message)
        results.append(list(result.keys()))
        await asyncio.sleep(0.01)
    
    logger.info(f"Routing results: {results}")
    
    targets_used = [r[0].split(':')[1] for r in results]
    logger.info(f"Target distribution: {targets_used}")
    
    mqtt1_count = handler_results.get("mqtt1", 0)
    mqtt2_count = handler_results.get("mqtt2", 0)
    http1_count = handler_results.get("http1", 0)
    
    logger.info(f"mqtt1: {mqtt1_count}, mqtt2: {mqtt2_count}, http1: {http1_count}")
    
    assert mqtt1_count == 3, f"Expected mqtt1 to be called 3 times, got {mqtt1_count}"
    assert mqtt2_count == 3, f"Expected mqtt2 to be called 3 times, got {mqtt2_count}"
    assert http1_count == 3, f"Expected http1 to be called 3 times, got {http1_count}"
    logger.info("✓ Round-robin routing test passed")


def test_log_filtering():
    logger.info("\n=== Testing Log Filtering (Redundancy Fix) ===")
    
    from core.logger import RedactingFilter
    
    filter_obj = RedactingFilter()
    
    test_messages = [
        ('User password=secret123 logged in', '[REDACTED]'),
        ('secret=my_secret_key here', '[REDACTED]'),
        ('Token=abc123xyz now', '[REDACTED]'),
    ]
    
    class FakeRecord:
        def __init__(self, msg):
            self.msg = msg
            self.args = ()
            self.levelno = 20
    
    for input_msg, expected in test_messages:
        record = FakeRecord(input_msg)
        filter_obj.filter(record)
        logger.info(f"Input: {input_msg}")
        logger.info(f"Output: {record.msg}")
        assert expected in record.msg, f"Expected '{expected}' in output"
    
    logger.info("✓ Log filtering test passed")


async def main():
    logger.info("Starting fix verification tests...\n")
    
    try:
        await test_protocol_message()
        await test_router_thread_safety()
        test_log_filtering()
        
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
