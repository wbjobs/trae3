const KrigingInterpolator = require('./KrigingInterpolator');
const { IDWInterpolator, NearestNeighborInterpolator, LinearInterpolator } = require('./IDWInterpolator');
const { InterpolationError } = require('../common/errors');
const { crossValidate, estimateOptimalGrid, calculateEmpiricalVariogram, fitVariogramModel } = require('./variogram');
const logger = require('../common/logger');

class ComputeKernel {
  constructor(options = {}) {
    this.options = options;
    this.interpolators = new Map();
    this.checkpointInterval = options.checkpointInterval || 5000;
    this.qualityThresholds = {
      minSuccessRate: 0.95,
      maxVariance: 1000,
      valueRangeCheck: true,
      outlierMultiplier: 3,
      maxCrossValidationRMSE: null,
    };
    this.precisionConfig = {
      crossValidation: options.crossValidation !== false,
      crossValidationFolds: options.crossValidationFolds || 5,
      autoRefineGrid: options.autoRefineGrid || false,
      precisionTarget: options.precisionTarget || 'standard',
    };
    this._checkpoints = new Map();
  }

  _getInterpolator(params) {
    const { algorithm } = params;
    const cacheKey = this._getCacheKey(params);

    if (this.interpolators.has(cacheKey)) {
      return this.interpolators.get(cacheKey);
    }

    let interpolator;
    switch (algorithm) {
      case 'kriging':
        interpolator = new KrigingInterpolator(params);
        break;
      case 'idw':
        interpolator = new IDWInterpolator(params);
        break;
      case 'nearest':
        interpolator = new NearestNeighborInterpolator(params);
        break;
      case 'linear':
        interpolator = new LinearInterpolator(params);
        break;
      default:
        throw new InterpolationError(
          `Unknown interpolation algorithm: ${algorithm}`,
          algorithm,
          { availableAlgorithms: ['kriging', 'idw', 'nearest', 'linear'] }
        );
    }

    this.interpolators.set(cacheKey, interpolator);
    return interpolator;
  }

  _getCacheKey(params) {
    const { algorithm, power, variogram, searchRadius, maxNeighbors } = params;
    return JSON.stringify({
      algorithm,
      power,
      variogram,
      searchRadius,
      maxNeighbors,
    });
  }

  async interpolate(inputData, progressCallback, checkpoint = null) {
    const startTime = Date.now();
    let { points, grid, params } = inputData;
    const taskId = inputData.taskId || 'default';

    if (this.precisionConfig.autoRefineGrid && params.algorithm === 'kriging') {
      const refinedGrid = estimateOptimalGrid(points, grid, this.precisionConfig.precisionTarget);
      if (refinedGrid.refinementFactor > 1) {
        logger.info(`Auto-refining grid by factor ${refinedGrid.refinementFactor} for ${this.precisionConfig.precisionTarget} precision`);
        grid = refinedGrid;
      }
    }

    logger.info(`Starting interpolation: ${params.algorithm}, grid size: ${grid.size.x}x${grid.size.y}x${grid.size.z}`);

    if (points.length < 3) {
      throw new InterpolationError(
        'At least 3 sample points are required for interpolation',
        params.algorithm,
        { pointsCount: points.length }
      );
    }

    const interpolator = this._getInterpolator(params);
    const totalCells = grid.size.x * grid.size.y * grid.size.z;

    let values, variance, startIdx, processedCells, lastProgress;
    let minValue = Infinity;
    let maxValue = -Infinity;
    let totalNeighborsUsed = 0;
    let successfulInterpolations = 0;
    let failedInterpolations = 0;
    let lastCheckpointTime = Date.now();
    let outlierCount = 0;
    let repairedCount = 0;
    let highVarianceCount = 0;

    if (checkpoint && checkpoint.values && checkpoint.variance) {
      logger.info(`Resuming from checkpoint at cell ${checkpoint.processedCells}/${totalCells}`);
      values = new Float64Array(checkpoint.values);
      variance = new Float64Array(checkpoint.variance);
      startIdx = checkpoint.processedCells || 0;
      processedCells = startIdx;
      lastProgress = checkpoint.progress || 0;
      minValue = checkpoint.minValue ?? Infinity;
      maxValue = checkpoint.maxValue ?? -Infinity;
      totalNeighborsUsed = checkpoint.totalNeighborsUsed || 0;
      successfulInterpolations = checkpoint.successfulInterpolations || 0;
      failedInterpolations = checkpoint.failedInterpolations || 0;
      outlierCount = checkpoint.outlierCount || 0;
      repairedCount = checkpoint.repairedCount || 0;
    } else {
      values = new Float64Array(totalCells);
      variance = new Float64Array(totalCells);
      startIdx = 0;
      processedCells = 0;
      lastProgress = 0;
    }

    const pointsValues = points.map(p => p.value);
    const pointsMin = Math.min(...pointsValues);
    const pointsMax = Math.max(...pointsValues);
    const valueRange = pointsMax - pointsMin;
    const outlierThreshold = valueRange * (this.qualityThresholds.outlierMultiplier || 3);

    const progressUpdateInterval = Math.max(1, Math.floor(totalCells / 100));

    const saveCheckpoint = () => {
      const cp = {
        taskId,
        processedCells,
        progress: lastProgress,
        values: Array.from(values),
        variance: Array.from(variance),
        minValue,
        maxValue,
        totalNeighborsUsed,
        successfulInterpolations,
        failedInterpolations,
        outlierCount,
        repairedCount,
        timestamp: Date.now(),
      };
      this._checkpoints.set(taskId, cp);
      return cp;
    };

    for (let z = 0; z < grid.size.z; z++) {
      for (let y = 0; y < grid.size.y; y++) {
        for (let x = 0; x < grid.size.x; x++) {
          const idx = x + y * grid.size.x + z * grid.size.x * grid.size.y;

          if (idx < startIdx) continue;

          const target = {
            x: grid.origin.x + x * grid.spacing.x,
            y: grid.origin.y + y * grid.spacing.y,
            z: grid.origin.z !== undefined ? grid.origin.z + z * grid.spacing.z : undefined,
          };

          try {
            const result = interpolator.interpolate(target, points);
            let interpolatedValue = result.value;

            if (this.qualityThresholds.valueRangeCheck && !isNaN(interpolatedValue)) {
              if (interpolatedValue < pointsMin - outlierThreshold ||
                  interpolatedValue > pointsMax + outlierThreshold) {
                logger.warn(`Value outlier detected at (${x},${y},${z}): ${interpolatedValue}, range: [${pointsMin}, ${pointsMax}]`);
                interpolatedValue = this._repairOutlier(interpolatedValue, pointsMin, pointsMax, values, idx, grid.size.x);
                outlierCount++;
                repairedCount++;
              }
            }

            if (result.variance && result.variance > this.qualityThresholds.maxVariance) {
              logger.warn(`High variance at (${x},${y},${z}): ${result.variance}`);
              highVarianceCount++;
            }

            values[idx] = interpolatedValue;
            variance[idx] = result.variance || 0;
            totalNeighborsUsed += result.neighborsUsed || 0;
            successfulInterpolations++;

            if (interpolatedValue < minValue) minValue = interpolatedValue;
            if (interpolatedValue > maxValue) maxValue = interpolatedValue;
          } catch (error) {
            logger.warn(`Interpolation failed at (${x}, ${y}, ${z}):`, error.message);
            values[idx] = this._repairFailedCell(values, idx, grid.size.x, totalCells);
            variance[idx] = -1;
            failedInterpolations++;
          }

          processedCells++;

          if (processedCells % progressUpdateInterval === 0 && progressCallback) {
            const progress = Math.floor((processedCells / totalCells) * 100);
            if (progress > lastProgress) {
              lastProgress = progress;
              progressCallback(progress);
            }
          }

          if (Date.now() - lastCheckpointTime > this.checkpointInterval) {
            saveCheckpoint();
            lastCheckpointTime = Date.now();
          }
        }
      }
    }

    if (progressCallback) {
      progressCallback(100);
    }

    const successRate = successfulInterpolations / totalCells;
    if (successRate < this.qualityThresholds.minSuccessRate) {
      logger.error(`Interpolation success rate too low: ${(successRate * 100).toFixed(2)}%, threshold: ${this.qualityThresholds.minSuccessRate * 100}%`);
      throw new InterpolationError(
        'Interpolation quality check failed: success rate too low',
        params.algorithm,
        { successRate, minSuccessRate: this.qualityThresholds.minSuccessRate }
      );
    }

    const computationTime = Date.now() - startTime;
    const meanValue = successfulInterpolations > 0
      ? values.reduce((sum, v) => (!isNaN(v) ? sum + v : sum), 0) / successfulInterpolations
      : 0;

    let crossValidationResult = null;
    if (this.precisionConfig.crossValidation && params.algorithm === 'kriging') {
      try {
        crossValidationResult = crossValidate(points, {
          model: params.variogram?.model || 'spherical',
          maxNeighbors: params.maxNeighbors || 12,
        }, this.precisionConfig.crossValidationFolds);

        logger.info(`Cross-validation RMSE: ${crossValidationResult.rmse?.toFixed(4)}, R²: ${crossValidationResult.r2?.toFixed(4)}`);

        if (this.qualityThresholds.maxCrossValidationRMSE &&
            crossValidationResult.rmse > this.qualityThresholds.maxCrossValidationRMSE) {
          logger.warn(`Cross-validation RMSE (${crossValidationResult.rmse}) exceeds threshold (${this.qualityThresholds.maxCrossValidationRMSE})`);
        }
      } catch (error) {
        logger.warn('Cross-validation failed:', error.message);
      }
    }

    this._checkpoints.delete(taskId);

    logger.info(`Interpolation completed in ${computationTime}ms: ${successfulInterpolations}/${totalCells} cells successful, quality: ${(successRate * 100).toFixed(2)}%`);

    const stats = {
      minValue,
      maxValue,
      meanValue,
      totalCells,
      successfulInterpolations,
      failedInterpolations,
      pointsUsed: points.length,
      avgNeighborsUsed: successfulInterpolations > 0 ? totalNeighborsUsed / successfulInterpolations : 0,
      computationTime,
      algorithm: params.algorithm,
      qualityScore: successRate,
      outlierCount,
      repairedCount,
      highVarianceCount,
    };

    if (crossValidationResult) {
      stats.crossValidation = crossValidationResult;
    }

    return {
      data: {
        values: Array.from(values),
        variance: Array.from(variance),
        stats,
      },
      metadata: {
        algorithm: params.algorithm,
        params,
        grid,
        pointsCount: points.length,
        precisionLevel: this.precisionConfig.precisionTarget,
      },
    };
  }

  async validateVariogramFit(points, params) {
    const { model = 'spherical' } = params;
    const maxDist = points.reduce((max, p, i) => {
      for (let j = i + 1; j < points.length; j++) {
        const dx = points[j].x - p.x;
        const dy = points[j].y - p.y;
        const dz = (points[j].z || 0) - (p.z || 0);
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > max) return dist;
      }
      return max;
    }, 0);

    const lagSize = maxDist / 15;
    const empirical = calculateEmpiricalVariogram(points, lagSize, maxDist);

    if (empirical.lags.length < 3) {
      return {
        fitted: false,
        reason: 'Insufficient empirical variogram points',
        empirical,
      };
    }

    const fitted = fitVariogramModel(empirical, model);

    return {
      fitted: true,
      model: fitted.model,
      range: fitted.range,
      sill: fitted.sill,
      nugget: fitted.nugget,
      rmse: fitted.rmse,
      r2: fitted.r2,
      empirical,
      quality: fitted.r2 > 0.9 ? 'excellent' : fitted.r2 > 0.7 ? 'good' : fitted.r2 > 0.5 ? 'acceptable' : 'poor',
    };
  }

  _repairOutlier(value, pointsMin, pointsMax, values, idx, gridWidth) {
    const neighbors = [];
    if (idx > 0) neighbors.push(values[idx - 1]);
    if (idx < values.length - 1) neighbors.push(values[idx + 1]);
    if (idx >= gridWidth) neighbors.push(values[idx - gridWidth]);
    if (idx < values.length - gridWidth) neighbors.push(values[idx + gridWidth]);

    const validNeighbors = neighbors.filter(v => !isNaN(v) && v >= pointsMin && v <= pointsMax);
    if (validNeighbors.length > 0) {
      return validNeighbors.reduce((a, b) => a + b, 0) / validNeighbors.length;
    }
    return Math.max(pointsMin, Math.min(pointsMax, value));
  }

  _repairFailedCell(values, idx, gridWidth, totalCells) {
    const neighbors = [];
    const offsets = [1, -1, gridWidth, -gridWidth, gridWidth + 1, gridWidth - 1, -gridWidth + 1, -gridWidth - 1];

    for (const offset of offsets) {
      const nIdx = idx + offset;
      if (nIdx >= 0 && nIdx < totalCells && !isNaN(values[nIdx]) && values[nIdx] !== undefined) {
        neighbors.push(values[nIdx]);
      }
    }

    if (neighbors.length > 0) {
      return neighbors.reduce((a, b) => a + b, 0) / neighbors.length;
    }

    const validValues = Array.from(values).filter(v => !isNaN(v));
    if (validValues.length > 0) {
      return validValues.reduce((a, b) => a + b, 0) / validValues.length;
    }

    return 0;
  }

  getCheckpoint(taskId) {
    return this._checkpoints.get(taskId) || null;
  }

  clearCheckpoint(taskId) {
    this._checkpoints.delete(taskId);
  }

  async interpolateBatch(inputDataList, progressCallback) {
    const results = [];
    const total = inputDataList.length;

    for (let i = 0; i < total; i++) {
      const result = await this.interpolate(inputDataList[i], (progress) => {
        if (progressCallback) {
          const overallProgress = Math.floor(((i + progress / 100) / total) * 100);
          progressCallback(overallProgress);
        }
      });
      results.push(result);
    }

    return results;
  }

  validateInput(inputData) {
    const { points, grid, params } = inputData;

    if (!points || !Array.isArray(points) || points.length < 3) {
      throw new InterpolationError(
        'At least 3 sample points are required',
        params?.algorithm || 'unknown',
        { pointsCount: points?.length || 0 }
      );
    }

    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      if (typeof point.x !== 'number' || typeof point.y !== 'number') {
        throw new InterpolationError(
          `Point ${i} is missing x or y coordinate`,
          params?.algorithm || 'unknown',
          { pointIndex: i, point }
        );
      }
      if (typeof point.value !== 'number') {
        throw new InterpolationError(
          `Point ${i} is missing value`,
          params?.algorithm || 'unknown',
          { pointIndex: i, point }
        );
      }
    }

    if (!grid || !grid.origin || !grid.size || !grid.spacing) {
      throw new InterpolationError(
        'Grid configuration is incomplete',
        params?.algorithm || 'unknown',
        { grid }
      );
    }

    if (!params || !params.algorithm) {
      throw new InterpolationError(
        'Interpolation algorithm must be specified',
        'unknown',
        { params }
      );
    }

    return true;
  }

  clearCache() {
    this.interpolators.clear();
    logger.info('Interpolator cache cleared');
  }

  getSupportedAlgorithms() {
    return ['kriging', 'idw', 'nearest', 'linear'];
  }
}

const computeKernel = new ComputeKernel();

module.exports = {
  ComputeKernel,
  computeKernel,
};
