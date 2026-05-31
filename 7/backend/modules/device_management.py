import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from typing import List, Dict, Optional
from datetime import datetime
import json
import logging
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DeviceManagementService:
    def __init__(self):
        self.data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')
        os.makedirs(self.data_dir, exist_ok=True)
        
        self.groups_file = os.path.join(self.data_dir, 'device_groups.json')
        self.devices_file = os.path.join(self.data_dir, 'devices.json')
        
        self._init_storage()
    
    def _init_storage(self):
        if not os.path.exists(self.groups_file):
            default_groups = [
                {
                    'group_id': 'group_motors',
                    'group_name': '电机设备组',
                    'description': '工厂所有电机设备',
                    'created_at': datetime.now().isoformat(),
                    'updated_at': datetime.now().isoformat()
                },
                {
                    'group_id': 'group_pumps',
                    'group_name': '泵类设备组',
                    'description': '水泵、油泵等设备',
                    'created_at': datetime.now().isoformat(),
                    'updated_at': datetime.now().isoformat()
                },
                {
                    'group_id': 'group_sensors',
                    'group_name': '传感器组',
                    'description': '温度、压力传感器',
                    'created_at': datetime.now().isoformat(),
                    'updated_at': datetime.now().isoformat()
                }
            ]
            self._save_json(self.groups_file, default_groups)
        
        if not os.path.exists(self.devices_file):
            default_devices = [
                {
                    'device_id': 'motor_001',
                    'device_name': '主电机-1号',
                    'device_type': 'motor',
                    'group_id': 'group_motors',
                    'status': 'running',
                    'location': 'A车间-1号线',
                    'install_date': '2023-01-15',
                    'metrics': ['temperature', 'vibration', 'current', 'rpm'],
                    'created_at': datetime.now().isoformat(),
                    'updated_at': datetime.now().isoformat()
                },
                {
                    'device_id': 'motor_002',
                    'device_name': '主电机-2号',
                    'device_type': 'motor',
                    'group_id': 'group_motors',
                    'status': 'running',
                    'location': 'A车间-2号线',
                    'install_date': '2023-02-20',
                    'metrics': ['temperature', 'vibration', 'current', 'rpm'],
                    'created_at': datetime.now().isoformat(),
                    'updated_at': datetime.now().isoformat()
                },
                {
                    'device_id': 'pump_001',
                    'device_name': '冷却水泵',
                    'device_type': 'pump',
                    'group_id': 'group_pumps',
                    'status': 'running',
                    'location': 'B车间-冷却水系统',
                    'install_date': '2023-03-10',
                    'metrics': ['flow_rate', 'pressure', 'power'],
                    'created_at': datetime.now().isoformat(),
                    'updated_at': datetime.now().isoformat()
                },
                {
                    'device_id': 'sensor_temp_001',
                    'device_name': '温度传感器-A1',
                    'device_type': 'sensor',
                    'group_id': 'group_sensors',
                    'status': 'active',
                    'location': 'A车间-设备区',
                    'install_date': '2023-04-05',
                    'metrics': ['temperature'],
                    'created_at': datetime.now().isoformat(),
                    'updated_at': datetime.now().isoformat()
                }
            ]
            self._save_json(self.devices_file, default_devices)
    
    def _load_json(self, filepath: str) -> List:
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading {filepath}: {e}")
            return []
    
    def _save_json(self, filepath: str, data: List):
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            logger.error(f"Error saving {filepath}: {e}")
            return False
    
    def get_all_devices(self, group_id: Optional[str] = None, status: Optional[str] = None) -> Dict:
        try:
            devices = self._load_json(self.devices_file)
            
            if group_id:
                devices = [d for d in devices if d.get('group_id') == group_id]
            
            if status:
                devices = [d for d in devices if d.get('status') == status]
            
            return {
                'success': True,
                'devices': devices,
                'total': len(devices)
            }
        except Exception as e:
            logger.error(f"Error getting devices: {e}")
            return {
                'success': False,
                'message': str(e)
            }
    
    def get_device_by_id(self, device_id: str) -> Dict:
        try:
            devices = self._load_json(self.devices_file)
            device = next((d for d in devices if d.get('device_id') == device_id), None)
            
            if device:
                return {
                    'success': True,
                    'device': device
                }
            else:
                return {
                    'success': False,
                    'message': 'Device not found'
                }
        except Exception as e:
            logger.error(f"Error getting device: {e}")
            return {
                'success': False,
                'message': str(e)
            }
    
    def add_device(self, device_data: Dict) -> Dict:
        try:
            devices = self._load_json(self.devices_file)
            
            if any(d.get('device_id') == device_data.get('device_id') for d in devices):
                return {
                    'success': False,
                    'message': 'Device ID already exists'
                }
            
            device_data['created_at'] = datetime.now().isoformat()
            device_data['updated_at'] = datetime.now().isoformat()
            
            devices.append(device_data)
            self._save_json(self.devices_file, devices)
            
            return {
                'success': True,
                'device': device_data,
                'message': 'Device added successfully'
            }
        except Exception as e:
            logger.error(f"Error adding device: {e}")
            return {
                'success': False,
                'message': str(e)
            }
    
    def update_device(self, device_id: str, device_data: Dict) -> Dict:
        try:
            devices = self._load_json(self.devices_file)
            
            for i, device in enumerate(devices):
                if device.get('device_id') == device_id:
                    devices[i].update(device_data)
                    devices[i]['updated_at'] = datetime.now().isoformat()
                    self._save_json(self.devices_file, devices)
                    
                    return {
                        'success': True,
                        'device': devices[i],
                        'message': 'Device updated successfully'
                    }
            
            return {
                'success': False,
                'message': 'Device not found'
            }
        except Exception as e:
            logger.error(f"Error updating device: {e}")
            return {
                'success': False,
                'message': str(e)
            }
    
    def delete_device(self, device_id: str) -> Dict:
        try:
            devices = self._load_json(self.devices_file)
            devices = [d for d in devices if d.get('device_id') != device_id]
            self._save_json(self.devices_file, devices)
            
            return {
                'success': True,
                'message': 'Device deleted successfully'
            }
        except Exception as e:
            logger.error(f"Error deleting device: {e}")
            return {
                'success': False,
                'message': str(e)
            }
    
    def get_all_groups(self) -> Dict:
        try:
            groups = self._load_json(self.groups_file)
            devices = self._load_json(self.devices_file)
            
            for group in groups:
                group['device_count'] = sum(1 for d in devices if d.get('group_id') == group.get('group_id'))
            
            return {
                'success': True,
                'groups': groups,
                'total': len(groups)
            }
        except Exception as e:
            logger.error(f"Error getting groups: {e}")
            return {
                'success': False,
                'message': str(e)
            }
    
    def get_group_by_id(self, group_id: str) -> Dict:
        try:
            groups = self._load_json(self.groups_file)
            group = next((g for g in groups if g.get('group_id') == group_id), None)
            
            if group:
                devices = self._load_json(self.devices_file)
                group['devices'] = [d for d in devices if d.get('group_id') == group_id]
                group['device_count'] = len(group['devices'])
                
                return {
                    'success': True,
                    'group': group
                }
            else:
                return {
                    'success': False,
                    'message': 'Group not found'
                }
        except Exception as e:
            logger.error(f"Error getting group: {e}")
            return {
                'success': False,
                'message': str(e)
            }
    
    def add_group(self, group_data: Dict) -> Dict:
        try:
            groups = self._load_json(self.groups_file)
            
            if any(g.get('group_id') == group_data.get('group_id') for g in groups):
                return {
                    'success': False,
                    'message': 'Group ID already exists'
                }
            
            group_data['created_at'] = datetime.now().isoformat()
            group_data['updated_at'] = datetime.now().isoformat()
            
            groups.append(group_data)
            self._save_json(self.groups_file, groups)
            
            return {
                'success': True,
                'group': group_data,
                'message': 'Group added successfully'
            }
        except Exception as e:
            logger.error(f"Error adding group: {e}")
            return {
                'success': False,
                'message': str(e)
            }
    
    def update_group(self, group_id: str, group_data: Dict) -> Dict:
        try:
            groups = self._load_json(self.groups_file)
            
            for i, group in enumerate(groups):
                if group.get('group_id') == group_id:
                    groups[i].update(group_data)
                    groups[i]['updated_at'] = datetime.now().isoformat()
                    self._save_json(self.groups_file, groups)
                    
                    return {
                        'success': True,
                        'group': groups[i],
                        'message': 'Group updated successfully'
                    }
            
            return {
                'success': False,
                'message': 'Group not found'
            }
        except Exception as e:
            logger.error(f"Error updating group: {e}")
            return {
                'success': False,
                'message': str(e)
            }
    
    def delete_group(self, group_id: str) -> Dict:
        try:
            devices = self._load_json(self.devices_file)
            for device in devices:
                if device.get('group_id') == group_id:
                    device['group_id'] = None
            self._save_json(self.devices_file, devices)
            
            groups = self._load_json(self.groups_file)
            groups = [g for g in groups if g.get('group_id') != group_id]
            self._save_json(self.groups_file, groups)
            
            return {
                'success': True,
                'message': 'Group deleted successfully'
            }
        except Exception as e:
            logger.error(f"Error deleting group: {e}")
            return {
                'success': False,
                'message': str(e)
            }
    
    def get_group_statistics(self, group_id: str) -> Dict:
        try:
            group_result = self.get_group_by_id(group_id)
            if not group_result['success']:
                return group_result
            
            group = group_result['group']
            devices = group.get('devices', [])
            
            status_counts = {}
            type_counts = {}
            
            for device in devices:
                status = device.get('status', 'unknown')
                status_counts[status] = status_counts.get(status, 0) + 1
                
                device_type = device.get('device_type', 'unknown')
                type_counts[device_type] = type_counts.get(device_type, 0) + 1
            
            return {
                'success': True,
                'group_id': group_id,
                'group_name': group.get('group_name'),
                'total_devices': len(devices),
                'status_distribution': status_counts,
                'type_distribution': type_counts
            }
        except Exception as e:
            logger.error(f"Error getting group statistics: {e}")
            return {
                'success': False,
                'message': str(e)
            }

device_management_service = DeviceManagementService()
