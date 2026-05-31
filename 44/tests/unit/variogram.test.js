const {
  sphericalVariogram,
  exponentialVariogram,
  gaussianVariogram,
  linearVariogram,
  createVariogram,
  calculateDistance,
  calculateEmpiricalVariogram,
  fitVariogramModel,
} = require('../../src/compute-kernel/variogram');

describe('Variogram Models', () => {
  const testParams = { range: 100, sill: 1.0, nugget: 0.1 };

  describe('sphericalVariogram', () => {
    it('should return nugget at h=0', () => {
      expect(sphericalVariogram(0, 100, 1.0, 0.1)).toBe(0.1);
    });

    it('should return sill + nugget at h >= range', () => {
      expect(sphericalVariogram(100, 100, 1.0, 0.1)).toBeCloseTo(1.1, 5);
      expect(sphericalVariogram(150, 100, 1.0, 0.1)).toBe(1.1);
    });

    it('should interpolate correctly for 0 < h < range', () => {
      const result = sphericalVariogram(50, 100, 1.0, 0.1);
      expect(result).toBeGreaterThan(0.1);
      expect(result).toBeLessThan(1.1);
    });
  });

  describe('exponentialVariogram', () => {
    it('should return nugget at h=0', () => {
      expect(exponentialVariogram(0, 100, 1.0, 0.1)).toBe(0.1);
    });

    it('should approach sill as h increases', () => {
      const result = exponentialVariogram(300, 100, 1.0, 0.1);
      expect(result).toBeCloseTo(1.0, 3);
    });

    it('should be monotonic increasing', () => {
      const r1 = exponentialVariogram(10, 100, 1.0, 0.1);
      const r2 = exponentialVariogram(50, 100, 1.0, 0.1);
      const r3 = exponentialVariogram(100, 100, 1.0, 0.1);
      expect(r1).toBeLessThan(r2);
      expect(r2).toBeLessThan(r3);
    });
  });

  describe('gaussianVariogram', () => {
    it('should return nugget at h=0', () => {
      expect(gaussianVariogram(0, 100, 1.0, 0.1)).toBe(0.1);
    });

    it('should approach sill as h increases', () => {
      const result = gaussianVariogram(300, 100, 1.0, 0.1);
      expect(result).toBeCloseTo(1.0, 3);
    });
  });

  describe('linearVariogram', () => {
    it('should return nugget at h=0', () => {
      expect(linearVariogram(0, 100, 1.0, 0.1)).toBe(0.1);
    });

    it('should increase linearly until range', () => {
      const r1 = linearVariogram(25, 100, 1.0, 0.1);
      const r2 = linearVariogram(50, 100, 1.0, 0.1);
      expect(r2 - 0.1).toBeCloseTo(2 * (r1 - 0.1), 5);
    });

    it('should return sill + nugget at h >= range', () => {
      expect(linearVariogram(100, 100, 1.0, 0.1)).toBe(1.1);
      expect(linearVariogram(200, 100, 1.0, 0.1)).toBe(1.1);
    });
  });

  describe('createVariogram', () => {
    it('should create a spherical variogram function', () => {
      const v = createVariogram({ model: 'spherical', ...testParams });
      expect(typeof v).toBe('function');
      expect(v(0)).toBe(0.1);
    });

    it('should throw for unknown model', () => {
      expect(() => createVariogram({ model: 'unknown', ...testParams })).toThrow();
    });
  });

  describe('calculateDistance', () => {
    it('should calculate 2D distance correctly', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 3, y: 4 };
      expect(calculateDistance(p1, p2)).toBe(5);
    });

    it('should calculate 3D distance correctly', () => {
      const p1 = { x: 0, y: 0, z: 0 };
      const p2 = { x: 1, y: 2, z: 2 };
      expect(calculateDistance(p1, p2)).toBe(3);
    });
  });

  describe('calculateEmpiricalVariogram', () => {
    it('should calculate empirical variogram from points', () => {
      const points = [];
      for (let i = 0; i < 10; i++) {
        points.push({
          x: i * 10,
          y: 0,
          value: Math.sin(i * 0.5),
        });
      }

      const result = calculateEmpiricalVariogram(points, 10, 100);
      expect(result.lags.length).toBeGreaterThan(0);
      expect(result.variogramValues.length).toBe(result.lags.length);
    });
  });

  describe('fitVariogramModel', () => {
    it('should fit a variogram model to empirical data', () => {
      const empiricalData = {
        lags: [10, 20, 30, 40, 50],
        variogramValues: [0.2, 0.5, 0.7, 0.85, 0.95],
      };

      const result = fitVariogramModel(empiricalData, 'spherical');
      expect(result.model).toBe('spherical');
      expect(result.range).toBeGreaterThan(0);
      expect(result.sill).toBeGreaterThan(0);
    });

    it('should throw for insufficient data', () => {
      const empiricalData = {
        lags: [10],
        variogramValues: [0.2],
      };

      expect(() => fitVariogramModel(empiricalData, 'spherical')).toThrow();
    });
  });
});
