const WebSocket = require('ws');

const terminalId = process.argv[2] || 'MOCK-TERMINAL-001';
const serverUrl = process.argv[3] || 'ws://localhost:3001';

const ws = new WebSocket(`${serverUrl}?terminalId=${terminalId}`);

const logLevels = ['debug', 'info', 'warning', 'error'];
const modules = ['gps', 'can', 'bms', 'vcu', 'tbox', 'media', 'bluetooth'];

const generateLog = () => {
  const level = logLevels[Math.floor(Math.random() * logLevels.length)];
  const module = modules[Math.floor(Math.random() * modules.length)];
  const messages = [
    '系统启动完成',
    'GPS信号丢失',
    '电池电量低',
    'CAN总线通信异常',
    '车辆速度: ' + Math.floor(Math.random() * 120) + ' km/h',
    '温度过高警告',
    '内存使用率: ' + Math.floor(Math.random() * 100) + '%',
    '网络连接断开',
    '固件版本检查',
    '用户操作记录',
  ];
  const message = messages[Math.floor(Math.random() * messages.length)];
  
  return {
    type: 'log',
    data: {
      level,
      module,
      message,
      timestamp: new Date().toISOString(),
      metadata: {
        cpu: Math.floor(Math.random() * 100),
        memory: Math.floor(Math.random() * 100),
        temperature: Math.floor(Math.random() * 60) + 20,
      },
    },
  };
};

ws.on('open', () => {
  console.log(`终端 ${terminalId} 已连接到服务器`);
  
  setInterval(() => {
    const log = generateLog();
    ws.send(JSON.stringify(log));
    console.log(`[${log.data.level.toUpperCase()}] ${log.data.module}: ${log.data.message}`);
  }, 1000 + Math.random() * 2000);

  setInterval(() => {
    ws.send(JSON.stringify({ type: 'heartbeat' }));
  }, 30000);
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  if (message.type === 'heartbeat_ack') {
    console.log('收到心跳响应');
  } else {
    console.log('收到服务器消息:', message);
  }
});

ws.on('close', () => {
  console.log('连接已断开');
  process.exit(0);
});

ws.on('error', (error) => {
  console.error('连接错误:', error.message);
});

process.on('SIGINT', () => {
  console.log('正在断开连接...');
  ws.close();
});