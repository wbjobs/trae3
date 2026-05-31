const KrigingInterpolator = require('../../src/compute-kernel/KrigingInterpolator');
const { IDWInterpolator, NearestNeighborInterpolator, LinearInterpolator } = require('../../src/compute-kernel/IDWInterpolator');

function generateTestPoints(count, seed = 42) {
  const points = [];
  let random = seed;
  function nextRandom() {
    random = (random * 1103515245 + 12345) & 0x7fffffff;
    return random / 0x7fffffff;
  }

  for (let i = 0; i < count; i++) {
    const x = nextRandom() * 100;
    const y = nextRandom() * 100;
    const value = Math.sin(x * 0.1) * Math.cos(y * 0.1) + nextRandom() * 0.2;
    points.push({ x, y, value: Math.abs(value) });
  }
  return points;
}

describe('IDW Interpolator', () => {
  let interpolator;
  let testPoints;

  beforeEach(() => {
    interpolator = new IDWInterpolator({ power: 2, maxNeighbors: 8 });
    testPoints = generateTestPoints(20);
  });

  it('should interpolate a single point', () => {
    const target = { x: 50, y: 50 };
    const result = interpolator.interpolate(target, testPoints);

    expect(result).toHaveProperty('value');
    expect(result).toHaveProperty('variance');
    expect(result).toHaveProperty('neighborsUsed');
    expect(typeof result.value).toBe('number');
    expect(isNaN(result.value)).toBe(false);
  });

  it('should return exact value at sample point', () => {
    const samplePoint = testPoints[0];
    const result = interpolator.interpolate(samplePoint, testPoints);

    expect(result.value).toBeCloseTo(samplePoint.value, 5);
    expect(result.exactMatch).toBe(true);
  });

  it('should use specified power parameter', () => {
    const i1 = new IDWInterpolator({ power: 1 });
    const i2 = new IDWInterpolator({ power: 3 });

    const target = { x: 50, y: 50 };
    const r1 = i1.interpolate(target, testPoints);
    const r2 = i2.interpolate(target, testPoints);

    expect(r1.value).not.toBe(r2.value);
  });

  it('should throw if no neighbors found', () => {
    const interpolator2 = new IDWInterpolator({ searchRadius: 1 });
    const target = { x: 1000, y: 1000 };

    expect(() => interpolator2.interpolate(target, testPoints)).toThrow();
  });
});

describe('Nearest Neighbor Interpolator', () => {
  let interpolator;
  let testPoints;

  beforeEach(() => {
    interpolator = new NearestNeighborInterpolator();
    testPoints = generateTestPoints(10);
  });

  it('should return value of nearest point', () => {
    const target = { x: testPoints[0].x + 0.1, y: testPoints[0].y + 0.1 };
    const result = interpolator.interpolate(target, testPoints);

    expect(result.value).toBeCloseTo(testPoints[0].value, 1);
    expect(result.neighborsUsed).toBe(1);
  });

  it('should respect search radius', () => {
    const interpolator2 = new NearestNeighborInterpolator({ searchRadius: 1 });
    const target = { x: 1000, y: 1000 };

    expect(() => interpolator2.interpolate(target, testPoints)).toThrow();
  });
});

describe('Linear Interpolator', () => {
  let interpolator;
  let testPoints;

  beforeEach(() => {
    interpolator = new LinearInterpolator({ maxNeighbors: 3 });
    testPoints = generateTestPoints(10);
  });

  it('should interpolate using at least 2 neighbors', () => {
    const target = { x: 50, y: 50 };
    const result = interpolator.interpolate(target, testPoints);

    expect(result.neighborsUsed).toBeGreaterThanOrEqual(2);
    expect(typeof result.value).toBe('number');
  });

  it('should throw if fewer than 2 neighbors available', () => {
    const interpolator2 = new LinearInterpolator({ maxNeighbors: 3, searchRadius: 1 });
    const target = { x: 1000, y: 1000 };

    expect(() => interpolator2.interpolate(target, testPoints)).toThrow();
  });
});

describe('Kriging Interpolator', () => {
  let interpolator;
  let testPoints;

  beforeEach(() => {
    interpolator = new KrigingInterpolator({
      variogram: {
        model: 'spherical',
        range: 50,
        sill: 1.0,
        nugget: 0.1,
      },
      maxNeighbors: 10,
    });
    testPoints = generateTestPoints(15);
  });

  it('should perform ordinary kriging by default', () => {
    const target = { x: 50, y: 50 };
    const result = interpolator.interpolate(target, testPoints);

    expect(result).toHaveProperty('value');
    expect(result).toHaveProperty('variance');
    expect(result.variance).toBeGreaterThanOrEqual(0);
  });

  it('should perform simple kriging', () => {
    const target = { x: 50, y: 50 };
    const result = interpolator.interpolate(target, testPoints, 'simple');

    expect(result).toHaveProperty('value');
    expect(result).toHaveProperty('variance');
  });

  it('should perform universal kriging', () => {
    const target = { x: 50, y: 50 };
    const result = interpolator.interpolate(target, testPoints, 'universal');

    expect(result).toHaveProperty('value');
    expect(result).toHaveProperty('variance');
  });

  it('should throw for unknown kriging type', () => {
    const target = { x: 50, y: 50 };
    expect(() => interpolator.interpolate(target, testPoints, 'unknown')).toThrow();
  });

  it('should throw if insufficient neighbors', () => {
    const interpolator2 = new KrigingInterpolator({
      variogram: { model: 'spherical', range: 50, sill: 1.0 },
      maxNeighbors: 1,
    });
    const target = { x: 50, y: 50 };

    expect(() => interpolator2.interpolate(target, testPoints)).toThrow();
  });
});

describe('Interpolator Edge Cases', () => {
  const testPoints = [
    { x: 0, y: 0, value: 1 },
    { x: 10, y: 0, value: 2 },
    { x: 0, y: 10, value: 3 },
    { x: 10, y: 10, value: 4 },
  ];

  it('should handle points with z-coordinate', () => {
    const points3D = [
      { x: 0, y: 0, z: 0, value: 1 },
      { x: 10, y: 0, z: 5, value: 2 },
      { x: 0, y: 10, z: 10, value: 3 },
      { x: 10, y: 10, z: 15, value: 4 },
    ];

    const interpolator = new IDWInterpolator();
    const target = { x: 5, y: 5, z: 7.5 };
    const result = interpolator.interpolate(target, points3D);

    expect(typeof result.value).toBe('number');
    expect(isNaN(result.value)).toBe(false);
  });

  it('should handle negative coordinates', () => {
    const negPoints = [
      { x: -10, y: -10, value: 1 },
      { x: 10, y: -10, value: 2 },
      { x: -10, y: 10, value: 3 },
      { x: 10, y: 10, value: 4 },
    ];

    const interpolator = new IDWInterpolator();
    const target = { x: 0, y: 0 };
    const result = interpolator.interpolate(target, negPoints);

    expect(result.value).toBeCloseTo(2.5, 1);
  });
});
