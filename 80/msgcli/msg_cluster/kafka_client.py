import json
import time
from typing import List, Dict, Any, Optional, Callable
from kafka import KafkaProducer, KafkaConsumer, KafkaAdminClient, TopicPartition
from kafka.admin import NewTopic
from kafka.errors import KafkaError, TopicAlreadyExistsError, KafkaTimeoutError

from ..common import get_logger, load_config


class KafkaClient:
    def __init__(self, max_retries: int = 3, retry_delay: float = 1.0):
        config = load_config()
        self.kafka_config = config.kafka
        self.logger = get_logger("KafkaClient")
        self.producer = None
        self.consumer = None
        self.admin_client = None
        self.max_retries = max_retries
        self.retry_delay = retry_delay

    def _retry_on_failure(self, func: Callable, *args, **kwargs) -> Any:
        last_exception = None
        for attempt in range(self.max_retries):
            try:
                return func(*args, **kwargs)
            except (KafkaError, KafkaTimeoutError, ConnectionError) as e:
                last_exception = e
                if attempt < self.max_retries - 1:
                    self.logger.warning(
                        f"Operation failed (attempt {attempt + 1}/{self.max_retries}): {e}. "
                        f"Retrying in {self.retry_delay}s..."
                    )
                    time.sleep(self.retry_delay)
                else:
                    self.logger.error(f"Operation failed after {self.max_retries} attempts: {e}")
        raise last_exception

    def connect_producer(self) -> bool:
        try:
            self.producer = KafkaProducer(
                bootstrap_servers=self.kafka_config.bootstrap_servers,
                value_serializer=lambda v: json.dumps(v, ensure_ascii=False).encode('utf-8'),
                key_serializer=lambda k: k.encode('utf-8') if k else None,
                acks='all',
                retries=5,
                request_timeout_ms=30000,
                max_block_ms=60000,
                compression_type='gzip',
            )
            self.logger.info("Kafka producer connected successfully")
            return True
        except KafkaError as e:
            self.logger.error(f"Failed to connect Kafka producer: {e}")
            return False

    def connect_consumer(self, topic: str, group_id: Optional[str] = None, 
                         enable_auto_commit: bool = True) -> bool:
        try:
            self.consumer = KafkaConsumer(
                bootstrap_servers=self.kafka_config.bootstrap_servers,
                group_id=group_id or self.kafka_config.group_id,
                auto_offset_reset=self.kafka_config.auto_offset_reset,
                enable_auto_commit=enable_auto_commit,
                value_deserializer=lambda m: json.loads(m.decode('utf-8')),
                consumer_timeout_ms=30000,
                session_timeout_ms=30000,
                heartbeat_interval_ms=10000,
            )
            if topic:
                self.consumer.subscribe([topic])
            self.logger.info(f"Kafka consumer connected to topic {topic}")
            return True
        except KafkaError as e:
            self.logger.error(f"Failed to connect Kafka consumer: {e}")
            return False

    def connect_admin(self) -> bool:
        try:
            self.admin_client = KafkaAdminClient(
                bootstrap_servers=self.kafka_config.bootstrap_servers,
                api_version_auto_timeout_ms=10000,
                request_timeout_ms=30000,
            )
            self.logger.info("Kafka admin client connected successfully")
            return True
        except KafkaError as e:
            self.logger.error(f"Failed to connect Kafka admin: {e}")
            return False

    def send_message(self, topic: str, message: Dict[str, Any], key: Optional[str] = None) -> bool:
        if not self.producer:
            if not self.connect_producer():
                return False
        
        try:
            def _send():
                future = self.producer.send(topic, value=message, key=key)
                future.get(timeout=30)
                return True
            
            return self._retry_on_failure(_send)
        except Exception as e:
            self.logger.error(f"Failed to send message to {topic} after retries: {e}")
            return False

    def consume_messages(self, topic: str, callback: Callable[[Dict[str, Any], Dict[str, Any]], None], 
                         max_messages: int = 0, timeout_ms: int = 30000,
                         include_metadata: bool = False) -> int:
        if not self.consumer:
            if not self.connect_consumer(topic, enable_auto_commit=False):
                return 0
        
        count = 0
        last_commit_time = time.time()
        commit_interval = 5000
        
        try:
            start_time = time.time() * 1000
            for message in self.consumer:
                try:
                    if include_metadata:
                        metadata = {
                            'topic': message.topic,
                            'partition': message.partition,
                            'offset': message.offset,
                            'key': message.key.decode('utf-8') if message.key else None,
                            'timestamp': message.timestamp,
                            'timestamp_type': message.timestamp_type,
                        }
                        callback(message.value, metadata)
                    else:
                        callback(message.value, {})
                    
                    count += 1
                    
                    current_time = time.time() * 1000
                    if current_time - last_commit_time > commit_interval:
                        self.consumer.commit()
                        last_commit_time = current_time
                    
                    if max_messages > 0 and count >= max_messages:
                        self.consumer.commit()
                        break
                    
                    if timeout_ms > 0 and (time.time() * 1000 - start_time) > timeout_ms:
                        self.consumer.commit()
                        break
                        
                except json.JSONDecodeError as e:
                    self.logger.warning(f"Failed to decode message at offset {message.offset}: {e}")
                    continue
                except Exception as e:
                    self.logger.error(f"Error processing message at offset {message.offset}: {e}")
                    continue
                    
        except KafkaError as e:
            self.logger.error(f"Error consuming messages: {e}")
        finally:
            try:
                self.consumer.commit()
            except Exception:
                pass
            self.consumer.close()
        
        self.logger.info(f"Consumed {count} messages from {topic}")
        return count

    def seek_to_beginning(self, topic: str):
        if not self.consumer:
            self.connect_consumer(topic, enable_auto_commit=False)
        
        self.consumer.poll(0)
        partitions = self.consumer.assignment()
        for tp in partitions:
            self.consumer.seek_to_beginning(tp)

    def seek_to_timestamp(self, topic: str, timestamp: int):
        if not self.consumer:
            self.connect_consumer(topic, enable_auto_commit=False)
        
        self.consumer.poll(0)
        partitions = self.consumer.assignment()
        timestamps = {tp: timestamp for tp in partitions}
        offsets = self.consumer.offsets_for_times(timestamps)
        
        for tp, offset_info in offsets.items():
            if offset_info:
                self.consumer.seek(tp, offset_info.offset)

    def list_topics(self) -> List[str]:
        if not self.admin_client:
            if not self.connect_admin():
                return []
        
        try:
            topics = self.admin_client.list_topics()
            return sorted(list(topics))
        except KafkaError as e:
            self.logger.error(f"Failed to list topics: {e}")
            return []

    def create_topic(self, topic_name: str, num_partitions: int = 3, 
                     replication_factor: int = 1, config: Optional[Dict[str, Any]] = None) -> bool:
        if not self.admin_client:
            if not self.connect_admin():
                return False
        
        try:
            topic = NewTopic(
                name=topic_name,
                num_partitions=num_partitions,
                replication_factor=replication_factor,
                topic_configs=config or {},
            )
            self.admin_client.create_topics([topic])
            self.logger.info(f"Topic {topic_name} created successfully")
            return True
        except TopicAlreadyExistsError:
            self.logger.warning(f"Topic {topic_name} already exists")
            return True
        except KafkaError as e:
            self.logger.error(f"Failed to create topic {topic_name}: {e}")
            return False

    def delete_topic(self, topic_name: str) -> bool:
        if not self.admin_client:
            if not self.connect_admin():
                return False
        
        try:
            self.admin_client.delete_topics([topic_name])
            self.logger.info(f"Topic {topic_name} deleted successfully")
            return True
        except KafkaError as e:
            self.logger.error(f"Failed to delete topic {topic_name}: {e}")
            return False

    def get_topic_config(self, topic_name: str) -> Optional[Dict[str, Any]]:
        if not self.admin_client:
            if not self.connect_admin():
                return None
        
        try:
            configs = self.admin_client.describe_configs(
                resources=[(topic_name, "TOPIC")]
            )
            return {str(k): str(v) for k, v in configs.items()}
        except KafkaError as e:
            self.logger.error(f"Failed to get topic config {topic_name}: {e}")
            return None

    def get_consumer_groups(self) -> List[str]:
        if not self.admin_client:
            if not self.connect_admin():
                return []
        
        try:
            groups = self.admin_client.list_consumer_groups()
            return [group[0] for group in groups]
        except KafkaError as e:
            self.logger.error(f"Failed to list consumer groups: {e}")
            return []

    def get_consumer_group_lag(self, group_id: str) -> Dict[str, Any]:
        if not self.admin_client:
            if not self.connect_admin():
                return {}
        
        try:
            offsets = self.admin_client.list_consumer_group_offsets(group_id)
            result = {}
            for (topic, partition), offset_info in offsets.items():
                result[f"{topic}-{partition}"] = {
                    "offset": offset_info.offset,
                    "metadata": offset_info.metadata,
                }
            return result
        except KafkaError as e:
            self.logger.error(f"Failed to get consumer group lag for {group_id}: {e}")
            return {}

    def close(self):
        if self.producer:
            self.producer.close()
        if self.consumer:
            self.consumer.close()
        if self.admin_client:
            self.admin_client.close()
        self.logger.info("Kafka client closed")
