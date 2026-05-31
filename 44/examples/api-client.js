const axios = require('axios');

const API_BASE = 'http://localhost:3000/api/v1';

class APIClient {
  constructor(baseURL = API_BASE) {
    this.client = axios.create({
      baseURL,
      timeout: 30000,
    });
  }

  async submitTask(taskData) {
    const response = await this.client.post('/tasks', taskData);
    return response.data.data;
  }

  async submitBatchTasks(batchData) {
    const response = await this.client.post('/tasks/batch', batchData);
    return response.data.data;
  }

  async getTaskStatus(taskId) {
    const response = await this.client.get(`/tasks/${taskId}`);
    return response.data.data;
  }

  async getTaskResult(taskId, useCache = true) {
    const response = await this.client.get(`/tasks/${taskId}/result`, {
      params: { cache: useCache },
    });
    return response.data.data;
  }

  async cancelTask(taskId) {
    const response = await this.client.delete(`/tasks/${taskId}`);
    return response.data.data;
  }

  async listTasks(options = {}) {
    const response = await this.client.get('/tasks', { params: options });
    return response.data.data;
  }

  async getBatchStatus(batchId) {
    const response = await this.client.get(`/tasks/batch/${batchId}`);
    return response.data.data;
  }

  async registerNode(nodeData) {
    const response = await this.client.post('/nodes/register', nodeData);
    return response.data.data;
  }

  async sendHeartbeat(nodeId, metrics = {}) {
    const response = await this.client.post(`/nodes/${nodeId}/heartbeat`, metrics);
    return response.data.data;
  }

  async listNodes(status = null) {
    const response = await this.client.get('/nodes', {
      params: status ? { status } : {},
    });
    return response.data.data;
  }

  async getNodeStats() {
    const response = await this.client.get('/nodes/stats');
    return response.data.data;
  }

  async setLoadBalancingStrategy(strategy) {
    const response = await this.client.put('/nodes/strategy', { strategy });
    return response.data.data;
  }

  async queryResults(options = {}) {
    const response = await this.client.get('/results', { params: options });
    return response.data.data;
  }

  async getStatistics(options = {}) {
    const response = await this.client.get('/results/statistics', { params: options });
    return response.data.data;
  }

  async advancedQuery(query) {
    const response = await this.client.post('/results/query', query);
    return response.data.data;
  }

  async getHealth() {
    const response = await this.client.get('/system/health');
    return response.data.data;
  }

  async getSystemInfo() {
    const response = await this.client.get('/system/info');
    return response.data.data;
  }

  async getAlgorithms() {
    const response = await this.client.get('/system/algorithms');
    return response.data.data;
  }

  async getLoadBalancingStrategies() {
    const response = await this.client.get('/system/load-balancing-strategies');
    return response.data.data;
  }

  async shutdown() {
    const response = await this.client.post('/system/shutdown');
    return response.data.data;
  }
}

async function runAPIDemo() {
  console.log('=== API客户端使用示例 ===\n');

  const client = new APIClient();

  try {
    console.log('1. 检查系统健康状态...');
    const health = await client.getHealth();
    console.log(`✓ 系统状态: ${health.status}\n`);

    console.log('2. 获取支持的插值算法...');
    const algorithms = await client.getAlgorithms();
    console.log(`✓ 支持 ${algorithms.length} 种算法:`);
    algorithms.forEach(alg => console.log(`  - ${alg.name} (${alg.id})`));
    console.log('');

    console.log('3. 获取可用的负载均衡策略...');
    const strategies = await client.getLoadBalancingStrategies();
    console.log(`✓ 支持 ${strategies.length} 种负载均衡策略:`);
    strategies.forEach(s => console.log(`  - ${s.name} (${s.id})`));
    console.log('');

    console.log('4. 生成示例数据并提交计算任务...');
    const points = generateSamplePoints(30, 0, 100, 0, 100);
    const task = await client.submitTask({
      name: 'API测试-孔隙度插值',
      description: '通过API提交的插值计算任务',
      priority: 6,
      inputData: {
        points,
        grid: {
          origin: { x: 0, y: 0, z: 0 },
          size: { x: 20, y: 20, z: 1 },
          spacing: { x: 5, y: 5, z: 1 },
        },
        params: {
          algorithm: 'idw',
          power: 2,
          maxNeighbors: 8,
        },
        parameterName: 'porosity',
        geologicalLayer: 'Jurassic',
      },
      metadata: {
        source: 'api-demo',
        user: 'test-user',
      },
    });
    console.log(`✓ 任务已提交，ID: ${task.id}\n`);

    console.log('5. 查询任务状态...');
    for (let i = 0; i < 3; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const status = await client.getTaskStatus(task.id);
      console.log(`  第${i + 1}次查询: ${status.status}, 进度: ${status.progress}%`);
      if (status.status === 'completed') break;
    }
    console.log('');

    console.log('6. 提交批量任务...');
    const batchTasks = [];
    const parameters = ['porosity', 'permeability'];
    for (const param of parameters) {
      batchTasks.push({
        name: `${param}批量计算`,
        inputData: {
          points: generateSamplePoints(20, 0, 50, 0, 50),
          grid: {
            origin: { x: 0, y: 0 },
            size: { x: 10, y: 10, z: 1 },
            spacing: { x: 5, y: 5, z: 1 },
          },
          params: {
            algorithm: 'nearest',
          },
          parameterName: param,
          geologicalLayer: 'Triassic',
        },
      });
    }

    const batch = await client.submitBatchTasks({
      tasks: batchTasks,
      batchName: 'API批量任务测试',
      priority: 7,
    });
    console.log(`✓ 批次已提交，ID: ${batch.id}, 任务数: ${batch.taskIds.length}\n`);

    console.log('7. 获取节点状态...');
    const nodeStats = await client.getNodeStats();
    console.log(`✓ 节点统计:`);
    console.log(`  - 总节点: ${nodeStats.totalNodes}`);
    console.log(`  - 在线节点: ${nodeStats.onlineNodes}`);
    console.log(`  - 活跃任务: ${nodeStats.totalActiveTasks}`);
    console.log('');

    console.log('8. 查询计算统计...');
    const stats = await client.getStatistics();
    console.log(`✓ 计算统计:`);
    console.log(`  - 总结果数: ${stats.totalResults}`);
    console.log(`  - 成功率: ${(stats.successRate * 100).toFixed(2)}%`);
    console.log(`  - 平均计算时间: ${stats.avgComputationTime?.toFixed(2) || 0}ms`);
    console.log('');

    console.log('9. 获取系统信息...');
    const systemInfo = await client.getSystemInfo();
    console.log(`✓ 系统信息:`);
    console.log(`  - 主机名: ${systemInfo.system.hostname}`);
    console.log(`  - CPU核心: ${systemInfo.system.cpus}`);
    console.log(`  - 运行时间: ${systemInfo.process.uptime.toFixed(0)}s`);
    console.log('');

    console.log('10. 查询历史任务列表...');
    const taskList = await client.listTasks({
      pageSize: 5,
      status: 'completed',
    });
    console.log(`✓ 共 ${taskList.total} 个已完成任务，显示前5个:`);
    taskList.data.slice(0, 5).forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.name} - ${t.algorithm} - ${t.parameterName}`);
    });

    console.log('\n=== API客户端示例完成 ===');

  } catch (error) {
    console.error('API调用失败:', error.response?.data || error.message);
  }
}

function generateSamplePoints(count, minX, maxX, minY, maxY) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const x = minX + Math.random() * (maxX - minX);
    const y = minY + Math.random() * (maxY - minY);
    const value = Math.sin(x * 0.1) * Math.cos(y * 0.1) + 0.5 + Math.random() * 0.3;
    points.push({ x, y, value });
  }
  return points;
}

if (require.main === module) {
  runAPIDemo().catch(console.error);
}

module.exports = {
  APIClient,
  runAPIDemo,
};
