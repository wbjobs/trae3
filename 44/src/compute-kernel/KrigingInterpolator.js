const { createVariogram, calculateDistance } = require('./variogram');
const { InterpolationError } = require('../common/errors');

class KrigingInterpolator {
  constructor(params) {
    this.variogram = createVariogram(params.variogram || params);
    this.params = params;
    this.maxNeighbors = params.maxNeighbors || 12;
    this.searchRadius = params.searchRadius || Infinity;
  }

  _solveLinearSystem(A, b) {
    const n = A.length;
    const augmented = A.map((row, i) => [...row, b[i]]);

    for (let i = 0; i < n; i++) {
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
          maxRow = k;
        }
      }

      [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

      if (Math.abs(augmented[i][i]) < 1e-10) {
        throw new InterpolationError(
          'Singular matrix in Kriging system',
          'kriging',
          { pivot: augmented[i][i] }
        );
      }

      for (let k = i + 1; k < n; k++) {
        const c = augmented[k][i] / augmented[i][i];
        for (let j = i; j <= n; j++) {
          augmented[k][j] -= c * augmented[i][j];
        }
      }
    }

    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      x[i] = augmented[i][n] / augmented[i][i];
      for (let k = i - 1; k >= 0; k--) {
        augmented[k][n] -= augmented[k][i] * x[i];
      }
    }

    return x;
  }

  _findNeighbors(target, points) {
    const neighbors = points
      .map((point, index) => ({
        point,
        index,
        distance: calculateDistance(target, point),
      }))
      .filter(n => n.distance <= this.searchRadius)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, this.maxNeighbors);

    if (neighbors.length < 2) {
      throw new InterpolationError(
        'Insufficient neighbors for Kriging interpolation',
        'kriging',
        { found: neighbors.length, required: 2, maxNeighbors: this.maxNeighbors }
      );
    }

    return neighbors;
  }

  interpolate(target, points, type = 'ordinary') {
    const neighbors = this._findNeighbors(target, points);
    const n = neighbors.length;

    const values = neighbors.map(n => n.point.value);
    const distances = neighbors.map(n => n.distance);
    const pairwiseDistances = [];

    for (let i = 0; i < n; i++) {
      pairwiseDistances[i] = [];
      for (let j = 0; j < n; j++) {
        pairwiseDistances[i][j] = calculateDistance(
          neighbors[i].point,
          neighbors[j].point
        );
      }
    }

    let result;

    if (type === 'ordinary') {
      result = this._ordinaryKriging(
        values,
        distances,
        pairwiseDistances,
        n
      );
    } else if (type === 'simple') {
      result = this._simpleKriging(
        values,
        distances,
        pairwiseDistances,
        n,
        points.reduce((sum, p) => sum + p.value, 0) / points.length
      );
    } else if (type === 'universal') {
      result = this._universalKriging(
        neighbors.map(n => n.point),
        target,
        values,
        distances,
        pairwiseDistances,
        n
      );
    } else {
      throw new InterpolationError(
        `Unknown Kriging type: ${type}`,
        'kriging',
        { availableTypes: ['ordinary', 'simple', 'universal'] }
      );
    }

    return {
      value: result.value,
      variance: result.variance,
      neighborsUsed: n,
      meanDistance: distances.reduce((a, b) => a + b, 0) / n,
    };
  }

  _ordinaryKriging(values, distances, pairwiseDistances, n) {
    const matrixSize = n + 1;
    const A = [];
    const b = [];

    for (let i = 0; i < n; i++) {
      A[i] = [];
      for (let j = 0; j < n; j++) {
        A[i][j] = this.variogram(pairwiseDistances[i][j]);
      }
      A[i][n] = 1;
      b[i] = this.variogram(distances[i]);
    }

    A[n] = [];
    for (let j = 0; j < n; j++) {
      A[n][j] = 1;
    }
    A[n][n] = 0;
    b[n] = 1;

    const solution = this._solveLinearSystem(A, b);
    const weights = solution.slice(0, n);
    const lagrange = solution[n];

    let estimatedValue = 0;
    let estimationVariance = lagrange;

    for (let i = 0; i < n; i++) {
      estimatedValue += weights[i] * values[i];
      estimationVariance += weights[i] * b[i];
    }

    return {
      value: estimatedValue,
      variance: Math.max(0, estimationVariance),
    };
  }

  _simpleKriging(values, distances, pairwiseDistances, n, mean) {
    const A = [];
    const b = [];

    for (let i = 0; i < n; i++) {
      A[i] = [];
      for (let j = 0; j < n; j++) {
        A[i][j] = this.variogram(pairwiseDistances[i][j]);
      }
      b[i] = this.variogram(distances[i]);
    }

    const solution = this._solveLinearSystem(A, b);

    const centeredValues = values.map(v => v - mean);
    let estimatedValue = mean;
    let estimationVariance = this.variogram(0);

    for (let i = 0; i < n; i++) {
      estimatedValue += solution[i] * centeredValues[i];
      estimationVariance -= solution[i] * b[i];
    }

    return {
      value: estimatedValue,
      variance: Math.max(0, estimationVariance),
    };
  }

  _universalKriging(points, target, values, distances, pairwiseDistances, n) {
    const driftOrder = 1;
    const driftTerms = this._getDriftTerms(points, driftOrder);
    const targetDrift = this._getDriftTerms([target], driftOrder)[0];
    const k = driftTerms[0].length;

    const matrixSize = n + k;
    const A = [];
    const b = [];

    for (let i = 0; i < n; i++) {
      A[i] = [];
      for (let j = 0; j < n; j++) {
        A[i][j] = this.variogram(pairwiseDistances[i][j]);
      }
      for (let j = 0; j < k; j++) {
        A[i][n + j] = driftTerms[i][j];
      }
      b[i] = this.variogram(distances[i]);
    }

    for (let i = 0; i < k; i++) {
      A[n + i] = [];
      for (let j = 0; j < n; j++) {
        A[n + i][j] = driftTerms[j][i];
      }
      for (let j = 0; j < k; j++) {
        A[n + i][n + j] = 0;
      }
      b[n + i] = targetDrift[i];
    }

    const solution = this._solveLinearSystem(A, b);
    const weights = solution.slice(0, n);

    let estimatedValue = 0;
    let estimationVariance = 0;

    for (let i = 0; i < n; i++) {
      estimatedValue += weights[i] * values[i];
      estimationVariance += weights[i] * b[i];
    }

    for (let i = 0; i < k; i++) {
      estimationVariance += solution[n + i] * b[n + i];
    }

    return {
      value: estimatedValue,
      variance: Math.max(0, estimationVariance),
    };
  }

  _getDriftTerms(points, order) {
    return points.map(p => {
      const terms = [1];
      if (order >= 1) {
        terms.push(p.x, p.y);
        if (p.z !== undefined) terms.push(p.z);
      }
      if (order >= 2) {
        terms.push(p.x * p.x, p.x * p.y, p.y * p.y);
        if (p.z !== undefined) {
          terms.push(p.x * p.z, p.y * p.z, p.z * p.z);
        }
      }
      return terms;
    });
  }
}

module.exports = KrigingInterpolator;
