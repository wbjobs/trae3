import os
import sys
import tempfile
import json
from pathlib import Path
from datetime import datetime
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.core.engine import Command, CommandRegistry, CommandStatus, command, register_command
from src.core.executor import BatchExecutor, ProgressBar, CircuitBreaker
from src.core.retry import (
    RetryPolicy, RetryExecutor, BackoffStrategy,
    DeadLetterQueue, retry
)
from src.core.cache import LRUCache, ConfigCache, ConfigDBClient
from src.core.canary import (
    CanaryReleaseManager, CanaryStatus, CanaryStrategy,
    build_ip_whitelist_rule, build_label_rule, build_header_rule
)
from src.core.audit import AuditLogger, OperationType, AuditLogEntry, get_audit_logger


class TestCommandEngine:
    def test_command_base_class(self):
        class TestCommand(Command):
            name = "test"
            def execute(self, **kwargs):
                return "success"
        
        cmd = TestCommand()
        context = cmd.run()
        assert context.status == CommandStatus.COMPLETED
        assert context.result == "success"
    
    def test_command_registry(self):
        @command(name="greet", description="Greet someone", category="test")
        class GreetCommand(Command):
            def execute(self, username="world", **kwargs):
                return f"Hello, {username}!"
        
        registry = CommandRegistry()
        registry.register(GreetCommand)
        
        assert "greet" in registry.list_commands()
        
        context = registry.execute("greet", username="Test")
        assert context.result == "Hello, Test!"
    
    def test_command_error_handling(self):
        class ErrorCommand(Command):
            name = "error"
            def execute(self, **kwargs):
                raise ValueError("Test error")
        
        cmd = ErrorCommand()
        with pytest.raises(ValueError):
            cmd.run()
        
        assert cmd.context.status == CommandStatus.FAILED
        assert cmd.context.error is not None


class TestBatchExecutor:
    def test_batch_executor_basic(self):
        executor = BatchExecutor(max_workers=2, show_progress=False)
        
        def task_func(task):
            return task["value"] + 1
        
        tasks = [
            {"id": f"task_{i}", "value": i}
            for i in range(5)
        ]
        
        results = executor.execute(tasks, task_func)
        assert len(results) == 5
        assert all(r.success for r in results)
    
    def test_progress_bar(self):
        pb = ProgressBar(total=100, width=50)
        pb.update(50)
        assert pb.current == 50
        pb.update(100)
        assert pb.current == 100
    
    def test_circuit_breaker(self):
        breaker = CircuitBreaker(failure_threshold=2, recovery_timeout=1)
        
        def failing_func():
            raise ValueError("Fail")
        
        with pytest.raises(ValueError):
            breaker.call(failing_func)
        
        with pytest.raises(ValueError):
            breaker.call(failing_func)
        
        with pytest.raises(RuntimeError, match="Circuit breaker is OPEN"):
            breaker.call(failing_func)


class TestRetryPolicy:
    def test_fixed_backoff(self):
        policy = RetryPolicy(
            max_attempts=3,
            backoff_strategy=BackoffStrategy.FIXED,
            initial_delay=1.0
        )
        
        assert policy.calculate_delay(1) == 1.0
        assert policy.calculate_delay(2) == 1.0
    
    def test_exponential_backoff(self):
        policy = RetryPolicy(
            max_attempts=5,
            backoff_strategy=BackoffStrategy.EXPONENTIAL,
            initial_delay=1.0,
            multiplier=2.0
        )
        
        assert policy.calculate_delay(1) == 1.0
        assert policy.calculate_delay(2) == 2.0
        assert policy.calculate_delay(3) == 4.0
    
    def test_retry_decorator(self):
        call_count = {"count": 0}
        
        @retry(max_attempts=3, initial_delay=0.1)
        def flaky_func():
            call_count["count"] += 1
            if call_count["count"] < 3:
                raise ValueError("Temporary error")
            return "success"
        
        result = flaky_func()
        assert result == "success"
        assert call_count["count"] == 3
    
    def test_dead_letter_queue(self):
        dlq = DeadLetterQueue(max_size=10)
        
        def failed_func():
            raise ValueError("Error")
        
        try:
            failed_func()
        except Exception as e:
            dlq.add("task_1", failed_func, (), {}, e)
        
        assert dlq.size() == 1
        
        failed = dlq.get_failed_tasks()
        assert len(failed) == 1
        assert failed[0]["task_id"] == "task_1"
        
        dlq.clear()
        assert dlq.size() == 0


class TestLRUCache:
    def test_basic_operations(self):
        cache = LRUCache(max_size=3)
        
        cache.put("a", 1)
        cache.put("b", 2)
        cache.put("c", 3)
        
        assert cache.get("a") == 1
        assert cache.get("b") == 2
        assert cache.get("c") == 3
    
    def test_eviction(self):
        cache = LRUCache(max_size=2)
        
        cache.put("a", 1)
        cache.put("b", 2)
        cache.put("c", 3)
        
        assert cache.get("a") is None
        assert cache.get("b") == 2
        assert cache.get("c") == 3
    
    def test_lru_order(self):
        cache = LRUCache(max_size=2)
        
        cache.put("a", 1)
        cache.put("b", 2)
        cache.get("a")
        cache.put("c", 3)
        
        assert cache.get("a") == 1
        assert cache.get("b") is None
        assert cache.get("c") == 3


class TestCanaryRelease:
    def test_create_release(self):
        manager = CanaryReleaseManager()
        
        release = manager.create_release(
            data_id="test-config",
            group="DEFAULT_GROUP",
            namespace="",
            cluster="dev",
            new_content="new: value",
            old_content="old: value",
            config_type="yaml",
            traffic_percentage=20
        )
        
        assert release.release_id.startswith("canary_")
        assert release.data_id == "test-config"
        assert release.status == CanaryStatus.DRAFT
        assert release.traffic_percentage == 20
    
    def test_start_and_pause_release(self):
        manager = CanaryReleaseManager()
        
        release = manager.create_release(
            data_id="test-config",
            group="DEFAULT_GROUP",
            namespace="",
            cluster="dev",
            new_content="new: value",
            traffic_percentage=50
        )
        
        manager.start_release(release.release_id)
        assert release.status == CanaryStatus.ACTIVE
        
        manager.pause_release(release.release_id)
        assert release.status == CanaryStatus.PAUSED
    
    def test_ip_whitelist_rule(self):
        rule = build_ip_whitelist_rule(["192.168.1.1", "10.0.0.0/24"])
        assert rule.strategy == CanaryStrategy.IP_WHITELIST
        assert "192.168.1.1" in rule.value
    
    def test_label_rule(self):
        rule = build_label_rule({"env": "test", "version": "v1"})
        assert rule.strategy == CanaryStrategy.LABEL_MATCH
        assert rule.value["env"] == "test"
    
    def test_header_rule(self):
        rule = build_header_rule({"X-Canary": "true"})
        assert rule.strategy == CanaryStrategy.HEADER_MATCH
        assert rule.value["X-Canary"] == "true"
    
    def test_traffic_percentage(self):
        manager = CanaryReleaseManager()
        
        release = manager.create_release(
            data_id="test-config",
            group="DEFAULT_GROUP",
            namespace="",
            cluster="dev",
            new_content="new: value",
            old_content="old: value",
            traffic_percentage=100
        )
        
        manager.start_release(release.release_id)
        
        result = manager.get_config_for_request(release.release_id, client_ip="1.2.3.4")
        assert result == "new: value"


class TestAuditLogger:
    def test_audit_log_creation(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "audit.db")
            logger = AuditLogger(db_path)
            
            entry = AuditLogEntry(
                operation=OperationType.CREATE,
                operator="test_user",
                cluster="dev",
                namespace="",
                group_name="DEFAULT_GROUP",
                data_id="test-config",
                new_value="test content"
            )
            
            logger.log(entry)
            
            logs = logger.query(cluster="dev")
            assert len(logs) == 1
            assert logs[0]["operation"] == "create"
            assert logs[0]["operator"] == "test_user"
    
    def test_audit_log_query_filters(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "audit.db")
            logger = AuditLogger(db_path)
            
            for i in range(5):
                entry = AuditLogEntry(
                    operation=OperationType.UPDATE,
                    operator=f"user_{i}",
                    cluster="dev" if i < 3 else "prod",
                    data_id=f"config_{i}"
                )
                logger.log(entry)
            
            dev_logs = logger.query(cluster="dev")
            assert len(dev_logs) == 3
            
            all_logs = logger.query(limit=10)
            assert len(all_logs) == 5
    
    def test_audit_log_export(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "audit.db")
            logger = AuditLogger(db_path)
            
            entry = AuditLogEntry(
                operation=OperationType.DELETE,
                operator="test_user",
                cluster="dev",
                data_id="test-config"
            )
            logger.log(entry)
            
            export_path = os.path.join(tmpdir, "export.json")
            logger.export_logs(export_path)
            
            assert os.path.exists(export_path)
            
            with open(export_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            assert len(data) == 1
            assert data[0]["operation"] == "delete"
    
    def test_get_audit_logger_singleton(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "audit.db")
            
            logger1 = get_audit_logger(db_path)
            logger2 = get_audit_logger(db_path)
            
            assert logger1 is logger2
    
    def test_config_history(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "audit.db")
            logger = AuditLogger(db_path)
            
            for i in range(3):
                entry = AuditLogEntry(
                    operation=OperationType.UPDATE,
                    operator=f"user_{i}",
                    cluster="dev",
                    namespace="",
                    group_name="DEFAULT_GROUP",
                    data_id="my-config"
                )
                logger.log(entry)
            
            history = logger.get_config_history(
                cluster="dev",
                namespace="",
                group_name="DEFAULT_GROUP",
                data_id="my-config",
                limit=10
            )
            
            assert len(history) == 3


class TestIntegration:
    def test_audit_with_canary_operations(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "audit.db")
            audit = AuditLogger(db_path)
            canary = CanaryReleaseManager()
            
            release = canary.create_release(
                data_id="integration-test",
                group="DEFAULT_GROUP",
                namespace="",
                cluster="test",
                new_content="test: value",
                traffic_percentage=10
            )
            
            audit.log(AuditLogEntry(
                operation=OperationType.CANARY_START,
                operator="test_user",
                cluster="test",
                data_id="integration-test",
                metadata={"release_id": release.release_id}
            ))
            
            canary.start_release(release.release_id)
            
            logs = audit.query(operation=OperationType.CANARY_START)
            assert len(logs) == 1
            assert logs[0]["data_id"] == "integration-test"
