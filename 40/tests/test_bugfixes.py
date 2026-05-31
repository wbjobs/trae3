import pytest
import tempfile
import os
import zipfile
import json
from pathlib import Path
from unittest.mock import Mock, MagicMock

from src.backup import ConfigBackupManager, BackupCorruptedError
from src.migration import ConfigMigrator, ConfigDiffComparer
from src.remote import (
    NacosClient, ConfigCenterError,
    ConfigNotFoundError, ConfigCenterTimeoutError
)


class TestBackupFixes:
    def setup_method(self):
        self.temp_dir = tempfile.mkdtemp()
        self.mock_client = Mock(spec=NacosClient)
        
    def test_zip_integrity_verification(self):
        backup_dir = Path(self.temp_dir) / "test_backup"
        backup_dir.mkdir()
        
        (backup_dir / "DEFAULT_GROUP").mkdir()
        with open(backup_dir / "DEFAULT_GROUP" / "test.yaml", 'w') as f:
            f.write("service:\n  name: test")
        
        zip_path = backup_dir.with_suffix('.zip')
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for root, _, files in os.walk(backup_dir):
                for file in files:
                    file_path = Path(root) / file
                    arcname = file_path.relative_to(backup_dir.parent)
                    zipf.write(file_path, arcname)
        
        manager = ConfigBackupManager(self.mock_client, self.temp_dir, "test")
        ok, count, msg = manager._verify_zip_integrity(zip_path)
        
        assert ok is True
        assert count >= 1
        
    def test_corrupted_zip_detection(self):
        zip_path = Path(self.temp_dir) / "corrupted.zip"
        with open(zip_path, 'wb') as f:
            f.write(b"this is not a valid zip file")
        
        manager = ConfigBackupManager(self.mock_client, self.temp_dir, "test")
        ok, count, msg = manager._verify_zip_integrity(zip_path)
        
        assert ok is False
        assert "ZIP格式错误" in msg or "ZIP文件损坏" in msg
        
    def test_compress_backup_verifies_integrity(self):
        manager = ConfigBackupManager(self.mock_client, self.temp_dir, "test")
        
        backup_dir = Path(self.temp_dir) / "full_test"
        backup_dir.mkdir()
        (backup_dir / "DEFAULT_GROUP").mkdir()
        with open(backup_dir / "DEFAULT_GROUP" / "test.yaml", 'w') as f:
            f.write("service:\n  name: test")
        
        result = manager._compress_backup(backup_dir)
        
        assert result.endswith('.zip')
        assert Path(result).exists()
        assert not backup_dir.exists()
        
    def test_restore_verifies_zip_integrity(self):
        manager = ConfigBackupManager(self.mock_client, self.temp_dir, "test")
        
        corrupted_zip = Path(self.temp_dir) / "corrupted_backup.zip"
        with open(corrupted_zip, 'wb') as f:
            f.write(b"not a valid zip")
        
        result = manager.restore_backup(str(corrupted_zip))
        
        assert result.success is False
        assert "备份文件损坏" in result.message
        
    def test_manifest_atomic_write(self):
        manager = ConfigBackupManager(self.mock_client, self.temp_dir, "test")
        
        hashes = {"DEFAULT_GROUP:test": "abc123"}
        manager._save_manifest(hashes, "/tmp/test")
        
        assert manager.manifest_path.exists()
        assert not manager.manifest_path.with_suffix('.tmp').exists()
        
        with open(manager.manifest_path, 'r') as f:
            manifest = json.load(f)
            assert manifest["content_hashes"] == hashes
            
    def test_data_id_restore_from_manifest(self):
        manager = ConfigBackupManager(self.mock_client, self.temp_dir, "test")
        
        backup_dir = Path(self.temp_dir) / "restorable_backup"
        backup_dir.mkdir()
        (backup_dir / "DEFAULT_GROUP").mkdir()
        
        manifest_data = {
            "cluster": "test",
            "timestamp": "20240101_120000",
            "backup_type": "full",
            "items": [
                {
                    "data_id": "com.example.config.ApplicationConfig",
                    "group": "DEFAULT_GROUP",
                    "type": "yaml",
                    "filename": "com_example_config_ApplicationConfig.yaml",
                    "hash": "abc123"
                }
            ]
        }
        
        with open(backup_dir / "_backup_manifest.json", 'w') as f:
            json.dump(manifest_data, f)
        
        with open(backup_dir / "DEFAULT_GROUP" / "com_example_config_ApplicationConfig.yaml", 'w') as f:
            content = "service:\n  name: test\n"
            f.write(content)
        
        zip_path = manager._compress_backup(backup_dir)
        
        self.mock_client.publish_config = Mock(return_value=True)
        
        result = manager.restore_backup(zip_path, dry_run=True)
        
        assert result.total_items >= 1
        assert any("com.example.config.ApplicationConfig" in msg for msg in result.message.split('\n'))


class TestMigrationFixes:
    def test_migrate_handles_empty_string_content(self):
        source_client = Mock()
        target_client = Mock()
        
        source_client.list_all_configs.return_value = [
            {"dataId": "service-a", "group": "DEFAULT_GROUP", "type": "yaml"},
            {"dataId": "service-b", "group": "DEFAULT_GROUP", "type": "yaml"},
        ]
        
        source_client.get_config.side_effect = [
            "",
            "service:\n  name: service-b\n"
        ]
        target_client.get_config.return_value = None
        target_client.publish_config.return_value = True
        
        migrator = ConfigMigrator(source_client, target_client)
        result = migrator.migrate()
        
        assert result.total_items == 2
        assert result.migrated_items == 2
        assert len(result.failed_items) == 0
        
    def test_migrate_handles_none_content(self):
        source_client = Mock()
        target_client = Mock()
        
        source_client.list_all_configs.return_value = [
            {"dataId": "deleted-service", "group": "DEFAULT_GROUP", "type": "yaml"},
        ]
        
        source_client.get_config.return_value = None
        
        migrator = ConfigMigrator(source_client, target_client)
        result = migrator.migrate()
        
        assert result.total_items == 1
        assert result.migrated_items == 0
        assert len(result.skipped_items) == 1
        assert "配置不存在" in result.skipped_items[0]
        
    def test_migrate_handles_target_404(self):
        source_client = Mock()
        target_client = Mock()
        
        source_client.list_all_configs.return_value = [
            {"dataId": "new-service", "group": "DEFAULT_GROUP", "type": "yaml"},
        ]
        
        source_client.get_config.return_value = "service:\n  name: new\n"
        target_client.get_config.side_effect = ConfigNotFoundError("not found")
        target_client.publish_config.return_value = True
        
        migrator = ConfigMigrator(source_client, target_client)
        result = migrator.migrate()
        
        assert result.migrated_items == 1
        
    def test_diff_comparer_logs_failed_configs(self):
        source_client = Mock()
        target_client = Mock()
        
        source_client.list_all_configs.return_value = [
            {"dataId": "good-config", "group": "DEFAULT_GROUP", "type": "yaml"},
            {"dataId": "bad-config", "group": "DEFAULT_GROUP", "type": "yaml"},
        ]
        
        source_client.get_config.side_effect = [
            "service:\n  name: good\n",
            ConfigCenterTimeoutError("timeout")
        ]
        target_client.list_all_configs.return_value = []
        
        comparer = ConfigDiffComparer()
        diffs = comparer.compare_configs(source_client, target_client)
        
        assert len(diffs) >= 1
        assert any(d.data_id == "good-config" for d in diffs)


class TestRemoteFixes:
    def test_get_config_returns_none_on_404(self):
        client = NacosClient("http://localhost:8848")
        
        original_request = client._request
        
        def mock_request(method, endpoint, **kwargs):
            if "configs" in endpoint and method == "GET":
                raise ConfigNotFoundError("Config not found")
            response = Mock()
            response.status_code = 200
            response.text = "ok"
            return response
        
        client._request = Mock(side_effect=mock_request)
        
        result = client.get_config("nonexistent", "DEFAULT_GROUP")
        
        assert result is None
        
    def test_delete_config_returns_false_on_404(self):
        client = NacosClient("http://localhost:8848")
        
        original_request = client._request
        
        def mock_request(method, endpoint, **kwargs):
            if method == "DELETE":
                raise ConfigNotFoundError("Config not found")
            response = Mock()
            response.status_code = 200
            response.text = "true"
            return response
        
        client._request = Mock(side_effect=mock_request)
        
        result = client.delete_config("nonexistent", "DEFAULT_GROUP")
        
        assert result is False
        
    def test_timeout_error_classification(self):
        from src.remote import ConfigCenterTimeoutError, ConfigCenterConnectionError
        
        assert issubclass(ConfigCenterTimeoutError, ConfigCenterError)
        assert issubclass(ConfigCenterConnectionError, ConfigCenterError)
        assert ConfigCenterTimeoutError is not ConfigCenterConnectionError
        
    def test_separate_connect_and_read_timeout(self):
        client = NacosClient(
            "http://localhost:8848",
            timeout=30,
            connect_timeout=5
        )
        
        assert client.connect_timeout == 5
        assert client.timeout == 30
