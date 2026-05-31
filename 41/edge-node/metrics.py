import time
import random
from typing import Dict, Any


try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False


class MetricsCollector:
    def __init__(self, node_id: str, simulate: bool = False):
        self.node_id = node_id
        self.simulate = simulate or not HAS_PSUTIL
        self._sim_cpu_base = random.uniform(20, 50)
        self._sim_mem_base = random.uniform(30, 60)
        self._sim_disk_base = random.uniform(40, 70)
        self._last_net_io = None

    def collect(self) -> Dict[str, Any]:
        if self.simulate:
            return self._collect_simulated()
        return self._collect_real()

    def _collect_simulated(self) -> Dict[str, Any]:
        self._sim_cpu_base += random.uniform(-5, 5)
        self._sim_cpu_base = max(5, min(98, self._sim_cpu_base))

        self._sim_mem_base += random.uniform(-3, 3)
        self._sim_mem_base = max(10, min(98, self._sim_mem_base))

        self._sim_disk_base += random.uniform(-1, 1)
        self._sim_disk_base = max(20, min(99, self._sim_disk_base))

        return {
            'cpu': round(self._sim_cpu_base, 2),
            'memory': round(self._sim_mem_base, 2),
            'disk': round(self._sim_disk_base, 2),
            'network_in': random.randint(100000, 5000000),
            'network_out': random.randint(50000, 2000000),
            'processes': random.randint(80, 200),
        }

    def _collect_real(self) -> Dict[str, Any]:
        cpu_percent = psutil.cpu_percent(interval=0.5)
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        net_io = psutil.net_io_counters()

        if self._last_net_io:
            net_in = net_io.bytes_recv - self._last_net_io.bytes_recv
            net_out = net_io.bytes_sent - self._last_net_io.bytes_sent
        else:
            net_in = 0
            net_out = 0
        self._last_net_io = net_io

        return {
            'cpu': round(cpu_percent, 2),
            'memory': round(mem.percent, 2),
            'disk': round(disk.percent, 2),
            'network_in': net_in,
            'network_out': net_out,
            'processes': len(psutil.pids()),
        }

    def set_abnormal(self, metric_type: str = 'cpu'):
        if metric_type == 'cpu':
            self._sim_cpu_base = random.uniform(90, 99)
        elif metric_type == 'memory':
            self._sim_mem_base = random.uniform(90, 99)
        elif metric_type == 'disk':
            self._sim_disk_base = random.uniform(95, 99)
