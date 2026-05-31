const { calculateDistance } = require('./variogram');
const { InterpolationError } = require('../common/errors');

class IDWInterpolator {
  constructor(params = {}) {
    this.power = params.power || 2;
    this.maxNeighbors = params.maxNeighbors || 12;
    this.searchRadius = params.searchRadius || Infinity;
    this.epsilon = params.epsilon || 1e-10;
  }

  interpolate(target, points) {
    let totalWeight = 0;
    let weightedSum = 0;
    let neighborsUsed = 0;
    let minDistance = Infinity;
    let nearestValue = null;

    const neighbors = points
      .map(point => ({
        point,
        distance: calculateDistance(target, point),
      }))
      .filter(n => n.distance <= this.searchRadius)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, this.maxNeighbors);

    if (neighbors.length === 0) {
      throw new InterpolationError(
        'No neighbors found within search radius',
        'idw',
        { searchRadius: this.searchRadius }
      );
    }

    for (const { point, distance } of neighbors) {
      if (distance < minDistance) {
        minDistance = distance;
        nearestValue = point.value;
      }

      if (distance < this.epsilon) {
        return {
          value: point.value,
          variance: 0,
          neighborsUsed: 1,
          meanDistance: 0,
          exactMatch: true,
        };
      }

      const weight = 1 / Math.pow(distance, this.power);
      weightedSum += weight * point.value;
      totalWeight += weight;
      neighborsUsed++;
    }

    if (totalWeight === 0) {
      throw new InterpolationError(
        'Total weight is zero, cannot interpolate',
        'idw',
        { neighborsUsed, minDistance }
      );
    }

    const estimatedValue = weightedSum / totalWeight;
    const variance = this._calculateVariance(neighbors, estimatedValue);
    const meanDistance = neighbors.reduce((sum, n) => sum + n.distance, 0) / neighbors.length;

    return {
      value: estimatedValue,
      variance,
      neighborsUsed,
      meanDistance,
      nearestDistance: minDistance,
    };
  }

  _calculateVariance(neighbors, estimatedValue) {
    if (neighbors.length < 2) return 0;

    const weightedSumSq = neighbors.reduce((sum, { point, distance }) => {
      const weight = 1 / Math.pow(distance, this.power);
      return sum + weight * Math.pow(point.value - estimatedValue, 2);
    }, 0);

    const totalWeight = neighbors.reduce((sum, { distance }) => {
      return sum + 1 / Math.pow(distance, this.power);
    }, 0);

    return Math.sqrt(weightedSumSq / totalWeight);
  }
}

class NearestNeighborInterpolator {
  constructor(params = {}) {
    this.searchRadius = params.searchRadius || Infinity;
  }

  interpolate(target, points) {
    let nearestPoint = null;
    let minDistance = Infinity;

    for (const point of points) {
      const distance = calculateDistance(target, point);
      if (distance <= this.searchRadius && distance < minDistance) {
        minDistance = distance;
        nearestPoint = point;
      }
    }

    if (!nearestPoint) {
      throw new InterpolationError(
        'No neighbors found within search radius',
        'nearest',
        { searchRadius: this.searchRadius }
      );
    }

    return {
      value: nearestPoint.value,
      variance: 0,
      neighborsUsed: 1,
      meanDistance: minDistance,
      nearestDistance: minDistance,
    };
  }
}

class LinearInterpolator {
  constructor(params = {}) {
    this.maxNeighbors = params.maxNeighbors || 3;
    this.searchRadius = params.searchRadius || Infinity;
  }

  interpolate(target, points) {
    const neighbors = points
      .map(point => ({
        point,
        distance: calculateDistance(target, point),
      }))
      .filter(n => n.distance <= this.searchRadius)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, this.maxNeighbors);

    if (neighbors.length < 2) {
      throw new InterpolationError(
        'At least 2 neighbors required for linear interpolation',
        'linear',
        { found: neighbors.length }
      );
    }

    if (neighbors.length === 2) {
      return this._linear1D(target, neighbors);
    } else if (neighbors.length === 3) {
      return this._linear2D(target, neighbors);
    } else {
      return this._linearND(target, neighbors);
    }
  }

  _linear1D(target, neighbors) {
    const [p1, p2] = neighbors;
    const d1 = p1.distance;
    const d2 = p2.distance;

    if (d1 + d2 === 0) {
      return {
        value: p1.point.value,
        variance: 0,
        neighborsUsed: 2,
        meanDistance: 0,
      };
    }

    const w1 = d2 / (d1 + d2);
    const w2 = d1 / (d1 + d2);
    const value = w1 * p1.point.value + w2 * p2.point.value;
    const variance = Math.abs(p1.point.value - p2.point.value) * 0.5;

    return {
      value,
      variance,
      neighborsUsed: 2,
      meanDistance: (d1 + d2) / 2,
    };
  }

  _linear2D(target, neighbors) {
    const [p1, p2, p3] = neighbors;

    const x1 = p1.point.x, y1 = p1.point.y, v1 = p1.point.value;
    const x2 = p2.point.x, y2 = p2.point.y, v2 = p2.point.value;
    const x3 = p3.point.x, y3 = p3.point.y, v3 = p3.point.value;
    const x = target.x, y = target.y;

    const det = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
    if (Math.abs(det) < 1e-10) {
      return this._linearND(target, neighbors);
    }

    const l1 = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / det;
    const l2 = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / det;
    const l3 = 1 - l1 - l2;

    const value = l1 * v1 + l2 * v2 + l3 * v3;
    const values = [v1, v2, v3];
    const variance = (Math.max(...values) - Math.min(...values)) * 0.3;

    return {
      value,
      variance,
      neighborsUsed: 3,
      meanDistance: (p1.distance + p2.distance + p3.distance) / 3,
    };
  }

  _linearND(target, neighbors) {
    const distances = neighbors.map(n => n.distance);
    const values = neighbors.map(n => n.point.value);

    const totalDistance = distances.reduce((a, b) => a + b, 0);
    if (totalDistance === 0) {
      return {
        value: values[0],
        variance: 0,
        neighborsUsed: neighbors.length,
        meanDistance: 0,
      };
    }

    const weights = distances.map(d => (totalDistance - d) / (totalDistance * (neighbors.length - 1)));
    let value = 0;
    for (let i = 0; i < neighbors.length; i++) {
      value += weights[i] * values[i];
    }

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length);

    return {
      value,
      variance,
      neighborsUsed: neighbors.length,
      meanDistance: totalDistance / neighbors.length,
    };
  }
}

module.exports = {
  IDWInterpolator,
  NearestNeighborInterpolator,
  LinearInterpolator,
};
