const { DistributedComputingSystem } = require('../../src/index');
const TaskSplitter = require('../../src/task-dispatcher/TaskSplitter');
const { ComputeKernel } = require('../../src/compute-kernel');

function generateSamplePoints(count, minX = 0, maxX = 100, minY = 0, maxY = 100) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const x = minX + Math.random() * (maxX - minX);
    const y = minY + Math.random() * (maxY - minY);
    const value = Math.sin(x * 0.1) * Math.cos(y * 0.1) + 0.5 + Math.random() * 0.2;
    points.push({ x, y, value });
  }
  return points;
}

describe('Full Workflow Integration Tests', () => {
  let system;
  let taskScheduler;
  let nodeManager;
  let resultStorage;
  let computeKernel;
  let taskSplitter;

  beforeAll(async () => {
    system = new DistributedComputingSystem({
      role: 'all',
      initDatabase: false,
      initRedis: false,
      schedulerOptions: {
        splitterOptions: {
          maxGridCellsPerSubtask: 100,
        },
      },
    });
    await system.start();

    taskScheduler = system.getTaskScheduler();
    nodeManager = system.getNodeManager();
    resultStorage = system.getResultStorage();
    computeKernel = new ComputeKernel();
    taskSplitter = new TaskSplitter({ maxGridCellsPerSubtask: 100 });
  }, 60000);

  afterAll(async () => {
    await system.stop();
  }, 10000);

  describe('Compute Kernel Only', () => {
    it('should complete full interpolation workflow', async () => {
      const points = generateSamplePoints(30);
      const grid = {
        origin: { x: 0, y: 0 },
        size: { x: 10, y: 10, z: 1 },
        spacing: { x: 5, y: 5, z: 1 },
      };

      const result = await computeKernel.interpolate({
        points,
        grid,
        params: {
          algorithm: 'idw',
          power: 2,
          maxNeighbors: 8,
        },
      });

      expect(result.data.values.length).toBe(100);
      expect(result.metadata.algorithm).toBe('idw');
      expect(result.data.stats.meanValue).toBeGreaterThan(0);

      const stats = result.data.stats;
      expect(stats.minValue).toBeLessThanOrEqual(stats.meanValue);
      expect(stats.maxValue).toBeGreaterThanOrEqual(stats.meanValue);
    }, 10000);

    it('should compare different interpolation algorithms', async () => {
      const points = generateSamplePoints(25);
      const grid = {
        origin: { x: 0, y: 0 },
        size: { x: 8, y: 8, z: 1 },
        spacing: { x: 5, y: 5, z: 1 },
      };

      const algorithms = [
        { algorithm: 'idw', params: { power: 2 } },
        { algorithm: 'nearest', params: {} },
        { algorithm: 'linear', params: { maxNeighbors: 3 } },
      ];

      const results = [];
      for (const alg of algorithms) {
        const result = await computeKernel.interpolate({
          points,
          grid,
          params: { algorithm: alg.algorithm, ...alg.params },
        });
        results.push({
          algorithm: alg.algorithm,
          result,
        });
      }

      expect(results.length).toBe(3);
      results.forEach((r, i) => {
        expect(r.result.data.values.length).toBe(64);
        if (i > 0) {
          expect(r.result.data.values).not.toEqual(results[i - 1].result.data.values);
        }
      });
    }, 15000);

    it('should perform kriging with provided variogram parameters', async () => {
      const points = generateSamplePoints(20, 0, 50, 0, 50);
      const grid = {
        origin: { x: 0, y: 0 },
        size: { x: 6, y: 6, z: 1 },
        spacing: { x: 5, y: 5, z: 1 },
      };

      const result = await computeKernel.interpolate({
        points,
        grid,
        params: {
          algorithm: 'kriging',
          type: 'ordinary',
          variogram: {
            model: 'spherical',
            range: 50,
            sill: 1.0,
            nugget: 0.1,
          },
          maxNeighbors: 8,
        },
      });

      expect(result.data.values.length).toBe(36);
      expect(result.metadata.params.variogram).toBeDefined();
      expect(result.metadata.params.variogram.model).toBe('spherical');
      expect(result.data.variance.length).toBe(36);
    }, 20000);
  });

  describe('Task Splitting and Merging', () => {
    it('should split and merge large task correctly', async () => {
      const points = generateSamplePoints(50);
      const task = {
        id: 'integration-test-split',
        name: '拆分合并测试',
        inputData: {
          points,
          grid: {
            origin: { x: 0, y: 0, z: 0 },
            size: { x: 100, y: 100, z: 1 },
            spacing: { x: 1, y: 1, z: 1 },
          },
          params: { algorithm: 'idw', power: 2 },
          parameterName: 'permeability',
          geologicalLayer: 'Cretaceous',
        },
      };

      const testSplitter = new TaskSplitter({ maxGridCellsPerSubtask: 2500 });
      const subtasks = testSplitter.splitTask(task);
      expect(subtasks.length).toBeGreaterThan(1);

      const subtaskResults = [];
      for (const subtask of subtasks) {
        const result = await computeKernel.interpolate(subtask.inputData);
        subtaskResults.push({
          taskId: subtask.id,
          success: true,
          grid: subtask.inputData.grid,
          data: result.data,
        });
      }

      const merged = testSplitter.mergeResults(subtaskResults, task);
      expect(merged.success).toBe(true);
      expect(merged.data.values.length).toBe(10000);
      expect(merged.data.stats.subtasksCount).toBe(subtasks.length);

      const stats = merged.data.stats;
      expect(typeof stats.minValue).toBe('number');
      expect(typeof stats.maxValue).toBe('number');
      expect(stats.maxValue).toBeGreaterThanOrEqual(stats.minValue);
    }, 15000);
  });

  describe('Node Manager', () => {
    it('should register and manage multiple nodes', () => {
      const node1 = nodeManager.registerNode({
        id: 'int-node-1',
        name: '集成测试节点1',
        host: 'localhost',
        port: 9001,
        capacity: {
          cores: 4,
          memory: 8192,
        },
        supportedAlgorithms: ['idw', 'kriging'],
      });

      const node2 = nodeManager.registerNode({
        id: 'int-node-2',
        name: '集成测试节点2',
        host: 'localhost',
        port: 9002,
        capacity: {
          cores: 8,
          memory: 16384,
        },
        supportedAlgorithms: ['idw', 'nearest'],
      });

      expect(node1.id).toBe('int-node-1');
      expect(node2.id).toBe('int-node-2');

      const nodes = nodeManager.getAllNodes();
      expect(nodes.length).toBeGreaterThanOrEqual(2);

      const onlineNodes = nodeManager.getOnlineNodes();
      expect(onlineNodes.length).toBeGreaterThanOrEqual(2);
    });

    it('should update node status via heartbeat', async () => {
      const node = nodeManager.registerNode({
        id: 'int-heartbeat-test',
        name: '心跳测试节点',
        host: 'localhost',
        port: 9003,
        capacity: {
          cores: 4,
          memory: 8192,
        },
      });

      const updated = nodeManager.heartbeat('int-heartbeat-test', {
        cpuUsage: 45,
        memoryUsage: 4096,
        currentLoad: 1,
      });

      expect(updated.cpuUsage).toBe(45);
      expect(updated.memoryUsage).toBe(4096);
      expect(updated.status).toBe('online');

      const stats = nodeManager.getNodeStats();
      expect(stats.total).toBeGreaterThanOrEqual(1);
      expect(stats.online).toBeGreaterThanOrEqual(1);
    });

    it('should select nodes using different load balancing strategies', async () => {
      const strategies = ['least-connections', 'round-robin', 'weighted-response', 'cpu-usage', 'memory-available', 'random'];

      for (const strategy of strategies) {
        nodeManager.setLoadBalancingStrategy(strategy);
        const selected = await nodeManager.selectNode();
        expect(selected).not.toBeNull();
        expect(selected.status).toBe('online');
      }
    });
  });

  describe('Task Scheduler', () => {
    it('should submit and process a single task', async () => {
      const points = generateSamplePoints(25);

      const task = await taskScheduler.submitTask({
        name: '集成测试-单任务',
        description: '集成测试单任务提交',
        priority: 8,
        inputData: {
          points,
          grid: {
            origin: { x: 0, y: 0 },
            size: { x: 10, y: 10, z: 1 },
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
          test: true,
          source: 'integration',
        },
      });

      expect(task.id).toBeDefined();
      expect(['pending', 'scheduled', 'processing']).toContain(task.status);

      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const status = await taskScheduler.getTaskStatus(task.id);
        if (status.status === 'completed' || status.status === 'failed') {
          break;
        }
      }

      const finalStatus = await taskScheduler.getTaskStatus(task.id);
      expect(['completed', 'failed']).toContain(finalStatus.status);

      if (finalStatus.status === 'completed') {
        const result = await resultStorage.getResult(task.id);
        expect(result).toBeDefined();
        expect(result.result.values.length).toBe(100);
      }
    }, 30000);

    it('should submit and process batch tasks', async () => {
      const tasks = [];
      const parameters = ['porosity', 'permeability', 'density'];

      for (const param of parameters) {
        tasks.push({
          name: `${param}批量计算`,
          inputData: {
            points: generateSamplePoints(20),
            grid: {
              origin: { x: 0, y: 0 },
              size: { x: 8, y: 8, z: 1 },
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

      const batch = await taskScheduler.submitBatchTasks({
        tasks,
        batchName: '集成测试批量任务',
        priority: 7,
      });

      expect(batch.id).toBeDefined();
      expect(batch.taskIds.length).toBe(3);

      await new Promise(resolve => setTimeout(resolve, 3000));

      const batchStatus = await taskScheduler.getBatchStatus(batch.id);
      expect(batchStatus.id).toBe(batch.id);
      expect(batchStatus.tasks.length).toBe(3);
    }, 15000);
  });

  describe('End-to-End Computation', () => {
    it('should complete full 3D interpolation workflow', async () => {
      const points = [];
      for (let i = 0; i < 30; i++) {
        points.push({
          x: Math.random() * 100,
          y: Math.random() * 100,
          z: Math.random() * 20,
          value: Math.random() * 0.5 + 0.2,
        });
      }

      const result = await computeKernel.interpolate({
        points,
        grid: {
          origin: { x: 0, y: 0, z: 0 },
          size: { x: 6, y: 6, z: 4 },
          spacing: { x: 10, y: 10, z: 5 },
        },
        params: {
          algorithm: 'idw',
          power: 3,
          maxNeighbors: 12,
        },
      });

      expect(result.data.values.length).toBe(144);

      const stats = result.data.stats;
      expect(stats.minValue).toBeGreaterThanOrEqual(0);
      expect(stats.maxValue).toBeLessThanOrEqual(1);
      expect(stats.meanValue).toBeGreaterThan(0);
    }, 10000);

    it('should handle batch processing with different algorithms', async () => {
      const points = generateSamplePoints(30);
      const batchTasks = [];

      const configs = [
        { algorithm: 'idw', params: { power: 2 } },
        { algorithm: 'idw', params: { power: 4 } },
        { algorithm: 'linear', params: { maxNeighbors: 3 } },
      ];

      for (let i = 0; i < configs.length; i++) {
        const config = configs[i];
        batchTasks.push({
          points,
          grid: {
            origin: { x: 0, y: 0 },
            size: { x: 10, y: 10, z: 1 },
            spacing: { x: 5, y: 5, z: 1 },
          },
          params: { algorithm: config.algorithm, ...config.params },
        });
      }

      const results = await computeKernel.interpolateBatch(batchTasks);

      expect(results.length).toBe(3);
      results.forEach((r, i) => {
        expect(r.data.values.length).toBe(100);
        expect(r.metadata.algorithm).toBe(configs[i].algorithm);
      });

      expect(results[0].data.values).not.toEqual(results[1].data.values);
    }, 15000);
  });

  describe('Result Statistics', () => {
    it('should compute correct statistics for results', async () => {
      const points = generateSamplePoints(25);
      const result = await computeKernel.interpolate({
        points,
        grid: {
          origin: { x: 0, y: 0 },
          size: { x: 10, y: 10, z: 1 },
          spacing: { x: 5, y: 5, z: 1 },
        },
        params: { algorithm: 'idw' },
      });

      const stats = result.data.stats;
      const values = result.data.values;

      const expectedMin = Math.min(...values);
      const expectedMax = Math.max(...values);
      const expectedMean = values.reduce((a, b) => a + b, 0) / values.length;

      expect(stats.minValue).toBeCloseTo(expectedMin, 5);
      expect(stats.maxValue).toBeCloseTo(expectedMax, 5);
      expect(stats.meanValue).toBeCloseTo(expectedMean, 5);
    }, 10000);
  });
});
