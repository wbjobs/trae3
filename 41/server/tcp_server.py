import sys
import os
import json
import socket
import time
import threading
import socketserver
import logging
from typing import Dict, Any

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from data_aggregator import get_aggregator


logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('TCPServer')

HEARTBEAT_INTERVAL = 15
CONNECTION_TIMEOUT = 60


class ThreadedTCPRequestHandler(socketserver.BaseRequestHandler):
    def __init__(self, request, client_address, server):
        self.node_id = None
        self.buffer = b''
        self.last_seen = time.time()
        self._shutdown_flag = threading.Event()
        self._monitor_thread = None
        super().__init__(request, client_address, server)

    def setup(self):
        logger.info(f'新连接来自 {self.client_address}')
        self.request.settimeout(5)
        self._start_connection_monitor()

    def _start_connection_monitor(self):
        def monitor():
            while not self._shutdown_flag.is_set():
                if time.time() - self.last_seen > CONNECTION_TIMEOUT:
                    logger.warning(f'连接超时 {self.client_address}, node_id={self.node_id}, 超过{CONNECTION_TIMEOUT}秒无数据')
                    self._shutdown_flag.set()
                    break
                self._shutdown_flag.wait(5)

        self._monitor_thread = threading.Thread(target=monitor, daemon=True)
        self._monitor_thread.start()

    def handle(self):
        try:
            while not self._shutdown_flag.is_set():
                try:
                    data = self.request.recv(4096)
                    if not data:
                        break
                    self.last_seen = time.time()
                    self.buffer += data
                    while b'\n' in self.buffer:
                        line, self.buffer = self.buffer.split(b'\n', 1)
                        if line:
                            self._process_line(line)
                except socket.timeout:
                    continue
                except ConnectionResetError:
                    break
                except BrokenPipeError:
                    break
        except Exception as e:
            logger.error(f'处理连接异常 {self.client_address}: {e}')
        finally:
            self._shutdown_flag.set()

    def _process_line(self, line: bytes):
        try:
            message = json.loads(line.decode('utf-8').strip())
            packet_type = message.get('type')

            if packet_type == 'register':
                self.node_id = message.get('node_id')
                logger.info(f'节点 {self.node_id} 从 {self.client_address} 注册')
                response = {
                    'status': 'ok',
                    'message': '注册成功',
                    'timestamp': int(time.time()),
                    'data': {
                        'heartbeat_interval': HEARTBEAT_INTERVAL,
                        'server_time': int(time.time())
                    }
                }
                self._send_response(response)

            elif packet_type == 'heartbeat':
                if self.node_id:
                    response = {
                        'status': 'ok',
                        'type': 'heartbeat_ack',
                        'timestamp': int(time.time())
                    }
                    self._send_response(response)

            get_aggregator().enqueue_data(message)

        except json.JSONDecodeError as e:
            logger.error(f'解析JSON失败: {e}, 数据: {line[:100]}')
        except Exception as e:
            logger.error(f'处理消息异常: {e}')

    def _send_response(self, response: Dict[str, Any]):
        try:
            msg = (json.dumps(response, ensure_ascii=False) + '\n').encode('utf-8')
            self.request.sendall(msg)
        except Exception as e:
            logger.debug(f'发送响应失败: {e}')

    def finish(self):
        self._shutdown_flag.set()
        if self._monitor_thread and self._monitor_thread.is_alive():
            self._monitor_thread.join(timeout=1)

        if self.node_id:
            logger.info(f'节点 {self.node_id} 断开连接')
            disconnect_msg = {
                'type': 'disconnect',
                'node_id': self.node_id,
                'timestamp': int(time.time()),
                'data': {}
            }
            get_aggregator().enqueue_data(disconnect_msg)
        logger.info(f'连接关闭 {self.client_address}')


class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True

    def __init__(self, host: str, port: int):
        super().__init__((host, port), ThreadedTCPRequestHandler)
        self.host = host
        self.port = port

    def serve_forever(self, poll_interval=0.5):
        logger.info(f'TCP服务端启动，监听 {self.host}:{self.port} (心跳间隔: {HEARTBEAT_INTERVAL}s, 超时: {CONNECTION_TIMEOUT}s)')
        super().serve_forever(poll_interval)


def run_tcp_server(host: str = '0.0.0.0', port: int = 8888):
    aggregator = get_aggregator()
    aggregator.start()

    server = ThreadedTCPServer(host, port)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    try:
        while True:
            threading.Event().wait(1)
    except KeyboardInterrupt:
        logger.info('正在关闭TCP服务端...')
        server.shutdown()
        aggregator.stop()
        logger.info('TCP服务端已关闭')


if __name__ == '__main__':
    run_tcp_server()
