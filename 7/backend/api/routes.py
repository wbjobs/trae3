import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Blueprint, request, jsonify, send_from_directory, send_file
from datetime import datetime
import logging
import gzip
import json
import base64

from services.data_service import data_service
from modules.device_management import device_management_service
from modules.report_generator import report_generator_service
from db.influxdb_manager import influxdb_manager
from config import Config

logger = logging.getLogger(__name__)

api_bp = Blueprint('api', __name__)

def decompress_request(data):
    if data and data.get('_compressed'):
        try:
            compressed = base64.b64decode(data['_data'])
            decompressed = gzip.decompress(compressed)
            return json.loads(decompressed.decode('utf-8'))
        except Exception as e:
            logger.warning(f"Decompression failed: {e}")
    return data

@api_bp.route('/health')
def health_check():
    return jsonify({
        'success': True,
        'status': 'healthy',
        'influxdb_connected': influxdb_manager.is_connected,
        'simulation_mode': Config.USE_SIMULATION or not influxdb_manager.is_connected,
        'cache_stats': data_service.get_cache_stats(),
        'timestamp': datetime.now().isoformat()
    })

@api_bp.route('/cache/stats')
def get_cache_stats():
    return jsonify({
        'success': True,
        'cache': data_service.get_cache_stats()
    })

@api_bp.route('/cache/invalidate', methods=['POST'])
def invalidate_cache():
    data = request.get_json() or {}
    cache_type = data.get('type', 'timeseries')
    result = data_service.invalidate_cache(cache_type)
    return jsonify(result)

@api_bp.route('/devices', methods=['GET'])
def get_devices():
    group_id = request.args.get('group_id')
    status = request.args.get('status')
    result = device_management_service.get_all_devices(group_id=group_id, status=status)
    return jsonify(result)

@api_bp.route('/devices/<device_id>', methods=['GET'])
def get_device(device_id):
    result = device_management_service.get_device_by_id(device_id)
    return jsonify(result)

@api_bp.route('/devices', methods=['POST'])
def add_device():
    data = request.get_json()
    if not data or not data.get('device_id'):
        return jsonify({'success': False, 'message': 'device_id is required'}), 400
    result = device_management_service.add_device(data)
    if result.get('success'):
        data_service.invalidate_cache('all')
    return jsonify(result)

@api_bp.route('/devices/<device_id>', methods=['PUT'])
def update_device(device_id):
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'message': 'No data provided'}), 400
    result = device_management_service.update_device(device_id, data)
    if result.get('success'):
        data_service.invalidate_cache('all')
    return jsonify(result)

@api_bp.route('/devices/<device_id>', methods=['DELETE'])
def delete_device(device_id):
    result = device_management_service.delete_device(device_id)
    if result.get('success'):
        data_service.invalidate_cache('all')
    return jsonify(result)

@api_bp.route('/groups', methods=['GET'])
def get_groups():
    result = device_management_service.get_all_groups()
    return jsonify(result)

@api_bp.route('/groups/<group_id>', methods=['GET'])
def get_group(group_id):
    result = device_management_service.get_group_by_id(group_id)
    return jsonify(result)

@api_bp.route('/groups', methods=['POST'])
def add_group():
    data = request.get_json()
    if not data or not data.get('group_id'):
        return jsonify({'success': False, 'message': 'group_id is required'}), 400
    result = device_management_service.add_group(data)
    if result.get('success'):
        data_service.invalidate_cache('all')
    return jsonify(result)

@api_bp.route('/groups/<group_id>', methods=['PUT'])
def update_group(group_id):
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'message': 'No data provided'}), 400
    result = device_management_service.update_group(group_id, data)
    if result.get('success'):
        data_service.invalidate_cache('all')
    return jsonify(result)

@api_bp.route('/groups/<group_id>', methods=['DELETE'])
def delete_group(group_id):
    result = device_management_service.delete_group(group_id)
    if result.get('success'):
        data_service.invalidate_cache('all')
    return jsonify(result)

@api_bp.route('/groups/<group_id>/statistics', methods=['GET'])
def get_group_statistics(group_id):
    result = device_management_service.get_group_statistics(group_id)
    return jsonify(result)

@api_bp.route('/data/timeseries/device/<device_id>', methods=['GET'])
def get_device_timeseries(device_id):
    metrics_str = request.args.get('metrics', 'temperature,vibration')
    time_range = request.args.get('time_range', '24h')
    downsample = request.args.get('downsample', 'true').lower() == 'true'
    apply_cleaning = request.args.get('apply_cleaning', 'true').lower() == 'true'
    enable_alerts = request.args.get('enable_alerts', 'true').lower() == 'true'
    compress = request.args.get('compress', 'false').lower() == 'true'

    metrics = [m.strip() for m in metrics_str.split(',') if m.strip()]
    if not metrics:
        return jsonify({'success': False, 'message': 'No metrics specified'}), 400

    result = data_service.get_device_timeseries(
        device_id=device_id,
        metrics=metrics,
        time_range=time_range,
        downsample=downsample,
        apply_cleaning=apply_cleaning,
        enable_alerts=enable_alerts,
        compress=compress
    )
    return jsonify(result)

@api_bp.route('/data/timeseries/incremental/<device_id>', methods=['GET'])
def get_incremental_timeseries(device_id):
    metrics_str = request.args.get('metrics', 'temperature,vibration')
    last_timestamp = request.args.get('last_timestamp', '')
    time_range = request.args.get('time_range', '24h')
    enable_alerts = request.args.get('enable_alerts', 'true').lower() == 'true'

    metrics = [m.strip() for m in metrics_str.split(',') if m.strip()]
    if not metrics:
        return jsonify({'success': False, 'message': 'No metrics specified'}), 400

    result = data_service.get_incremental_timeseries(
        device_id=device_id,
        metrics=metrics,
        last_timestamp=last_timestamp,
        time_range=time_range,
        enable_alerts=enable_alerts
    )
    return jsonify(result)

@api_bp.route('/data/timeseries/group/<group_id>', methods=['GET'])
def get_group_timeseries(group_id):
    metrics_str = request.args.get('metrics', 'temperature,vibration')
    time_range = request.args.get('time_range', '24h')
    aggregate_window = request.args.get('aggregate_window', '1m')

    metrics = [m.strip() for m in metrics_str.split(',') if m.strip()]
    if not metrics:
        return jsonify({'success': False, 'message': 'No metrics specified'}), 400

    result = data_service.get_group_timeseries(
        group_id=group_id,
        metrics=metrics,
        time_range=time_range,
        aggregate_window=aggregate_window
    )
    return jsonify(result)

@api_bp.route('/data/statistics/device/<device_id>', methods=['GET'])
def get_device_statistics(device_id):
    metrics_str = request.args.get('metrics', 'temperature,vibration,current')
    time_range = request.args.get('time_range', '24h')
    enable_alerts = request.args.get('enable_alerts', 'true').lower() == 'true'

    metrics = [m.strip() for m in metrics_str.split(',') if m.strip()]
    if not metrics:
        return jsonify({'success': False, 'message': 'No metrics specified'}), 400

    result = data_service.get_statistics(
        device_id=device_id,
        metrics=metrics,
        time_range=time_range,
        enable_alerts=enable_alerts
    )
    return jsonify(result)

@api_bp.route('/data/heatmap', methods=['POST'])
def get_heatmap_data():
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'message': 'No data provided'}), 400

    device_ids = data.get('device_ids', [])
    metric = data.get('metric', 'temperature')
    time_range = data.get('time_range', '24h')
    resolution = data.get('resolution', '1h')
    compress = data.get('compress', False)

    if not device_ids:
        return jsonify({'success': False, 'message': 'device_ids is required'}), 400

    result = data_service.get_heatmap_data(
        device_ids=device_ids,
        metric=metric,
        time_range=time_range,
        resolution=resolution,
        compress=compress
    )
    return jsonify(result)

@api_bp.route('/data/cleaning/quality', methods=['POST'])
def get_data_quality():
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'message': 'No data provided'}), 400

    device_id = data.get('device_id', '')
    metrics = data.get('metrics', ['temperature', 'vibration'])
    time_range = data.get('time_range', '24h')

    from modules.data_cleaning import data_cleaning_service
    from services.simulation_service import simulation_service

    df_data = simulation_service.generate_device_timeseries(device_id, metrics, time_range)
    if not df_data.get('success') or not df_data.get('timestamps'):
        return jsonify({'success': True, 'quality': {}})

    import pandas as pd
    timestamps = pd.to_datetime(df_data['timestamps'])
    df_dict = {'_time': timestamps}
    for s in df_data['series']:
        df_dict[s['name']] = s['data']
    df = pd.DataFrame(df_dict)

    quality = data_cleaning_service.get_data_quality_report(df, metrics)
    return jsonify({'success': True, 'quality': quality})

@api_bp.route('/reports/generate/device/<device_id>', methods=['POST'])
def generate_device_report(device_id):
    data = request.get_json() or {}
    time_range = data.get('time_range', '24h')
    format_type = data.get('format', 'pdf')
    metrics_str = data.get('metrics', 'temperature,vibration,current')

    metrics = [m.strip() for m in metrics_str.split(',') if m.strip()]
    statistics = data_service.get_statistics(
        device_id=device_id, metrics=metrics,
        time_range=time_range, enable_alerts=False
    )

    result = report_generator_service.generate_maintenance_report(
        device_id=device_id,
        time_range=time_range,
        statistics=statistics,
        format=format_type
    )
    return jsonify(result)

@api_bp.route('/reports/generate/group/<group_id>', methods=['POST'])
def generate_group_report(group_id):
    data = request.get_json() or {}
    time_range = data.get('time_range', '24h')
    format_type = data.get('format', 'pdf')

    group_stats_result = device_management_service.get_group_statistics(group_id)
    group_stats = group_stats_result if group_stats_result.get('success') else {}

    group_result = device_management_service.get_group_by_id(group_id)
    device_stats = {}
    if group_result.get('success') and group_result.get('group', {}).get('devices'):
        for device in group_result['group']['devices']:
            did = device.get('device_id', '')
            stat = data_service.get_statistics(
                device_id=did, metrics=['temperature', 'vibration'],
                time_range=time_range, enable_alerts=False
            )
            if stat.get('success') and stat.get('statistics'):
                temp_stats = stat['statistics'].get('temperature', {})
                vib_stats = stat['statistics'].get('vibration', {})
                device_stats[did] = {
                    'status': device.get('status', 'unknown'),
                    'avg_temp': temp_stats.get('avg', 0),
                    'avg_vibration': vib_stats.get('avg', 0)
                }

    result = report_generator_service.generate_group_report(
        group_id=group_id,
        time_range=time_range,
        group_stats=group_stats,
        device_stats=device_stats,
        format=format_type
    )
    return jsonify(result)

@api_bp.route('/reports', methods=['GET'])
def get_reports():
    result = report_generator_service.get_report_list()
    return jsonify(result)

@api_bp.route('/reports/download/<filename>', methods=['GET'])
def download_report(filename):
    report_dir = Config.REPORT_OUTPUT_DIR
    filepath = os.path.join(report_dir, filename)
    if os.path.exists(filepath):
        return send_file(filepath, as_attachment=True, download_name=filename)
    else:
        return jsonify({'success': False, 'message': 'Report file not found'}), 404
