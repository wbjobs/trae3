const { ComputeKernel } = require('../../src/compute-kernel/ComputeKernel');
const { InterpolationError } = require('../../src/common/errors');

function generatePoints(count) {
  const points = [];
  for (let i = 0; i < count; i++) {
    points.push({
      x: Math.random() * 100,
      y: Math.random() * 100,
      value: Math.random(),
    });
  }
  return points;
}

describe('ComputeKernel', () => {
  let kernel;
  let testPoints;
  let testGrid;

  beforeEach(() => {
    kernel = new ComputeKernel();
    testPoints = generatePoints(20);
    testGrid = {
      origin: { x: 0, y: 0 },
      size: { x: 10, y: 10, z: 1 },
      spacing: { x: 5, y: 5, z: 1 },
    };
  });

  describe('validateInput', () => {
    it('should pass for valid input', () => {
      const input = {
        points: testPoints,
        grid: testGrid,
        params: { algorithm: 'idw' },
      };

      expect(() => kernel.validateInput(input)).not.toThrow();
    });

    it('should throw for missing points', () => {
      const input = {
        grid: testGrid,
        params: { algorithm: 'idw' },
      };

      expect(() => kernel.validateInput(input)).toThrow(InterpolationError);
    });

    it('should throw for insufficient points', () => {
      const input = {
        points: [{ x: 0, y: 0, value: 1 }],
        grid: testGrid,
        params: { algorithm: 'idw' },
      };

      expect(() => kernel.validateInput(input)).toThrow(InterpolationError);
    });

    it('should throw for missing grid', () => {
      const input = {
        points: testPoints,
        params: { algorithm: 'idw' },
      };

      expect(() => kernel.validateInput(input)).toThrow(InterpolationError);
    });

    it('should throw for missing algorithm', () => {
      const input = {
        points: testPoints,
        grid: testGrid,
        params: {},
      };

      expect(() => kernel.validateInput(input)).toThrow(InterpolationError);
    });

    it('should not throw for unknown algorithm in validateInput', () => {
      const input = {
        points: testPoints,
        grid: testGrid,
        params: { algorithm: 'unknown' },
      };

      expect(() => kernel.validateInput(input)).not.toThrow();
    });

    it('should throw for unknown algorithm when getting interpolator', () => {
      expect(() => kernel._getInterpolator({ algorithm: 'unknown' })).toThrow(InterpolationError);
    });
  });

  describe('interpolate - IDW', () => {
    it('should perform IDW interpolation', async () => {
      const result = await kernel.interpolate({
        points: testPoints,
        grid: testGrid,
        params: {
          algorithm: 'idw',
          power: 2,
          maxNeighbors: 8,
        },
      });

      expect(result).toHaveProperty('data');
      expect(result.data).toHaveProperty('values');
      expect(result).toHaveProperty('metadata');
      expect(result.data.values.length).toBe(100);
      expect(result.metadata.algorithm).toBe('idw');
      expect(result.metadata.params.power).toBe(2);
    });

    it('should include statistics in result', async () => {
      const result = await kernel.interpolate({
        points: testPoints,
        grid: testGrid,
        params: { algorithm: 'idw' },
      });

      expect(result.data).toHaveProperty('stats');
      expect(result.data.stats).toHaveProperty('minValue');
      expect(result.data.stats).toHaveProperty('maxValue');
      expect(result.data.stats).toHaveProperty('meanValue');
      expect(result.data.stats.computationTime).toBeGreaterThan(0);
    });
  });

  describe('interpolate - Nearest Neighbor', () => {
    it('should perform nearest neighbor interpolation', async () => {
      const result = await kernel.interpolate({
        points: testPoints,
        grid: testGrid,
        params: { algorithm: 'nearest' },
      });

      expect(result.data.values.length).toBe(100);
      expect(result.metadata.algorithm).toBe('nearest');
    });
  });

  describe('interpolate - Linear', () => {
    it('should perform linear interpolation', async () => {
      const result = await kernel.interpolate({
        points: testPoints,
        grid: testGrid,
        params: { algorithm: 'linear', maxNeighbors: 3 },
      });

      expect(result.data.values.length).toBe(100);
      expect(result.metadata.algorithm).toBe('linear');
    });
  });

  describe('interpolate - Kriging', () => {
    it('should perform ordinary kriging interpolation', async () => {
      const result = await kernel.interpolate({
        points: testPoints,
        grid: testGrid,
        params: {
          algorithm: 'kriging',
          type: 'ordinary',
          variogram: {
            model: 'spherical',
            range: 50,
            sill: 1.0,
            nugget: 0.1,
          },
          maxNeighbors: 10,
        },
      });

      expect(result.data.values.length).toBe(100);
      expect(result.metadata.algorithm).toBe('kriging');
      expect(result.data.variance.length).toBe(100);
    });

    it('should perform simple kriging interpolation', async () => {
      const result = await kernel.interpolate({
        points: testPoints,
        grid: testGrid,
        params: {
          algorithm: 'kriging',
          type: 'simple',
          mean: 0.5,
          variogram: { model: 'exponential', range: 50, sill: 1.0 },
        },
      });

      expect(result.data.values.length).toBe(100);
      expect(result.metadata.algorithm).toBe('kriging');
    });

    it('should perform universal kriging interpolation', async () => {
      const result = await kernel.interpolate({
        points: testPoints,
        grid: testGrid,
        params: {
          algorithm: 'kriging',
          type: 'universal',
          driftOrder: 1,
          variogram: { model: 'gaussian', range: 50, sill: 1.0 },
        },
      });

      expect(result.data.values.length).toBe(100);
      expect(result.metadata.algorithm).toBe('kriging');
    });

    it('should use provided variogram parameters', async () => {
      const result = await kernel.interpolate({
        points: testPoints,
        grid: testGrid,
        params: {
          algorithm: 'kriging',
          type: 'ordinary',
          variogram: {
            model: 'spherical',
            range: 50,
            sill: 1.0,
            nugget: 0.1,
          },
          maxNeighbors: 10,
        },
      });

      expect(result.data.values.length).toBe(100);
      expect(result.metadata.params.variogram).toBeDefined();
      expect(result.metadata.params.variogram.model).toBe('spherical');
    });
  });

  describe('interpolateBatch', () => {
    it('should perform batch interpolation with multiple grids', async () => {
      const tasks = [
        {
          points: testPoints,
          grid: testGrid,
          params: { algorithm: 'idw', power: 2 },
        },
        {
          points: testPoints,
          grid: {
            origin: { x: 50, y: 50 },
            size: { x: 5, y: 5, z: 1 },
            spacing: { x: 5, y: 5, z: 1 },
          },
          params: { algorithm: 'nearest' },
        },
      ];

      const results = await kernel.interpolateBatch(tasks);

      expect(results.length).toBe(2);
      expect(results[0].data.values.length).toBe(100);
      expect(results[1].data.values.length).toBe(25);
    });

    it('should throw for invalid input in batch processing', async () => {
      const tasks = [
        {
          points: testPoints,
          grid: testGrid,
          params: { algorithm: 'idw' },
        },
        {
          points: [],
          grid: testGrid,
          params: { algorithm: 'idw' },
        },
      ];

      await expect(kernel.interpolateBatch(tasks)).rejects.toThrow();
    });

    it('should report progress for batch processing', async () => {
      const tasks = [];
      for (let i = 0; i < 3; i++) {
        tasks.push({
          points: testPoints,
          grid: {
            origin: { x: 0, y: 0 },
            size: { x: 5, y: 5, z: 1 },
            spacing: { x: 5, y: 5, z: 1 },
          },
          params: { algorithm: 'idw' },
        });
      }

      const progressValues = [];
      const progressCallback = (progress) => progressValues.push(progress);
      
      const results = await kernel.interpolateBatch(tasks, progressCallback);

      expect(results.length).toBe(3);
      expect(progressValues.length).toBeGreaterThan(0);
      expect(progressValues[progressValues.length - 1]).toBe(100);
    }, 30000);
  });

  describe('getSupportedAlgorithms', () => {
    it('should return list of supported algorithms', () => {
      const algorithms = kernel.getSupportedAlgorithms();
      expect(Array.isArray(algorithms)).toBe(true);
      expect(algorithms.length).toBeGreaterThan(0);

      expect(algorithms).toContain('idw');
      expect(algorithms).toContain('kriging');
      expect(algorithms).toContain('nearest');
      expect(algorithms).toContain('linear');
    });
  });

  describe('clearCache', () => {
    it('should clear interpolator cache', () => {
      kernel._getInterpolator({ algorithm: 'idw', power: 2 });
      expect(kernel.interpolators.size).toBe(1);
      
      kernel.clearCache();
      expect(kernel.interpolators.size).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle points with duplicate coordinates', async () => {
      const points = [
        { x: 0, y: 0, value: 1 },
        { x: 0, y: 0, value: 2 },
        { x: 10, y: 10, value: 3 },
        { x: 20, y: 20, value: 4 },
      ];

      const result = await kernel.interpolate({
        points,
        grid: testGrid,
        params: { algorithm: 'idw' },
      });

      expect(result.data.values.length).toBe(100);
    });

    it('should handle large values', async () => {
      const points = [
        { x: 0, y: 0, value: 1e6 },
        { x: 100, y: 0, value: 2e6 },
        { x: 0, y: 100, value: 3e6 },
        { x: 100, y: 100, value: 4e6 },
      ];

      const result = await kernel.interpolate({
        points,
        grid: testGrid,
        params: { algorithm: 'idw' },
      });

      const stats = result.data.stats;
      expect(stats.maxValue).toBeGreaterThan(1e6);
    });

    it('should handle negative values', async () => {
      const points = [
        { x: 0, y: 0, value: -1 },
        { x: 10, y: 0, value: -2 },
        { x: 0, y: 10, value: -3 },
        { x: 10, y: 10, value: -4 },
      ];

      const result = await kernel.interpolate({
        points,
        grid: testGrid,
        params: { algorithm: 'idw' },
      });

      const stats = result.data.stats;
      expect(stats.minValue).toBeLessThan(0);
      expect(stats.maxValue).toBeLessThan(0);
    });

    it('should handle exactly 3 points for linear interpolation', async () => {
      const points = [
        { x: 0, y: 0, value: 1 },
        { x: 10, y: 0, value: 2 },
        { x: 0, y: 10, value: 3 },
      ];

      const result = await kernel.interpolate({
        points,
        grid: testGrid,
        params: { algorithm: 'linear' },
      });

      expect(result.data.values.length).toBe(100);
    });
  });
});
