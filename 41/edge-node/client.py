import socket
import json
import time
import threading
import logging
from typing import Dict, Any, Optional

from metrics import MetricsCollector


logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('EdgeClient')


class EdgeNodeClient:
    def __init__(self, node_id: str, node_name: str, server_host: str, server_port: int,
                 location: str = '', version: str = 'v1.0.0', report_interval: int = 5,
                 simulate: bool = False):
        self.node_id = node_id
        self.node_name = node_name
        self.server_host = server_host
        self.server_port = server_port
        self.location = location
        self.version = version
        self.report_interval = report_interval
        self.simulate = simulate

        self.sock: Optional[socket.socket] = None
        self.connected = False
        self.running = False
        self.reconnect_delay = 3
        self.max_reconnect_delay = 30
        self.heartbeat_interval = 15
        self.last_heartbeat_ack = time.time()
        self.heartbeat_failures = 0
        self.max_heartbeat_failures = 3

        self.collector = MetricsCollector(node_id, simulate=simulate)
        self._recv_buffer = b''
        self._recv_lock = threading.Lock()

    def _build_packet(self, packet_type: str, data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return {
            'type': packet_type,
            'node_id': self.node_id,
            'timestamp': int(time.time()),
            'data': data or {}
        }

    def _send_raw(self, packet: Dict[str, Any]) -> bool:
        if not self.sock:
            return False
        try:
            msg = (json.dumps(packet, ensure_ascii=False) + '\n').encode('utf-8')
            self.sock.sendall(msg)
            return True
        except Exception as e:
            logger.error(f'[{self.node_id}] 发送数据失败: {e}')
            return False

    def _send_packet(self, packet: Dict[str, Any]) -> bool:
        if not self.connected or not self.sock:
            return False
        return self._send_raw(packet)

    def _recv_loop(self):
        while self.running and self.sock:
            try:
                data = self.sock.recv(4096)
                if not data:
                    logger.warning(f'[{self.node_id}] 服务端关闭连接')
                    self.connected = False
                    break

                with self._recv_lock:
                    self._recv_buffer += data

                while b'\n' in self._recv_buffer:
                    with self._recv_lock:
                        line, self._recv_buffer = self._recv_buffer.split(b'\n', 1)
                    try:
                        response = json.loads(line.decode('utf-8').strip())
                        self._handle_response(response)
                    except json.JSONDecodeError:
                        continue
            except socket.timeout:
                continue
            except Exception as e:
                logger.error(f'[{self.node_id}] 接收数据异常: {e}')
                self.connected = False
                break

    def _handle_response(self, response: Dict[str, Any]):
        resp_type = response.get('type', '')

        if resp_type == 'heartbeat_ack':
            self.last_heartbeat_ack = time.time()
            self.heartbeat_failures = 0
            logger.debug(f'[{self.node_id}] 收到心跳响应')
        elif response.get('status') == 'ok':
            if 'data' in response and 'heartbeat_interval' in response['data']:
                self.heartbeat_interval = response['data']['heartbeat_interval']
                logger.info(f'[{self.node_id}] 心跳间隔设置为 {self.heartbeat_interval} 秒')

    def connect(self) -> bool:
        try:
            logger.info(f'[{self.node_id}] 正在连接服务端 {self.server_host}:{self.server_port}...')
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.sock.settimeout(10)
            self.sock.connect((self.server_host, self.server_port))
            self.sock.settimeout(5)

            register_data = {
                'node_name': self.node_name,
                'ip_address': self._get_local_ip(),
                'location': self.location,
                'version': self.version,
            }
            packet = self._build_packet('register', register_data)

            if not self._send_raw(packet):
                logger.error(f'[{self.node_id}] 发送注册包失败')
                self._close_socket()
                return False

            resp = self._wait_register_response(timeout=5.0)
            if resp and resp.get('status') == 'ok':
                self.connected = True
                self.reconnect_delay = 3
                self.last_heartbeat_ack = time.time()
                self.heartbeat_failures = 0
                self._recv_buffer = b''
                logger.info(f'[{self.node_id}] 注册成功，已连接到服务端')

                threading.Thread(target=self._recv_loop, daemon=True).start()
                return True
            else:
                logger.error(f'[{self.node_id}] 注册失败: {resp}')
                self._close_socket()
                return False
        except Exception as e:
            logger.error(f'[{self.node_id}] 连接失败: {e}')
            self._close_socket()
            return False

    def _wait_register_response(self, timeout: float) -> Optional[Dict[str, Any]]:
        if not self.sock:
            return None
        try:
            self.sock.settimeout(timeout)
            data = b''
            while b'\n' not in data:
                chunk = self.sock.recv(4096)
                if not chunk:
                    return None
                data += chunk

            line, rest = data.split(b'\n', 1)
            self._recv_buffer = rest
            self.sock.settimeout(5)
            return json.loads(line.decode('utf-8').strip())
        except Exception as e:
            logger.debug(f'[{self.node_id}] 等待注册响应超时: {e}')
            return None

    def _get_local_ip(self) -> str:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(('8.8.8.8', 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return '127.0.0.1'

    def _close_socket(self):
        self.connected = False
        if self.sock:
            try:
                self.sock.close()
            except Exception:
                pass
            self.sock = None

    def _connection_manager(self):
        while self.running:
            if not self.connected:
                logger.info(f'[{self.node_id}] 尝试连接服务端...')
                if not self.connect():
                    time.sleep(self.reconnect_delay)
                    self.reconnect_delay = min(self.reconnect_delay * 2, self.max_reconnect_delay)
                else:
                    self.reconnect_delay = 3
            time.sleep(2)

    def _report_loop(self):
        while self.running:
            if not self.connected:
                time.sleep(2)
                continue

            try:
                metrics = self.collector.collect()
                packet = self._build_packet('report', metrics)
                if self._send_packet(packet):
                    logger.info(f'[{self.node_id}] 上报指标: CPU={metrics["cpu"]}%, MEM={metrics["memory"]}%')
                else:
                    self.connected = False
            except Exception as e:
                logger.error(f'[{self.node_id}] 上报异常: {e}')
                self.connected = False

            time.sleep(self.report_interval)

    def _heartbeat_loop(self):
        while self.running:
            if self.connected:
                try:
                    packet = self._build_packet('heartbeat')
                    self._send_packet(packet)
                    logger.debug(f'[{self.node_id}] 发送心跳')

                    time_since_last_ack = time.time() - self.last_heartbeat_ack
                    if time_since_last_ack > self.heartbeat_interval * 2:
                        self.heartbeat_failures += 1
                        logger.warning(f'[{self.node_id}] 心跳响应超时 {time_since_last_ack:.1f}s, 连续失败 {self.heartbeat_failures} 次')

                        if self.heartbeat_failures >= self.max_heartbeat_failures:
                            logger.error(f'[{self.node_id}] 心跳连续失败超过{self.max_heartbeat_failures}次，断开连接')
                            self.connected = False
                except Exception as e:
                    logger.debug(f'[{self.node_id}] 心跳发送失败: {e}')
            time.sleep(self.heartbeat_interval)

    def start(self):
        self.running = True

        threading.Thread(target=self._connection_manager, daemon=True).start()
        threading.Thread(target=self._report_loop, daemon=True).start()
        threading.Thread(target=self._heartbeat_loop, daemon=True).start()
        logger.info(f'[{self.node_id}] 边缘节点客户端已启动 (心跳间隔:{self.heartbeat_interval}s, 最大失败:{self.max_heartbeat_failures}次)')

    def stop(self):
        self.running = False
        try:
            if self.connected and self.sock:
                packet = self._build_packet('disconnect')
                self._send_raw(packet)
        except Exception:
            pass
        self._close_socket()
        logger.info(f'[{self.node_id}] 边缘节点客户端已停止')

    def send_alert(self, alert_type: str, alert_level: str, message: str):
        if self.connected:
            data = {
                'alert_type': alert_type,
                'alert_level': alert_level,
                'message': message,
            }
            packet = self._build_packet('alert', data)
            self._send_packet(packet)
            logger.warning(f'[{self.node_id}] 发送告警: {alert_level} - {message}')

    def set_abnormal(self, metric_type: str = 'cpu'):
        self.collector.set_abnormal(metric_type)
        logger.info(f'[{self.node_id}] 设置异常模式: {metric_type}')


def run_single_node(node_id: str, node_name: str, location: str, server_host: str = '127.0.0.1',
                    server_port: int = 8888, simulate: bool = True):
    client = EdgeNodeClient(
        node_id=node_id,
        node_name=node_name,
        server_host=server_host,
        server_port=server_port,
        location=location,
        version='v1.2.0',
        report_interval=5,
        simulate=simulate
    )
    client.start()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        client.stop()


if __name__ == '__main__':
    import sys
    if len(sys.argv) >= 4:
        run_single_node(sys.argv[1], sys.argv[2], sys.argv[3])
    else:
        run_single_node('node-test', '测试节点', '本地测试')
