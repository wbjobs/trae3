import pytest
import tempfile
import os
from pathlib import Path

from src.validator import ConfigValidator, ValidationLevel
from src.parser import ConfigParser


class TestValidatorFixes:
    def setup_method(self):
        self.validator = ConfigValidator()
        self.temp_dir = tempfile.mkdtemp()

    def test_validate_redis_server_hostname(self):
        yaml_content = """
service:
  name: cache-service
  version: 1.0.0
  profile: dev
  type: cache
server:
  port: 8080
redis:
  host: redis-server
  port: 6379
  timeout: 5000
"""
        file_path = os.path.join(self.temp_dir, "redis-config.yaml")
        with open(file_path, 'w') as f:
            f.write(yaml_content)
        
        result = self.validator.validate_file(file_path)
        
        host_errors = [e for e in result.errors if e.get('field') == 'redis.host']
        assert len(host_errors) == 0, f"redis-server主机名不应被误报: {host_errors}"
        assert result.is_valid, f"配置应该通过校验，错误: {result.errors}"

    def test_validate_simple_hostname(self):
        yaml_content = """
service:
  name: web-service
  version: 1.0.0
  profile: dev
  type: web
server:
  port: 8080
  host: my-service
  context-path: /api
"""
        file_path = os.path.join(self.temp_dir, "simple-host.yaml")
        with open(file_path, 'w') as f:
            f.write(yaml_content)
        
        result = self.validator.validate_file(file_path)
        
        host_errors = [e for e in result.errors if e.get('field') == 'server.host']
        assert len(host_errors) == 0, f"简单主机名不应被误报: {host_errors}"
        assert result.is_valid

    def test_validate_ip_address(self):
        yaml_content = """
service:
  name: db-service
  version: 1.0.0
  profile: dev
  type: database
server:
  port: 8080
database:
  host: 192.168.1.100
  url: jdbc:mysql://192.168.1.100:3306/test
  username: root
"""
        file_path = os.path.join(self.temp_dir, "ip-config.yaml")
        with open(file_path, 'w') as f:
            f.write(yaml_content)
        
        result = self.validator.validate_file(file_path)
        
        host_errors = [e for e in result.errors if e.get('field') == 'database.host']
        assert len(host_errors) == 0, f"IP地址不应被误报: {host_errors}"
        assert result.is_valid

    def test_validate_localhost(self):
        yaml_content = """
service:
  name: local-service
  version: 1.0.0
  profile: dev
  type: web
server:
  port: 8080
  host: localhost
  context-path: /api
"""
        file_path = os.path.join(self.temp_dir, "localhost.yaml")
        with open(file_path, 'w') as f:
            f.write(yaml_content)
        
        result = self.validator.validate_file(file_path)
        assert result.is_valid, f"localhost应该通过校验: {result.errors}"

    def test_validate_fqdn_hostname(self):
        yaml_content = """
service:
  name: prod-service
  version: 1.0.0
  profile: prod
  type: web
server:
  port: 8080
  host: service.example.com
  context-path: /api
"""
        file_path = os.path.join(self.temp_dir, "fqdn.yaml")
        with open(file_path, 'w') as f:
            f.write(yaml_content)
        
        result = self.validator.validate_file(file_path)
        host_errors = [e for e in result.errors if e.get('field') == 'server.host']
        assert len(host_errors) == 0, f"完整域名不应被误报: {host_errors}"

    def test_validate_boolean_not_integer(self):
        yaml_content = """
service:
  name: test-service
  version: 1.0.0
  profile: dev
  type: web
server:
  port: 8080
  enabled: true
  context-path: /api
"""
        file_path = os.path.join(self.temp_dir, "bool-test.yaml")
        with open(file_path, 'w') as f:
            f.write(yaml_content)
        
        result = self.validator.validate_file(file_path)
        assert result.is_valid, f"布尔值true不应被误判为整数: {result.errors}"

    def test_validate_boolean_false_not_integer(self):
        yaml_content = """
service:
  name: test-service
  version: 1.0.0
  profile: dev
  type: web
server:
  port: 8080
  debug: false
  context-path: /api
"""
        file_path = os.path.join(self.temp_dir, "bool-false.yaml")
        with open(file_path, 'w') as f:
            f.write(yaml_content)
        
        result = self.validator.validate_file(file_path)
        assert result.is_valid, f"布尔值false不应被误判为整数: {result.errors}"

    def test_validate_integer_port_not_boolean(self):
        yaml_content = """
service:
  name: test-service
  version: 1.0.0
  profile: dev
  type: web
server:
  port: 8080
  context-path: /api
"""
        file_path = os.path.join(self.temp_dir, "port-valid.yaml")
        with open(file_path, 'w') as f:
            f.write(yaml_content)
        
        result = self.validator.validate_file(file_path)
        assert result.is_valid, f"有效端口8080应该通过校验: {result.errors}"

    def test_validate_invalid_boolean_port(self):
        yaml_content = """
service:
  name: test-service
  version: 1.0.0
  profile: dev
  type: web
server:
  port: true
  context-path: /api
"""
        file_path = os.path.join(self.temp_dir, "port-bool.yaml")
        with open(file_path, 'w') as f:
            f.write(yaml_content)
        
        result = self.validator.validate_file(file_path)
        
        port_errors = [e for e in result.errors if e.get('field') == 'server.port']
        assert len(port_errors) > 0, "布尔值作为端口应该报错"
        assert any('整数类型' in e['message'] for e in port_errors)
        assert not result.is_valid

    def test_validate_version_with_hyphen(self):
        yaml_content = """
service:
  name: test-service
  version: 1.0.0-SNAPSHOT
  profile: dev
  type: web
server:
  port: 8080
  context-path: /api
"""
        file_path = os.path.join(self.temp_dir, "version-snapshot.yaml")
        with open(file_path, 'w') as f:
            f.write(yaml_content)
        
        result = self.validator.validate_file(file_path)
        
        version_errors = [e for e in result.errors if e.get('field') == 'service.version']
        assert len(version_errors) == 0, f"版本号1.0.0-SNAPSHOT应该通过校验: {version_errors}"
        assert result.is_valid

    def test_validate_service_name_with_single_char(self):
        yaml_content = """
service:
  name: a
  version: 1.0.0
  profile: dev
  type: web
server:
  port: 8080
  context-path: /api
"""
        file_path = os.path.join(self.temp_dir, "short-name.yaml")
        with open(file_path, 'w') as f:
            f.write(yaml_content)
        
        result = self.validator.validate_file(file_path)
        
        name_errors = [e for e in result.errors if e.get('field') == 'service.name']
        assert len(name_errors) == 0, f"单字符服务名应该通过校验: {name_errors}"
        assert result.is_valid

    def test_validate_mixed_hostnames_batch(self):
        hostnames = [
            'redis-server',
            'my-service',
            'db-primary',
            'cache-node-1',
            '192.168.1.1',
            'localhost',
            'service.example.com',
            'api-gateway-prod'
        ]
        
        for idx, hostname in enumerate(hostnames):
            yaml_content = f"""
service:
  name: service-{idx}
  version: 1.0.0
  profile: dev
  type: web
server:
  port: {8080 + idx}
  host: {hostname}
  context-path: /api
"""
            file_path = os.path.join(self.temp_dir, f"host-{idx}.yaml")
            with open(file_path, 'w') as f:
                f.write(yaml_content)
        
        batch_result = self.validator.validate_directory(self.temp_dir)
        
        assert batch_result.total_files == len(hostnames)
        assert batch_result.valid_files == len(hostnames), \
            f"有{batch_result.invalid_files}个文件误报失败: {[r.file_path for r in batch_result.results if not r.is_valid]}"
        assert batch_result.invalid_files == 0

    def test_validate_empty_string_content(self):
        yaml_content = """
service:
  name: test-service
  version: 1.0.0
  profile: dev
  type: web
server:
  port: 8080
  context-path: ""
"""
        file_path = os.path.join(self.temp_dir, "empty-string.yaml")
        with open(file_path, 'w') as f:
            f.write(yaml_content)
        
        result = self.validator.validate_file(file_path)
        assert result.is_valid, f"空字符串context-path不应被误判: {result.errors}"
