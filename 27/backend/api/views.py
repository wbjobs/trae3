"""API视图 - 深度优化版"""
from datetime import datetime, timedelta
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.http import HttpResponse, JsonResponse
import json
import os

from .models import Zone, Device, FaultRecord, MaintenanceReport
from .serializers import (
    ZoneSerializer, DeviceSerializer, FaultRecordSerializer, MaintenanceReportSerializer
)
from .services.data_query_service import DataQueryService
from .services.dashboard_service import DashboardService
from .services.fault_service import FaultService
from .services.quality_service import DataQualityService
from .services.report_service import ReportService
from zone_statistics.services import ZoneStatisticsService


class ZoneViewSet(viewsets.ModelViewSet):
    queryset = Zone.objects.all()
    serializer_class = ZoneSerializer


class DeviceViewSet(viewsets.ModelViewSet):
    queryset = Device.objects.all()
    serializer_class = DeviceSerializer


class FaultRecordViewSet(viewsets.ModelViewSet):
    queryset = FaultRecord.objects.all()
    serializer_class = FaultRecordSerializer


class MaintenanceReportViewSet(viewsets.ModelViewSet):
    queryset = MaintenanceReport.objects.all()
    serializer_class = MaintenanceReportSerializer


@api_view(['GET'])
def get_zones(request):
    zones = DataQueryService.get_zones()
    return Response({'zones': zones})


@api_view(['GET'])
def get_devices(request):
    zone = request.query_params.get('zone')
    devices = DataQueryService.get_devices(zone)
    return Response({'devices': devices})


@api_view(['GET'])
def get_pressure_data(request):
    device_id = request.query_params.get('device_id')
    zone = request.query_params.get('zone')
    start_time = request.query_params.get('start_time')
    end_time = request.query_params.get('end_time')
    aggregation = request.query_params.get('aggregation')
    page = int(request.query_params.get('page', 1))
    page_size = int(request.query_params.get('page_size', 0))

    result = DataQueryService.get_pressure_data(
        device_id=device_id, zone=zone, start_time=start_time,
        end_time=end_time, aggregation=aggregation,
        page=page, page_size=page_size
    )
    return Response(result)


@api_view(['GET'])
def get_flow_data(request):
    device_id = request.query_params.get('device_id')
    zone = request.query_params.get('zone')
    start_time = request.query_params.get('start_time')
    end_time = request.query_params.get('end_time')
    aggregation = request.query_params.get('aggregation')
    page = int(request.query_params.get('page', 1))
    page_size = int(request.query_params.get('page_size', 0))

    result = DataQueryService.get_flow_data(
        device_id=device_id, zone=zone, start_time=start_time,
        end_time=end_time, aggregation=aggregation,
        page=page, page_size=page_size
    )
    return Response(result)


@api_view(['GET'])
def get_realtime_data(request):
    data = DataQueryService.get_realtime_data()
    return Response(data)


@api_view(['GET'])
def get_zone_overview(request):
    try:
        service = ZoneStatisticsService()
        overview = service.get_zone_overview()
        return Response({'overview': overview if overview else []})
    except Exception as e:
        print(f"获取分区概览错误: {e}")
        return Response({'overview': []})


@api_view(['GET'])
def get_zone_statistics(request):
    zone = request.query_params.get('zone')
    start_time = request.query_params.get('start_time')
    end_time = request.query_params.get('end_time')

    try:
        service = ZoneStatisticsService()
        start_dt = datetime.fromisoformat(start_time) if start_time else None
        end_dt = datetime.fromisoformat(end_time) if end_time else None

        stats = service.calculate_zone_statistics(zone, start_dt, end_dt)
        return Response({'statistics': stats if stats else {}})
    except Exception as e:
        print(f"获取分区统计错误: {e}")
        return Response({'statistics': {}})


@api_view(['GET'])
def get_zone_comparison(request):
    metric = request.query_params.get('metric', 'pressure')
    start_time = request.query_params.get('start_time')
    end_time = request.query_params.get('end_time')

    try:
        service = ZoneStatisticsService()
        start_dt = datetime.fromisoformat(start_time) if start_time else None
        end_dt = datetime.fromisoformat(end_time) if end_time else None

        comparison = service.compare_zones(metric, start_dt, end_dt)
        return Response({'comparison': comparison if comparison else {'data': []}})
    except Exception as e:
        print(f"获取分区对比错误: {e}")
        return Response({'comparison': {'data': []}})


@api_view(['GET'])
def get_fault_list(request):
    resolved = request.query_params.get('resolved')
    days = int(request.query_params.get('days', 7) or 7)

    faults = FaultService.get_fault_list(resolved=resolved, days=days)
    return Response({'faults': faults})


@api_view(['GET'])
def get_fault_statistics(request):
    stats = FaultService.get_statistics()
    return Response({'statistics': stats})


@api_view(['POST'])
def check_faults(request):
    detected = FaultService.detect_faults()
    return Response({'detected_count': detected if detected else 0})


@api_view(['POST'])
def resolve_fault(request, fault_id):
    success = FaultService.resolve_fault(fault_id)
    if success:
        return Response({'status': 'success'})
    return Response({'error': '故障记录不存在'}, status=404)


@api_view(['POST'])
def clean_data(request):
    start_time = request.data.get('start_time')
    end_time = request.data.get('end_time')
    zone = request.data.get('zone')

    result = DataQualityService.clean_data(
        start_time=start_time, end_time=end_time, zone=zone
    )
    return Response(result)


@api_view(['GET'])
def get_data_quality(request):
    start_time = request.query_params.get('start_time')
    end_time = request.query_params.get('end_time')
    zone = request.query_params.get('zone')

    quality = DataQualityService.get_quality_report(
        start_time=start_time, end_time=end_time, zone=zone
    )
    return Response({'quality': quality})


@api_view(['POST'])
def generate_report(request):
    report_date_str = request.data.get('report_date')

    try:
        if report_date_str:
            report_date = datetime.fromisoformat(report_date_str).date()
        else:
            report_date = timezone.now().date()

        report = ReportService.generate_daily_report(report_date)

        if report:
            return Response({
                'status': 'success',
                'report_id': report.id,
                'report_date': report.report_date.isoformat()
            })
        return Response({'status': 'failed'}, status=500)
    except Exception as e:
        print(f"生成报表错误: {e}")
        return Response({'status': 'failed', 'error': str(e)}, status=500)


@api_view(['GET'])
def get_reports(request):
    reports = ReportService.get_report_list()
    return Response({'results': reports})


@api_view(['GET'])
def download_report(request, report_id):
    try:
        report = MaintenanceReport.objects.get(id=report_id)
        if report.report_file and os.path.exists(report.report_file):
            with open(report.report_file, 'rb') as f:
                response = HttpResponse(
                    f.read(),
                    content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                )
                response['Content-Disposition'] = f'attachment; filename="report_{report.report_date}.xlsx"'
                return response
        return Response({'error': '报表文件不存在'}, status=404)
    except MaintenanceReport.DoesNotExist:
        return Response({'error': '报表不存在'}, status=404)


@api_view(['GET'])
def get_dashboard_overview(request):
    data = DashboardService.get_overview()
    return Response(data)


@api_view(['GET'])
def get_device_map_data(request):
    devices = DashboardService.get_device_map_data()
    return Response({'devices': devices})


@api_view(['GET'])
def get_latest_device_data(request):
    device_id = request.query_params.get('device_id')
    if not device_id:
        return Response({'error': '缺少device_id参数'}, status=400)
    data = DataQueryService.get_latest_values(device_id)
    return Response(data)


@api_view(['GET'])
def get_fault_points(request):
    zone = request.query_params.get('zone')
    start_time = request.query_params.get('start_time')
    end_time = request.query_params.get('end_time')
    data = DataQueryService.get_fault_points(zone, start_time, end_time)
    return Response({'fault_points': data})


@api_view(['GET'])
def get_batch_latest_data(request):
    device_ids = request.query_params.get('device_ids', '')
    if not device_ids:
        return Response({'data': {}})
    ids = [d.strip() for d in device_ids.split(',') if d.strip()][:50]
    result = {}
    for did in ids:
        result[did] = DataQueryService.get_latest_values(did)
    return Response({'data': result})
