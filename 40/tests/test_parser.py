import pytest
import tempfile
import os
from pathlib import Path

from src.parser import ConfigParser, ConfigParseError


class TestConfigParser:
    def setup_method(self):
        self.parser = ConfigParser()
        self.temp_dir = tempfile.mkdtemp()

    def test_parse_yaml_file(self):
        yaml_content = """
service:
  name: test-service
  version: 1.0.0
server:
  port: 8080
"""
        file_path = os.path.join(self.temp_dir, "config.yaml")
        with open(file_path, 'w') as f:
            f.write(yaml_content)
        
        config = self.parser.parse_file(file_path)
        
        assert config['service']['name'] == 'test-service'
        assert config['service']['version'] == '1.0.0'
        assert config['server']['port'] == 8080

    def test_parse_json_file(self):
        json_content = '{"service": {"name": "test-service"}, "server": {"port": 8080}}'
        file_path = os.path.join(self.temp_dir, "config.json")
        with open(file_path, 'w') as f:
            f.write(json_content)
        
        config = self.parser.parse_file(file_path)
        
        assert config['service']['name'] == 'test-service'
        assert config['server']['port'] == 8080

    def test_parse_properties_file(self):
        props_content = """
service.name=test-service
service.version=1.0.0
server.port=8080
server.enabled=true
"""
        file_path = os.path.join(self.temp_dir, "config.properties")
        with open(file_path, 'w') as f:
            f.write(props_content)
        
        config = self.parser.parse_file(file_path)
        
        assert config['service']['name'] == 'test-service'
        assert config['service']['version'] == '1.0.0'
        assert config['server']['port'] == 8080
        assert config['server']['enabled'] is True

    def test_get_nested_value(self):
        config = {
            'service': {
                'name': 'test',
                'database': {
                    'host': 'localhost',
                    'port': 3306
                }
            }
        }
        
        assert self.parser.get_value(config, 'service.name') == 'test'
        assert self.parser.get_value(config, 'service.database.host') == 'localhost'
        assert self.parser.get_value(config, 'service.database.port') == 3306
        assert self.parser.get_value(config, 'not.exist', 'default') == 'default'

    def test_merge_configs(self):
        base = {
            'service': {
                'name': 'base',
                'port': 8080
            },
            'logging': 'INFO'
        }
        
        override = {
            'service': {
                'port': 9090,
                'host': 'localhost'
            },
            'debug': True
        }
        
        merged = self.parser.merge_configs(base, override)
        
        assert merged['service']['name'] == 'base'
        assert merged['service']['port'] == 9090
        assert merged['service']['host'] == 'localhost'
        assert merged['logging'] == 'INFO'
        assert merged['debug'] is True

    def test_to_format_yaml(self):
        config = {'service': {'name': 'test', 'port': 8080}}
        
        yaml_output = self.parser.to_format(config, 'yaml')
        
        assert 'service:' in yaml_output
        assert 'name: test' in yaml_output
        assert 'port: 8080' in yaml_output

    def test_to_format_json(self):
        config = {'service': {'name': 'test'}}
        
        json_output = self.parser.to_format(config, 'json')
        
        assert '"service"' in json_output
        assert '"name": "test"' in json_output

    def test_parse_directory(self):
        for i in range(3):
            yaml_content = f'service:\n  name: service-{i}\n  port: {8080 + i}\n'
            file_path = os.path.join(self.temp_dir, f"service-{i}.yaml")
            with open(file_path, 'w') as f:
                f.write(yaml_content)
        
        results = self.parser.parse_directory(self.temp_dir)
        
        assert len(results) == 3

    def test_file_not_found(self):
        with pytest.raises(ConfigParseError):
            self.parser.parse_file('/nonexistent/path/config.yaml')

    def test_unsupported_format(self):
        file_path = os.path.join(self.temp_dir, "config.txt")
        with open(file_path, 'w') as f:
            f.write('test')
        
        with pytest.raises(ConfigParseError):
            self.parser.parse_file(file_path)
