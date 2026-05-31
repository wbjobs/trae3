import os
from multiprocessing import cpu_count

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DATABASE_PATH = os.path.join(BASE_DIR, 'groundwater.db')
TIMESERIES_DB_PATH = os.path.join(BASE_DIR, 'timeseries.db')

GRID_OUTPUT_DIR = os.path.join(BASE_DIR, 'output', 'grids')
RESULT_OUTPUT_DIR = os.path.join(BASE_DIR, 'output', 'results')
PARAMETER_DIR = os.path.join(BASE_DIR, 'data', 'parameters')
SENSOR_DATA_DIR = os.path.join(BASE_DIR, 'data', 'sensor')

MAX_WORKERS = max(1, cpu_count() - 1)

SUPPORTED_BOUNDARY_TYPES = ['dirichlet', 'neumann', 'cauchy']
SUPPORTED_ELEMENT_TYPES = ['triangle', 'quadrilateral']

DEFAULT_SOLVER_CONFIG = {
    'max_iterations': 10000,
    'tolerance': 1e-8,
    'solver_type': 'cg',
    'preconditioner': 'ilu'
}

EXPORT_FORMATS = ['vtk', 'csv', 'tecplot', 'mat']

SENSOR_CONFIG = {
    'enable_duplicate_filter': True,
    'duplicate_time_window': 1000,
    'batch_size': 1000,
    'max_queue_size': 100000,
    'flush_interval': 5,
    'aggregation_enabled': True,
    'aggregation_interval': 60,
}

WEBSOCKET_CONFIG = {
    'host': '0.0.0.0',
    'port': 5000,
    'max_connections': 100,
    'heartbeat_interval': 30,
    'partial_refresh_enabled': True,
    'refresh_interval': 1000,
    'max_message_size': 10485760,
}

TIMESERIES_CONFIG = {
    'partition_enabled': True,
    'partition_interval': 'daily',
    'pre_aggregation_enabled': True,
    'pre_aggregation_intervals': ['1min', '5min', '15min', '1hour', '1day'],
    'index_enabled': True,
    'compression_enabled': True,
    'query_timeout': 30,
    'max_query_rows': 100000,
}

CHAMBER_CONFIG = {
    'isolation_enabled': True,
    'default_memory_limit_mb': 1024,
    'default_cpu_limit': 0.5,
    'max_concurrent_tasks_per_chamber': 2,
    'flow_control_enabled': True,
    'circuit_breaker_enabled': True,
    'circuit_breaker_failure_threshold': 5,
    'circuit_breaker_timeout': 30,
    'backpressure_enabled': True,
    'queue_high_watermark': 0.8,
    'queue_low_watermark': 0.3,
}

for directory in [GRID_OUTPUT_DIR, RESULT_OUTPUT_DIR, PARAMETER_DIR, SENSOR_DATA_DIR]:
    os.makedirs(directory, exist_ok=True)
