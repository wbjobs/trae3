import http from 'http';
import app from './app.js';
import { initDatabase } from './database/config.js';
import { webSocketService } from './services/websocket.js';
import { taskService } from './services/taskScheduler.js';
import { nodeMonitorService } from './services/nodeMonitor.js';

const PORT = process.env.PORT || 3001;

let healthCheckInterval: NodeJS.Timeout;
let nodeHealthCheckInterval: NodeJS.Timeout;

async function startServer() {
  try {
    console.log('='.repeat(60));
    console.log('  分布式计算系统 - 服务启动中...');
    console.log('='.repeat(60));

    console.log('\n[1/5] 初始化数据库...');
    try {
      await initDatabase();
      console.log('      ✓ 数据库初始化成功');
    } catch (dbError) {
      console.log('      ⚠  数据库初始化失败，将使用内存数据模式');
      console.log('        原因:', (dbError as Error).message);
    }

    console.log('\n[2/5] 启动HTTP服务器...');
    const server = http.createServer(app);

    server.listen(PORT, () => {
      console.log(`      ✓ HTTP服务器已启动: http://localhost:${PORT}`);
    });

    console.log('\n[3/5] 初始化WebSocket服务...');
    webSocketService.initialize(server);
    console.log('      ✓ WebSocket服务已启动');

    console.log('\n[4/5] 启动任务调度器...');
    try {
      taskService.startScheduler();
      console.log('      ✓ 任务调度器已启动');
    } catch (schedError) {
      console.log('      ⚠  任务调度器启动失败');
    }

    console.log('\n[5/5] 启动节点健康检查...');
    nodeHealthCheckInterval = setInterval(() => {
      nodeMonitorService.checkNodeHealth();
    }, 15000);
    console.log('      ✓ 节点健康检查已启动 (15秒间隔)');

    console.log('\n' + '='.repeat(60));
    console.log('  分布式计算系统启动完成!');
    console.log('  岩土沉降数值计算平台 - 算力集群管理系统');
    console.log('='.repeat(60));
    console.log('\n  API端点:');
    console.log('  • 健康检查   : GET  /api/health');
    console.log('  • 仪表盘     : GET  /api/v1/dashboard/stats');
    console.log('  • 任务管理   : GET/POST /api/v1/tasks');
    console.log('  • 节点监控   : GET  /api/v1/nodes');
    console.log('  • 结果查询   : GET  /api/v1/results');
    console.log('\n' + '='.repeat(60) + '\n');

    process.on('SIGTERM', () => {
      console.log('\n收到SIGTERM信号，正在关闭服务...');
      gracefulShutdown(server);
    });

    process.on('SIGINT', () => {
      console.log('\n收到SIGINT信号，正在关闭服务...');
      gracefulShutdown(server);
    });

    process.on('uncaughtException', (error) => {
      console.error('未捕获的异常:', error);
    });

    process.on('unhandledRejection', (reason) => {
      console.error('未处理的Promise拒绝:', reason);
    });

  } catch (error) {
    console.error('\n❌ 服务启动失败:', error);
    process.exit(1);
  }
}

function gracefulShutdown(server: http.Server) {
  console.log('\n正在优雅关闭服务...');

  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    console.log('  ✓ 已停止健康检查');
  }

  if (nodeHealthCheckInterval) {
    clearInterval(nodeHealthCheckInterval);
    console.log('  ✓ 已停止节点健康检查');
  }

  try {
    taskService.stopScheduler();
    console.log('  ✓ 已停止任务调度器');
  } catch (e) {
    // ignore
  }

  try {
    webSocketService.stop();
    console.log('  ✓ 已停止WebSocket服务');
  } catch (e) {
    // ignore
  }

  server.close(() => {
    console.log('  ✓ HTTP服务器已关闭');
    console.log('\n服务已安全关闭，再见!');
    process.exit(0);
  });

  setTimeout(() => {
    console.log('\n强制关闭超时，直接退出');
    process.exit(0);
  }, 5000);
}

startServer();

export default app;