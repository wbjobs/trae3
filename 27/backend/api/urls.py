"""
API路由
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'zones', views.ZoneViewSet)
router.register(r'devices', views.DeviceViewSet)
router.register(r'faults', views.FaultRecordViewSet)
router.register(r'reports', views.MaintenanceReportViewSet)

urlpatterns = [
    path('zones/list/', views.get_zones, name='get_zones'),
    path('devices/list/', views.get_devices, name='get_devices'),
    path('devices/map/', views.get_device_map_data, name='get_device_map_data'),
    path('data/pressure/', views.get_pressure_data, name='get_pressure_data'),
    path('data/flow/', views.get_flow_data, name='get_flow_data'),
    path('data/realtime/', views.get_realtime_data, name='get_realtime_data'),
    path('zone/overview/', views.get_zone_overview, name='get_zone_overview'),
    path('zone/statistics/', views.get_zone_statistics, name='get_zone_statistics'),
    path('zone/comparison/', views.get_zone_comparison, name='get_zone_comparison'),
    path('fault/list/', views.get_fault_list, name='get_fault_list'),
    path('fault/statistics/', views.get_fault_statistics, name='get_fault_statistics'),
    path('fault/check/', views.check_faults, name='check_faults'),
    path('fault/<int:fault_id>/resolve/', views.resolve_fault, name='resolve_fault'),
    path('data/clean/', views.clean_data, name='clean_data'),
    path('data/quality/', views.get_data_quality, name='get_data_quality'),
    path('report/generate/', views.generate_report, name='generate_report'),
    path('report/<int:report_id>/download/', views.download_report, name='download_report'),
    path('dashboard/overview/', views.get_dashboard_overview, name='get_dashboard_overview'),
    path('data/latest/', views.get_latest_device_data, name='get_latest_device_data'),
    path('data/fault-points/', views.get_fault_points, name='get_fault_points'),
    path('data/batch-latest/', views.get_batch_latest_data, name='get_batch_latest_data'),
    path('', include(router.urls)),
]
