const LoadBalancer = require('../../src/node-manager/LoadBalancer');
const { ComputeKernel } = require('../../src/compute-kernel');
const { ResultValidator } = require('../../src/storage/ResultValidator');
const { PartitionManager } = require('../../src/storage/PartitionManager');
const { ResultStorage } = require('../../src/storage/ResultStorage');
const { crossValidate, fitVariogramModel, calculateEmpiricalVariogram, estimateOptimalGrid } = require('../../src/compute-kernel/variogram');
const logger = require('../../src/common/logger');

jest.mock('../../src/common/logger');

describe('Upgrade Feature Tests', () => {
  describe('Load Balancer - Multi-Dimension Scoring & Health Model', () => {
    let loadBalancer;

    beforeEach(() => {
      loadBalancer = new LoadBalancer('adaptive');
    });

    it('should have multi-dimension weight configuration', () => {
      const weights = loadBalancer.getWeights();
      expect(weights.cpu).toBeDefined();
      expect(weights.memory).toBeDefined();
      expect(weights.load).toBeDefined();
      expect(weights.capacity).toBeDefined();
      expect(weights.responseTime).toBeDefined();
      expect(weights.health).toBeDefined();

      const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
      expect(Math.abs(totalWeight - 1.0)).toBeLessThan(0.01);
    });

    it('should allow custom weight configuration', () => {
      loadBalancer.setWeights({ cpu: 0.4, memory: 0.3 });
      const weights = loadBalancer.getWeights();
      expect(weights.cpu).toBeGreaterThan(0);
      expect(weights.memory).toBeGreaterThan(0);
      expect(weights.cpu).toBeGreaterThanOrEqual(0.3);

      const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
      expect(Math.abs(totalWeight - 1.0)).toBeLessThan(0.01);
    });

    it('should track node health history', () => {
      loadBalancer.recordNodeHealth('node-1', {
        taskSuccess: true,
        responseTime: 500,
        cpuUsage: 40,
        memoryUsage: 30,
      });
      loadBalancer.recordNodeHealth('node-1', {
        taskSuccess: false,
        responseTime: 6000,
        cpuUsage: 95,
        memoryUsage: 90,
      });

      const report = loadBalancer.getNodeHealthReport('node-1');
      expect(report.nodeId).toBe('node-1');
      expect(report.health).toBeLessThan(1.0);
      expect(report.historyLength).toBe(2);
    });

    it('should classify node health status', () => {
      loadBalancer.recordNodeHealth('healthy-node', { taskSuccess: true, responseTime: 100 });
      const healthyReport = loadBalancer.getNodeHealthReport('healthy-node');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(healthyReport.status);

      for (let i = 0; i < 50; i++) {
        loadBalancer.recordNodeHealth('sick-node', { taskSuccess: false, responseTime: 8000 });
      }
      const sickReport = loadBalancer.getNodeHealthReport('sick-node');
      expect(sickReport.health).toBeLessThanOrEqual(healthyReport.health);
      expect(sickReport.status).toBe('unhealthy');
    });

    it('should record task results for health tracking', () => {
      loadBalancer.recordTaskResult('node-1', { success: true, executionTime: 1000 });
      loadBalancer.recordTaskResult('node-1', { success: false, executionTime: 5000 });
      loadBalancer.recordTaskResult('node-1', { success: true, executionTime: 800 });

      const report = loadBalancer.getNodeHealthReport('node-1');
      expect(report.recentTaskCount).toBe(3);
      expect(report.successRate).toBeLessThan(1.0);
      expect(report.avgResponseTime).toBeGreaterThan(0);
    });

    it('should filter nodes by health in overload check', () => {
      for (let i = 0; i < 20; i++) {
        loadBalancer.recordNodeHealth('unhealthy-node', { taskSuccess: false, responseTime: 10000 });
      }

      const nodes = [
        { id: 'healthy-node', status: 'online', currentLoad: 1, cpuUsage: 30, memoryUsage: 30, capacity: { cores: 4, memory: 8192 }, supportedAlgorithms: ['idw'] },
        { id: 'unhealthy-node', status: 'online', currentLoad: 1, cpuUsage: 30, memoryUsage: 30, capacity: { cores: 4, memory: 8192 }, supportedAlgorithms: ['idw'] },
      ];

      const selected = loadBalancer.selectNode(nodes);
      expect(selected).not.toBeNull();
      expect(selected.id).toBe('healthy-node');
    });

    it('should support dynamic threshold adjustment', () => {
      const initialThresholds = loadBalancer._getDynamicThresholds();
      expect(initialThresholds.cpuOverload).toBe(0.85);

      loadBalancer.updateDynamicThresholds({ avgClusterCpu: 0.6 });
      const updatedThresholds = loadBalancer._getDynamicThresholds();
      expect(updatedThresholds.cpuOverload).toBe(0.75);
    });

    it('should bound dynamic thresholds to valid ranges', () => {
      loadBalancer.updateDynamicThresholds({ avgClusterCpu: 0.0 });
      expect(loadBalancer._getDynamicThresholds().cpuOverload).toBeGreaterThanOrEqual(0.7);

      loadBalancer.updateDynamicThresholds({ avgClusterCpu: 1.0 });
      expect(loadBalancer._getDynamicThresholds().cpuOverload).toBeLessThanOrEqual(0.95);
    });

    it('should calculate multi-dimension score considering health', () => {
      const healthyNode = {
        id: 'h-node', status: 'online', currentLoad: 1, cpuUsage: 20, memoryUsage: 20,
        capacity: { cores: 8, memory: 16384 }, avgResponseTime: 100, supportedAlgorithms: ['kriging', 'idw'],
      };
      const degradedNode = {
        id: 'd-node', status: 'online', currentLoad: 1, cpuUsage: 20, memoryUsage: 20,
        capacity: { cores: 8, memory: 16384 }, avgResponseTime: 100, supportedAlgorithms: ['kriging', 'idw'],
      };

      loadBalancer.recordNodeHealth('d-node', { taskSuccess: false, responseTime: 8000, cpuUsage: 95 });

      const healthyScore = loadBalancer._calculateMultiDimensionScore(healthyNode, 1.0);
      const degradedScore = loadBalancer._calculateMultiDimensionScore(degradedNode, 1.0);
      expect(healthyScore).toBeGreaterThan(degradedScore);
    });

    it('should consider variogram type in task complexity estimation', () => {
      const baseTask = {
        inputData: {
          params: { algorithm: 'kriging' },
          grid: { size: { x: 10, y: 10, z: 1 } },
          points: new Array(20).fill({ x: 0, y: 0, value: 1 }),
        },
      };

      const gaussianTask = {
        ...baseTask,
        inputData: {
          ...baseTask.inputData,
          params: { algorithm: 'kriging', variogram: { model: 'gaussian' } },
        },
      };

      const baseComplexity = loadBalancer._estimateTaskComplexity(baseTask);
      const gaussianComplexity = loadBalancer._estimateTaskComplexity(gaussianTask);
      expect(gaussianComplexity).toBeGreaterThan(baseComplexity);
    });
  });

  describe('Compute Kernel - Precision & Cross-Validation', () => {
    let kernel;

    beforeEach(() => {
      kernel = new ComputeKernel({ crossValidation: false });
    });

    it('should have precision configuration', () => {
      expect(kernel.precisionConfig.crossValidation).toBe(false);
      expect(kernel.precisionConfig.crossValidationFolds).toBe(5);
      expect(kernel.precisionConfig.precisionTarget).toBe('standard');
    });

    it('should support cross-validation enabled mode', () => {
      const cvKernel = new ComputeKernel({ crossValidation: true, crossValidationFolds: 3 });
      expect(cvKernel.precisionConfig.crossValidation).toBe(true);
      expect(cvKernel.precisionConfig.crossValidationFolds).toBe(3);
    });

    it('should include outlier and repair counts in stats', async () => {
      const inputData = {
        points: [
          { x: 0, y: 0, value: 1 },
          { x: 1, y: 0, value: 2 },
          { x: 0, y: 1, value: 3 },
          { x: 1, y: 1, value: 4 },
          { x: 0.5, y: 0.5, value: 2.5 },
        ],
        grid: {
          origin: { x: 0, y: 0 },
          size: { x: 3, y: 3, z: 1 },
          spacing: { x: 0.5, y: 0.5, z: 1 },
        },
        params: { algorithm: 'idw' },
      };

      const result = await kernel.interpolate(inputData);
      expect(result.data.stats.outlierCount).toBeDefined();
      expect(result.data.stats.repairedCount).toBeDefined();
      expect(result.data.stats.highVarianceCount).toBeDefined();
    });

    it('should include precision level in metadata', async () => {
      const inputData = {
        points: [
          { x: 0, y: 0, value: 1 },
          { x: 1, y: 0, value: 2 },
          { x: 0, y: 1, value: 3 },
        ],
        grid: {
          origin: { x: 0, y: 0 },
          size: { x: 2, y: 2, z: 1 },
          spacing: { x: 1, y: 1, z: 1 },
        },
        params: { algorithm: 'idw' },
      };

      const result = await kernel.interpolate(inputData);
      expect(result.metadata.precisionLevel).toBe('standard');
    });

    it('should validate variogram fit', async () => {
      const points = [];
      for (let x = 0; x < 10; x++) {
        for (let y = 0; y < 10; y++) {
          points.push({ x, y, value: Math.sin(x * 0.5) + Math.cos(y * 0.3) + Math.random() * 0.1 });
        }
      }

      const fitResult = await kernel.validateVariogramFit(points, { model: 'spherical' });
      expect(fitResult).toBeDefined();
      expect(fitResult.model).toBe('spherical');
      expect(typeof fitResult.range).toBe('number');
      expect(typeof fitResult.sill).toBe('number');
      expect(typeof fitResult.nugget).toBe('number');
      expect(typeof fitResult.rmse).toBe('number');
      expect(typeof fitResult.r2).toBe('number');
      expect(['excellent', 'good', 'acceptable', 'poor']).toContain(fitResult.quality);
    });

    it('should perform cross-validation with kriging', async () => {
      const cvKernel = new ComputeKernel({ crossValidation: true, crossValidationFolds: 3 });

      const points = [];
      for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
          points.push({ x, y, value: x * 0.5 + y * 0.3 + Math.random() * 0.05 });
        }
      }

      const inputData = {
        points,
        grid: {
          origin: { x: 0, y: 0 },
          size: { x: 3, y: 3, z: 1 },
          spacing: { x: 2, y: 2, z: 1 },
        },
        params: {
          algorithm: 'kriging',
          variogram: { model: 'spherical', range: 5, sill: 2, nugget: 0.1 },
        },
      };

      const result = await cvKernel.interpolate(inputData);
      expect(result.data.stats.crossValidation).toBeDefined();
      expect(result.data.stats.crossValidation.rmse).toBeDefined();
      expect(result.data.stats.crossValidation.r2).toBeDefined();
      expect(result.data.stats.crossValidation.sampleCount).toBeGreaterThan(0);
    });
  });

  describe('Variogram - Improved Fitting & Cross-Validation', () => {
    it('should fit variogram with weighted SSE and return R2', () => {
      const lags = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const variogramValues = [0.5, 1.2, 2.0, 2.8, 3.5, 3.9, 4.0, 4.1, 4.0, 4.1];
      const counts = [10, 12, 15, 14, 11, 9, 8, 7, 6, 5];

      const result = fitVariogramModel({ lags, variogramValues, counts }, 'spherical');
      expect(result.model).toBe('spherical');
      expect(result.range).toBeGreaterThan(0);
      expect(result.sill).toBeGreaterThan(0);
      expect(result.rmse).toBeDefined();
      expect(result.r2).toBeDefined();
      expect(result.r2).toBeGreaterThan(-1);
    });

    it('should perform cross-validation with sufficient points', () => {
      const points = [];
      for (let x = 0; x < 6; x++) {
        for (let y = 0; y < 6; y++) {
          points.push({ x, y, value: x * 0.5 + y * 0.3 + Math.random() * 0.02 });
        }
      }

      const result = crossValidate(points, { model: 'spherical' }, 3);
      expect(result.rmse).toBeDefined();
      expect(result.mae).toBeDefined();
      expect(result.meanError).toBeDefined();
      expect(result.r2).toBeDefined();
      expect(result.sampleCount).toBeGreaterThan(0);
    });

    it('should estimate optimal grid for different precision targets', () => {
      const baseGrid = {
        size: { x: 10, y: 10, z: 1 },
        spacing: { x: 1, y: 1, z: 1 },
        origin: { x: 0, y: 0 },
      };

      const points = [];
      for (let i = 0; i < 20; i++) {
        points.push({ x: Math.random() * 10, y: Math.random() * 10, value: Math.random() * 50 + 20 });
      }

      const standardGrid = estimateOptimalGrid(points, baseGrid, 'standard');
      expect(standardGrid.refinementFactor).toBe(1);

      const highGrid = estimateOptimalGrid(points, baseGrid, 'high');
      expect(highGrid.refinementFactor).toBeGreaterThanOrEqual(1);

      const ultraGrid = estimateOptimalGrid(points, baseGrid, 'ultra');
      expect(ultraGrid.refinementFactor).toBe(3);
      expect(ultraGrid.size.x).toBe(30);
      expect(ultraGrid.spacing.x).toBeLessThan(baseGrid.spacing.x);
    });
  });

  describe('Result Validator - Auto Validation & Anomaly Marking', () => {
    let validator;

    beforeEach(() => {
      validator = new ResultValidator();
    });

    it('should validate a good result', () => {
      const result = {
        data: {
          values: [1.0, 1.2, 1.1, 0.9, 1.0, 1.1, 0.8, 1.2, 1.0, 0.9],
          variance: [0.1, 0.2, 0.1, 0.15, 0.1, 0.2, 0.1, 0.15, 0.1, 0.2],
          stats: {
            minValue: 0.8,
            maxValue: 1.2,
            meanValue: 1.02,
            totalCells: 10,
            successfulInterpolations: 10,
            failedInterpolations: 0,
            qualityScore: 1.0,
            outlierCount: 0,
            repairedCount: 0,
            highVarianceCount: 0,
            algorithm: 'idw',
          },
        },
        metadata: {
          algorithm: 'idw',
          grid: { size: { x: 5, y: 2, z: 1 }, origin: { x: 0, y: 0 }, spacing: { x: 1, y: 1, z: 1 } },
        },
      };

      const validation = validator.validate(result);
      expect(validation.valid).toBe(true);
      expect(validation.score).toBeGreaterThan(70);
      expect(validation.summary.qualityGrade).toBeDefined();
    });

    it('should detect high failure rate', () => {
      const result = {
        data: {
          values: new Array(100).fill(1.0),
          variance: new Array(100).fill(0.1),
          stats: {
            totalCells: 100,
            successfulInterpolations: 85,
            failedInterpolations: 15,
            qualityScore: 0.85,
            outlierCount: 0,
            highVarianceCount: 0,
            algorithm: 'kriging',
          },
        },
        metadata: { algorithm: 'kriging', grid: { size: { x: 10, y: 10, z: 1 } } },
      };

      const validation = validator.validate(result);
      expect(validation.valid).toBe(false);
      const highFailure = validation.issues.find(i => i.type === 'HIGH_FAILURE_RATE');
      expect(highFailure).toBeDefined();
      expect(highFailure.severity).toBe('critical');
    });

    it('should detect excessive outliers', () => {
      const values = new Array(100).fill(1.0);
      for (let i = 0; i < 10; i++) values[i] = 1000;

      const result = {
        data: {
          values,
          variance: new Array(100).fill(0.1),
          stats: {
            totalCells: 100,
            successfulInterpolations: 100,
            failedInterpolations: 0,
            qualityScore: 1.0,
            outlierCount: 10,
            repairedCount: 10,
            highVarianceCount: 0,
            algorithm: 'idw',
          },
        },
        metadata: { algorithm: 'idw', grid: { size: { x: 10, y: 10, z: 1 } } },
      };

      const validation = validator.validate(result);
      const outlierIssue = validation.issues.find(i => i.type === 'EXCESSIVE_OUTLIERS');
      expect(outlierIssue).toBeDefined();
    });

    it('should mark anomalies in result', () => {
      const values = [1.0, 1.1, 100.0, 1.2, 1.0, 1.1, NaN, 1.0, 1.2, 0.9];
      const variance = [0.1, 0.2, 50.0, 0.1, 0.1, 0.2, -1, 0.1, 0.1, 0.2];

      const result = {
        data: {
          values,
          variance,
          stats: {
            minValue: 0.9,
            maxValue: 100,
            meanValue: 12,
            totalCells: 10,
            successfulInterpolations: 9,
            failedInterpolations: 1,
            qualityScore: 0.9,
            outlierCount: 1,
            highVarianceCount: 1,
            algorithm: 'kriging',
          },
        },
        metadata: {
          algorithm: 'kriging',
          grid: { size: { x: 5, y: 2, z: 1 }, origin: { x: 0, y: 0 }, spacing: { x: 1, y: 1, z: 1 } },
        },
      };

      const marked = validator.markAnomalies(result);
      expect(marked.data.anomalies).toBeDefined();
      expect(marked.data.anomalyMap).toBeDefined();
      expect(marked.data.anomalyStats).toBeDefined();
      expect(marked.data.anomalyStats.totalAnomalies).toBeGreaterThan(0);
      expect(marked.data.anomalyStats.critical).toBeGreaterThan(0);
    });

    it('should generate recommendations based on issues', () => {
      const result = {
        data: {
          values: new Array(100).fill(1.0),
          variance: new Array(100).fill(-1),
          stats: {
            totalCells: 100,
            successfulInterpolations: 80,
            failedInterpolations: 20,
            qualityScore: 0.8,
            outlierCount: 0,
            highVarianceCount: 0,
            algorithm: 'kriging',
          },
        },
        metadata: { algorithm: 'kriging', grid: { size: { x: 10, y: 10, z: 1 } } },
      };

      const validation = validator.validate(result);
      expect(validation.recommendations.length).toBeGreaterThan(0);
    });

    it('should validate against input points', () => {
      const points = [
        { x: 0, y: 0, value: 1.0 },
        { x: 4, y: 0, value: 2.0 },
        { x: 0, y: 4, value: 3.0 },
      ];

      const result = {
        data: {
          values: [10.0, 1.5, 2.5, 2.0, 3.5, 4.0, 1.0, 2.0, 3.0, 2.5, 3.5, 4.0, 1.5, 2.5, 3.5, 4.0],
          variance: new Array(16).fill(0.1),
          stats: {
            totalCells: 16,
            successfulInterpolations: 16,
            failedInterpolations: 0,
            qualityScore: 1.0,
            outlierCount: 0,
            highVarianceCount: 0,
            algorithm: 'idw',
            meanValue: 3.0,
          },
        },
        metadata: {
          algorithm: 'idw',
          grid: { size: { x: 4, y: 4, z: 1 }, origin: { x: 0, y: 0 }, spacing: { x: 1, y: 1, z: 1 } },
        },
      };

      const validation = validator.validate(result, { points });
      expect(validation).toBeDefined();
    });

    it('should check cross-validation results', () => {
      const result = {
        data: {
          values: [1.0, 1.2, 1.1],
          variance: [0.1, 0.2, 0.1],
          stats: {
            totalCells: 3,
            successfulInterpolations: 3,
            failedInterpolations: 0,
            qualityScore: 1.0,
            outlierCount: 0,
            highVarianceCount: 0,
            algorithm: 'kriging',
            crossValidation: {
              rmse: 0.5,
              mae: 0.3,
              meanError: 0.01,
              r2: -0.2,
              sampleCount: 10,
            },
          },
        },
        metadata: { algorithm: 'kriging', grid: { size: { x: 3, y: 1, z: 1 } } },
      };

      const validation = validator.validate(result);
      const negR2 = validation.issues.find(i => i.type === 'NEGATIVE_R2');
      expect(negR2).toBeDefined();
    });
  });

  describe('Partition Manager - Storage Partitioning', () => {
    let partitionManager;

    beforeEach(() => {
      partitionManager = new PartitionManager({ partitionStrategy: 'time', partitionInterval: 'monthly' });
    });

    it('should generate time-based partition names', () => {
      const date = new Date('2025-03-15');
      const name = partitionManager.getPartitionName(date);
      expect(name).toBe('task_results_y2025m03');
    });

    it('should generate daily partition names', () => {
      const pm = new PartitionManager({ partitionInterval: 'daily' });
      const date = new Date('2025-06-01');
      expect(pm.getPartitionName(date)).toBe('task_results_y2025m06d01');
    });

    it('should generate quarterly partition names', () => {
      const pm = new PartitionManager({ partitionInterval: 'quarterly' });
      const date = new Date('2025-04-15');
      expect(pm.getPartitionName(date)).toBe('task_results_y2025q2');
    });

    it('should generate yearly partition names', () => {
      const pm = new PartitionManager({ partitionInterval: 'yearly' });
      const date = new Date('2025-07-01');
      expect(pm.getPartitionName(date)).toBe('task_results_y2025');
    });

    it('should generate parameter-based partition names', () => {
      const pm = new PartitionManager({ partitionStrategy: 'parameter' });
      expect(pm.getPartitionName(new Date(), 'porosity')).toBe('task_results_porosity');
      expect(pm.getPartitionName(new Date(), 'Permeability-XYZ')).toBe('task_results_permeability_xyz');
    });

    it('should generate hybrid partition names', () => {
      const pm = new PartitionManager({ partitionStrategy: 'hybrid' });
      const date = new Date('2025-03-15');
      const name = pm.getPartitionName(date, 'porosity');
      expect(name).toContain('y2025m03');
      expect(name).toContain('porosity');
    });

    it('should parse partition time ranges', () => {
      const range = partitionManager.getPartitionTimeRange('task_results_y2025m03');
      expect(range).not.toBeNull();
      expect(range.startDate.getFullYear()).toBe(2025);
      expect(range.startDate.getMonth()).toBe(2);
      expect(range.endDate.getMonth()).toBe(3);
    });

    it('should route queries by time', () => {
      const route = partitionManager.routeQuery({
        startDate: '2025-01-01',
        endDate: '2025-03-31',
      });
      expect(route.strategy).toBe('targeted');
      expect(route.partitions.length).toBe(3);
      expect(route.partitions).toContain('task_results_y2025m01');
      expect(route.partitions).toContain('task_results_y2025m02');
      expect(route.partitions).toContain('task_results_y2025m03');
    });

    it('should route queries by parameter', () => {
      const pm = new PartitionManager({ partitionStrategy: 'parameter' });
      const route = pm.routeQuery({ parameterName: 'porosity' });
      expect(route.strategy).toBe('targeted');
      expect(route.partitions).toContain('task_results_porosity');
    });

    it('should return scan_all when no constraints specified', () => {
      const route = partitionManager.routeQuery({});
      expect(route.strategy).toBe('scan_all');
    });

    it('should route queries by hybrid strategy', () => {
      const pm = new PartitionManager({ partitionStrategy: 'hybrid' });
      const route = pm.routeQuery({
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        parameterName: 'porosity',
      });
      expect(route.strategy).toBe('targeted');
      expect(route.partitions.length).toBe(1);
      expect(route.partitions[0]).toContain('porosity');
      expect(route.partitions[0]).toContain('y2025m01');
    });
  });

  describe('ResultStorage - Integrated Validation & Partitioning', () => {
    let resultStorage;

    beforeEach(() => {
      resultStorage = new ResultStorage({
        useDatabase: false,
        useCache: false,
        autoValidate: true,
        autoMarkAnomalies: false,
      });
    });

    it('should have validator and partition manager instances', () => {
      expect(resultStorage.validator).toBeDefined();
      expect(resultStorage.partitionManager).toBeDefined();
      expect(resultStorage.autoValidate).toBe(true);
    });

    it('should expose validateResult method', () => {
      const result = {
        data: {
          values: [1.0, 1.1, 1.0, 0.9, 1.2],
          variance: [0.1, 0.2, 0.1, 0.15, 0.1],
          stats: {
            totalCells: 5,
            successfulInterpolations: 5,
            failedInterpolations: 0,
            qualityScore: 1.0,
            outlierCount: 0,
            highVarianceCount: 0,
            algorithm: 'idw',
          },
        },
        metadata: {
          algorithm: 'idw',
          grid: { size: { x: 5, y: 1, z: 1 } },
        },
      };

      const validation = resultStorage.validateResult(result);
      expect(validation.valid).toBeDefined();
      expect(validation.score).toBeDefined();
    });

    it('should expose markResultAnomalies method', () => {
      const result = {
        data: {
          values: [1.0, 1.1, 1.0, 0.9, 1.2],
          variance: [0.1, 0.2, 0.1, 0.15, 0.1],
          stats: {
            totalCells: 5,
            successfulInterpolations: 5,
            failedInterpolations: 0,
            qualityScore: 1.0,
            outlierCount: 0,
            highVarianceCount: 0,
            algorithm: 'idw',
          },
        },
        metadata: {
          algorithm: 'idw',
          grid: { size: { x: 5, y: 1, z: 1 }, origin: { x: 0, y: 0 }, spacing: { x: 1, y: 1, z: 1 } },
        },
      };

      const marked = resultStorage.markResultAnomalies(result);
      expect(marked.data.anomalies).toBeDefined();
      expect(marked.data.anomalyMap).toBeDefined();
    });

    it('should expose partition routing method', () => {
      const route = resultStorage.getPartitionRoute({
        startDate: '2025-01-01',
        endDate: '2025-03-31',
      });
      expect(route).toBeDefined();
      expect(route.partitions.length).toBeGreaterThan(0);
    });
  });
});
