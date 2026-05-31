import pytest
import tempfile
import os
import json

from src.validator import ConfigValidator, ValidationLevel


class TestConfigValidator:
    def setup_method(self):
        self.validator = ConfigValidator()
        self.temp_dir = tempfile.mkdtemp()

    def test_validate_valid_yaml(self):
        yaml_content = """
service:
  name: user-service
  version: 1.0.0
  profile: dev
  type: web
server:
  port: 8080
  context-path: /api
"""
        file_path = os.path.join(self.temp_dir, "valid-config.yaml")
        with open(file_path, 'w') as f:
            f.write(yaml_content)
        
        result = self.validator.validate_file(file_path)
        
        assert result.is_valid is True
        assert len(result.errors) == 0

    def test_validate_missing_required_fields(self):
        yaml_content = """
server:
  port: 8080
"""
        file_path = os.path.join(self.temp_dir, "invalid-config.yaml")
        with open(file_path, 'w') as f:
            f.write(yaml_content)
        
        result = self.validator.validate_file(file_path)
        
        assert result.is_valid is False
        assert any('缺少必填字段' in err['message'] for err in result.errors)

    def test_validate_invalid_service_name(self):
        yaml_content = """
service:
  name: InvalidServiceName
  version: 1.0.0
server:
  port: 8080
"""
        file_path = os.path.join(self.temp_dir, "invalid-name.yaml")
        with open(file_path, 'w') as f:
            f.write(yaml_content)
        
        result = self.validator.validate_file(file_path)
        
        assert result.is_valid is False
        assert any('服务名称格式不合法' in err['message'] for err in result.errors)

    def test_validate_invalid_port(self):
        yaml_content = """
service:
  name: user-service
  version: 1.0.0
server:
  port: 80
"""
        file_path = os.path.join(self.temp_dir, "invalid-port.yaml")
        with open(file_path, 'w') as f:
            f.write(yaml_content)
        
        result = self.validator.validate_file(file_path)
        
        assert result.is_valid is False
        assert any('端口号必须在' in err['message'] for err in result.errors)

    def test_validate_invalid_version(self):
        yaml_content = """
service:
  name: user-service
  version: invalid-version
server:
  port: 8080
"""
        file_path = os.path.join(self.temp_dir, "invalid-version.yaml")
        with open(file_path, 'w') as f:
            f.write(yaml_content)
        
        result = self.validator.validate_file(file_path)
        
        assert result.is_valid is False
        assert any('版本号格式不合法' in err['message'] for err in result.errors)

    def test_validate_directory(self):
        for i in range(5):
            yaml_content = f"""
service:
  name: service-{i}
  version: 1.0.0
  profile: dev
  type: web
server:
  port: {8080 + i}
  context-path: /api
"""
            file_path = os.path.join(self.temp_dir, f"service-{i}.yaml")
            with open(file_path, 'w') as f:
                f.write(yaml_content)
        
        result = self.validator.validate_directory(self.temp_dir)
        
        assert result.total_files == 5
        assert result.valid_files == 5
        assert result.invalid_files == 0

    def test_validate_profile_rules_prod(self):
        yaml_content = """
service:
  name: user-service
  version: 1.0.0
  profile: prod
database:
  password: secret123
"""
        file_path = os.path.join(self.temp_dir, "prod-config.yaml")
        with open(file_path, 'w') as f:
            f.write(yaml_content)
        
        result = self.validator.validate_file(file_path, profile='prod')
        
        assert len(result.warnings) > 0
        assert any('敏感字段' in warn['message'] for warn in result.warnings)

    def test_validate_result_to_dict(self):
        yaml_content = """
service:
  name: user-service
  version: 1.0.0
"""
        file_path = os.path.join(self.temp_dir, "config.yaml")
        with open(file_path, 'w') as f:
            f.write(yaml_content)
        
        result = self.validator.validate_file(file_path)
        result_dict = result.to_dict()
        
        assert 'file_path' in result_dict
        assert 'is_valid' in result_dict
        assert 'errors' in result_dict
        assert 'summary' in result_dict
