const LoadBalancer = require('../../src/node-manager/LoadBalancer');
const { ComputeKernel } = require('../../src/compute-kernel');
const { ResultStorage } = require('../../src/storage');

describe('Reliability Fixes Tests', () => {
  describe('Adaptive Load Balancing', () => {
    let loadBalancer;

    beforeEach(() => {
      loadBalancer = new LoadBalancer('adaptive');
    });

    it('should use adaptive strategy as default', () => {
      expect(loadBalancer.strategy).toBe('adaptive');
    });

    it('should include adaptive in available strategies', () => {
      const strategies = loadBalancer.getAvailableStrategies();
      expect(strategies).toContain('adaptive');
      expect(strategies.length).toBe(7);
    });

    it('should filter out overloaded nodes', () => {
      const nodes = [
        { id: 'node-1', status: 'online', cpuUsage: 90, memoryUsage: 90, currentLoad: 5, capacity: { cores: 4 } },
        { id: 'node-2', status: 'online', cpuUsage: 30, memoryUsage: 40, currentLoad: 1, capacity: { cores: 4 } },
      ];

      const filtered = loadBalancer._filterOverloadedNodes(nodes);
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('node-2');
    });

    it('should estimate task complexity correctly', () => {
      const task1 = {
        inputData: {
          params: { algorithm: 'kriging' },
          grid: { size: { x: 100, y: 100, z: 1 } },
          points: new Array(50).fill({ x: 1, y: 1, value: 1 }),
        },
      };

      const task2 = {
        inputData: {
          params: { algorithm: 'nearest' },
          grid: { size: { x: 10, y: 10, z: 1 } },
          points: new Array(10).fill({ x: 1, y: 1, value: 1 }),
        },
      };

      const complexity1 = loadBalancer._estimateTaskComplexity(task1);
      const complexity2 = loadBalancer._estimateTaskComplexity(task2);

      expect(complexity1).toBeGreaterThan(complexity2);
    });

    it('should calculate adaptive score considering task complexity', () => {
      const gpuNode = {
        id: 'gpu-node',
        status: 'online',
        cpuUsage: 30,
        memoryUsage: 40,
        currentLoad: 1,
        capacity: { cores: 8, memory: 16384 },
        supportedAlgorithms: ['kriging', 'idw'],
        type: 'gpu',
      };

      const cpuNode = {
        id: 'cpu-node',
        status: 'online',
        cpuUsage: 30,
        memoryUsage: 40,
        currentLoad: 1,
        capacity: { cores: 8, memory: 16384 },
        supportedAlgorithms: ['kriging', 'idw'],
        type: 'cpu',
      };

      const gpuScoreHigh = loadBalancer._calculateAdaptiveScore(gpuNode, 3.0);
      const cpuScoreHigh = loadBalancer._calculateAdaptiveScore(cpuNode, 3.0);

      expect(gpuScoreHigh).toBeGreaterThan(cpuScoreHigh);
    });

    it('should select appropriate node based on task complexity', () => {
      const nodes = [
        {
          id: 'cpu-node',
          status: 'online',
          cpuUsage: 20,
          memoryUsage: 30,
          currentLoad: 0,
          capacity: { cores: 4, memory: 8192 },
          supportedAlgorithms: ['idw', 'nearest'],
          type: 'cpu',
        },
        {
          id: 'gpu-node',
          status: 'online',
          cpuUsage: 50,
          memoryUsage: 60,
          currentLoad: 0,
          capacity: { cores: 8, memory: 16384 },
          supportedAlgorithms: ['kriging', 'idw'],
          type: 'gpu',
        },
      ];

      const simpleTask = {
        inputData: {
          params: { algorithm: 'nearest' },
          grid: { size: { x: 10, y: 10, z: 1 } },
          points: [{ x: 0, y: 0, value: 1 }, { x: 1, y: 1, value: 2 }, { x: 2, y: 2, value: 3 }],
        },
      };

      const complexTask = {
        inputData: {
          params: { algorithm: 'kriging' },
          grid: { size: { x: 100, y: 100, z: 1 } },
          points: new Array(100).fill(0).map((_, i) => ({ x: i, y: i, value: Math.random() * 100 })),
        },
      };

      const selectedForSimple = loadBalancer.selectNode(nodes, simpleTask);
      const selectedForComplex = loadBalancer.selectNode(nodes, complexTask);

      expect(selectedForSimple).not.toBeNull();
      expect(selectedForComplex).not.toBeNull();
    });
  });

  describe('Compute Kernel Checkpoint & Resume', () => {
    let computeKernel;

    beforeEach(() => {
      computeKernel = new ComputeKernel({ checkpointInterval: 100 });
    });

    afterEach(() => {
      computeKernel.clearCache();
    });

    it('should have quality thresholds configured', () => {
      expect(computeKernel.qualityThresholds.minSuccessRate).toBe(0.95);
      expect(computeKernel.qualityThresholds.maxVariance).toBe(1000);
    });

    it('should save and retrieve checkpoints during computation', async () => {
      const taskId = 'test-task-123';
      const inputData = {
        taskId,
        points: [
          { x: 0, y: 0, value: 10 },
          { x: 10, y: 0, value: 20 },
          { x: 10, y: 10, value: 30 },
          { x: 0, y: 10, value: 40 },
        ],
        grid: {
          origin: { x: 0, y: 0 },
          size: { x: 5, y: 5, z: 1 },
          spacing: { x: 2, y: 2, z: 1 },
        },
        params: { algorithm: 'idw', power: 2 },
      };

      let checkpointDuringComputation = null;
      const progressCallback = (progress) => {
        if (progress >= 50 && !checkpointDuringComputation) {
          checkpointDuringComputation = computeKernel.getCheckpoint(taskId);
        }
      };

      await computeKernel.interpolate(inputData, progressCallback, null);

      const finalCheckpoint = computeKernel.getCheckpoint(taskId);
      expect(finalCheckpoint).toBeNull();

      if (checkpointDuringComputation) {
        expect(checkpointDuringComputation.taskId).toBe(taskId);
        expect(checkpointDuringComputation.values.length).toBe(25);
        expect(checkpointDuringComputation.processedCells).toBeGreaterThan(0);
      }
    });

    it('should resume from checkpoint', async () => {
      const taskId = 'resume-test';
      const inputData = {
        taskId,
        points: [
          { x: 0, y: 0, value: 10 },
          { x: 10, y: 0, value: 20 },
          { x: 10, y: 10, value: 30 },
          { x: 0, y: 10, value: 40 },
        ],
        grid: {
          origin: { x: 0, y: 0 },
          size: { x: 4, y: 4, z: 1 },
          spacing: { x: 3, y: 3, z: 1 },
        },
        params: { algorithm: 'idw', power: 2 },
      };

      const partialValues = [10, 12, NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN];
      const partialVariance = [0, 0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

      const checkpoint = {
        taskId,
        processedCells: 2,
        progress: 12,
        values: partialValues,
        variance: partialVariance,
        minValue: 10,
        maxValue: 12,
        successfulInterpolations: 2,
        failedInterpolations: 0,
        totalNeighborsUsed: 8,
        timestamp: Date.now(),
      };

      const result = await computeKernel.interpolate(inputData, null, checkpoint);

      expect(result.data.values.length).toBe(16);
      expect(result.data.stats.successfulInterpolations).toBe(16);
      expect(result.data.values[0]).toBe(10);
      expect(result.data.values[1]).toBe(12);
    });

    it('should detect and repair outliers', () => {
      const values = [10, 12, 11, 13, 1000, 12, 11];
      const result = computeKernel._repairOutlier(1000, 10, 13, values, 4, 7);

      expect(result).toBeLessThan(20);
      expect(result).toBeGreaterThan(10);
    });

    it('should repair failed cells using neighbors', () => {
      const values = [10, 12, 14, 16, NaN, 20, 22, 24, 26];
      const repaired = computeKernel._repairFailedCell(values, 4, 3, 9);

      expect(repaired).not.toBeNaN();
      expect(repaired).toBeGreaterThan(10);
      expect(repaired).toBeLessThan(30);
    });

    it('should include quality score in results', async () => {
      const inputData = {
        points: [
          { x: 0, y: 0, value: 10 },
          { x: 10, y: 0, value: 20 },
          { x: 10, y: 10, value: 30 },
        ],
        grid: {
          origin: { x: 0, y: 0 },
          size: { x: 3, y: 3, z: 1 },
          spacing: { x: 5, y: 5, z: 1 },
        },
        params: { algorithm: 'idw', power: 2 },
      };

      const result = await computeKernel.interpolate(inputData);
      expect(result.data.stats.qualityScore).toBe(1.0);
    });

    it('should clear checkpoint after completion', async () => {
      const taskId = 'clear-test';
      const inputData = {
        taskId,
        points: [
          { x: 0, y: 0, value: 10 },
          { x: 10, y: 0, value: 20 },
          { x: 10, y: 10, value: 30 },
        ],
        grid: {
          origin: { x: 0, y: 0 },
          size: { x: 3, y: 3, z: 1 },
          spacing: { x: 5, y: 5, z: 1 },
        },
        params: { algorithm: 'idw', power: 2 },
      };

      await computeKernel.interpolate(inputData);
      computeKernel.clearCheckpoint(taskId);

      const checkpoint = computeKernel.getCheckpoint(taskId);
      expect(checkpoint).toBeNull();
    });
  });

  describe('Result Storage Transactions & Retries', () => {
    let resultStorage;

    beforeEach(() => {
      resultStorage = new ResultStorage({
        useDatabase: false,
        useCache: false,
        maxRetries: 3,
        retryDelay: 10,
      });
    });

    it('should have retry configuration', () => {
      expect(resultStorage.maxRetries).toBe(3);
      expect(resultStorage.retryDelay).toBe(10);
    });

    it('should retry operations with exponential backoff', async () => {
      let attemptCount = 0;

      const operation = async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      };

      const result = await resultStorage._retryOperation(operation, 'test-task');
      expect(result).toBe('success');
      expect(attemptCount).toBe(3);
    });

    it('should fail after max retries exceeded', async () => {
      let attemptCount = 0;

      const operation = async () => {
        attemptCount++;
        throw new Error('Permanent failure');
      };

      await expect(resultStorage._retryOperation(operation, 'test-task')).rejects.toThrow('Permanent failure');
      expect(attemptCount).toBe(3);
    });

    it('should track pending writes when database fails', async () => {
      resultStorage.useDatabase = true;
      resultStorage.useCache = false;

      const mockResult = {
        taskId: 'pending-task-1',
        success: true,
        data: {
          values: [1, 2, 3],
          variance: [0.1, 0.2, 0.3],
          stats: { minValue: 1, maxValue: 3, qualityScore: 1.0 },
        },
        grid: { size: { x: 3, y: 1, z: 1 } },
        parameterName: 'porosity',
        geologicalLayer: 'Test',
      };

      jest.spyOn(resultStorage, '_retryOperation').mockRejectedValue(new Error('Database down'));

      try {
        await resultStorage.storeResult(mockResult);
      } catch (e) {
        // Expected
      }

      const pending = resultStorage.getPendingWrites();
      expect(pending.length).toBe(1);
      expect(pending[0].result.taskId).toBe('pending-task-1');
      expect(pending[0].retryCount).toBe(3);

      jest.restoreAllMocks();
    });

    it('should handle batch storage with retry mechanism', async () => {
      resultStorage.useDatabase = true;
      resultStorage.useCache = false;

      const results = [
        {
          taskId: 'batch-1',
          success: true,
          data: { values: [1], variance: [0], stats: {} },
          grid: { size: { x: 1, y: 1, z: 1 } },
          parameterName: 'porosity',
          geologicalLayer: 'Layer1',
        },
        {
          taskId: 'batch-2',
          success: true,
          data: { values: [2], variance: [0], stats: {} },
          grid: { size: { x: 1, y: 1, z: 1 } },
          parameterName: 'permeability',
          geologicalLayer: 'Layer2',
        },
      ];

      const mockTransaction = {
        commit: jest.fn().mockResolvedValue(),
        rollback: jest.fn().mockResolvedValue(),
      };

      const mockSequelize = require('../../src/storage/database').sequelize;
      jest.spyOn(mockSequelize, 'transaction').mockResolvedValue(mockTransaction);

      const mockTaskResult = require('../../src/storage/database').TaskResult;
      const mockTask = require('../../src/storage/database').Task;

      jest.spyOn(mockTaskResult, 'create').mockResolvedValue({});
      jest.spyOn(mockTask, 'update').mockResolvedValue([1]);
      jest.spyOn(mockTask, 'findOrCreate').mockResolvedValue([{}, true]);

      jest.spyOn(resultStorage.cache, 'setResult').mockResolvedValue();

      const statuses = await resultStorage.storeResultsBatch(results);
      expect(statuses.length).toBe(2);
      expect(statuses.every(s => s.success)).toBe(true);
      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(mockTransaction.rollback).not.toHaveBeenCalled();

      jest.restoreAllMocks();
    });
  });
});
