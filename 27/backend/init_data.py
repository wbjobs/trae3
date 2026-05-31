"""
初始化数据脚本
"""
import os
import sys
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'water_pipeline.settings')
django.setup()

from api.models import Zone, Device
import numpy as np


def init_zones():
    """初始化分区数据"""
    zones_data = [
        {'name': '东城区', 'code': 'DC', 'pressure_min': 0.2, 'pressure_max': 0.6, 'flow_min': 20, 'flow_max': 150},
        {'name': '西城区', 'code': 'XC', 'pressure_min': 0.18, 'pressure_max': 0.55, 'flow_min': 15, 'flow_max': 120},
        {'name': '南城区', 'code': 'NC', 'pressure_min': 0.2, 'pressure_max': 0.6, 'flow_min': 20, 'flow_max': 180},
        {'name': '北城区', 'code': 'BC', 'pressure_min': 0.22, 'pressure_max': 0.65, 'flow_min': 25, 'flow_max': 160},
        {'name': '中心区', 'code': 'ZX', 'pressure_min': 0.25, 'pressure_max': 0.7, 'flow_min': 30, 'flow_max': 200},
        {'name': '工业区', 'code': 'GY', 'pressure_min': 0.3, 'pressure_max': 0.8, 'flow_min': 50, 'flow_max': 300},
        {'name': '住宅区A', 'code': 'ZZA', 'pressure_min': 0.2, 'pressure_max': 0.55, 'flow_min': 10, 'flow_max': 100},
        {'name': '住宅区B', 'code': 'ZZB', 'pressure_min': 0.2, 'pressure_max': 0.55, 'flow_min': 10, 'flow_max': 120},
    ]
    
    zones = []
    for data in zones_data:
        zone, created = Zone.objects.get_or_create(
            code=data['code'],
            defaults=data
        )
        zones.append(zone)
        if created:
            print(f"创建分区: {data['name']}")
        else:
            print(f"分区已存在: {data['name']}")
    
    return zones


def init_devices(zones):
    """初始化设备数据"""
    device_count = 50
    
    for i in range(1, device_count + 1):
        device_id = f'P{i:03d}'
        zone = zones[i % len(zones)]
        longitude = 116.4 + np.random.uniform(-0.15, 0.15)
        latitude = 39.9 + np.random.uniform(-0.1, 0.1)
        
        device, created = Device.objects.get_or_create(
            device_id=device_id,
            defaults={
                'name': f'监测点-{device_id}',
                'zone': zone,
                'device_type': 'combo',
                'longitude': round(longitude, 6),
                'latitude': round(latitude, 6),
                'status': 'online'
            }
        )
        
        if created:
            print(f"创建设备: {device_id}")
        else:
            print(f"设备已存在: {device_id}")


def main():
    print("=" * 50)
    print("开始初始化数据...")
    print("=" * 50)
    
    print("\n1. 初始化分区数据...")
    zones = init_zones()
    
    print("\n2. 初始化设备数据...")
    init_devices(zones)
    
    print("\n" + "=" * 50)
    print("数据初始化完成!")
    print("=" * 50)


if __name__ == '__main__':
    main()
