"""
序列化器
"""
from rest_framework import serializers
from .models import Zone, Device, FaultRecord, MaintenanceReport


class ZoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = Zone
        fields = '__all__'


class DeviceSerializer(serializers.ModelSerializer):
    zone_name = serializers.CharField(source='zone.name', read_only=True)
    
    class Meta:
        model = Device
        fields = '__all__'


class FaultRecordSerializer(serializers.ModelSerializer):
    device_id = serializers.CharField(source='device.device_id', read_only=True)
    device_name = serializers.CharField(source='device.name', read_only=True)
    zone_name = serializers.CharField(source='device.zone.name', read_only=True)
    fault_type_display = serializers.CharField(source='get_fault_type_display', read_only=True)
    
    class Meta:
        model = FaultRecord
        fields = '__all__'


class MaintenanceReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = MaintenanceReport
        fields = '__all__'
