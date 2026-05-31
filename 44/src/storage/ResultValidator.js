const logger = require('../common/logger');

class ResultValidator {
  constructor(options = {}) {
    this.thresholds = {
      maxOutlierRatio: options.maxOutlierRatio || 0.05,
      maxVarianceRatio: options.maxVarianceRatio || 0.5,
      spatialConsistencyThreshold: options.spatialConsistencyThreshold || 0.7,
      minValueRange: options.minValueRange || 0.001,
      maxStdDevMultiplier: options.maxStdDevMultiplier || 3,
      moranIThreshold: options.moranIThreshold || 0.3,
    };
  }

  validate(result, inputData = null) {
    const issues = [];
    const warnings = [];
    const { data, metadata } = result;

    if (!data || !data.values || !data.stats) {
      return {
        valid: false,
        issues: [{ type: 'INVALID_DATA', severity: 'critical', message: 'Missing result data or stats' }],
        warnings: [],
        score: 0,
        recommendations: ['Regenerate the computation result'],
      };
    }

    const { values, variance, stats } = data;

    this._checkStatistics(stats, issues, warnings);
    this._checkValueDistribution(values, stats, issues, warnings);
    this._checkVarianceQuality(variance, stats, issues, warnings);
    this._checkSpatialConsistency(values, metadata, stats, issues, warnings);

    if (inputData && inputData.points) {
      this._checkAgainstInputPoints(values, inputData.points, metadata, stats, issues, warnings);
    }

    if (stats.crossValidation) {
      this._checkCrossValidation(stats.crossValidation, issues, warnings);
    }

    const score = this._calculateOverallScore(issues, warnings, stats);

    const recommendations = this._generateRecommendations(issues, warnings);

    return {
      valid: issues.filter(i => i.severity === 'critical').length === 0,
      issues,
      warnings,
      score,
      recommendations,
      summary: {
        totalIssues: issues.length,
        criticalIssues: issues.filter(i => i.severity === 'critical').length,
        totalWarnings: warnings.length,
        qualityGrade: this._getQualityGrade(score),
      },
    };
  }

  _checkStatistics(stats, issues, warnings) {
    if (stats.failedInterpolations > 0) {
      const failRatio = stats.failedInterpolations / stats.totalCells;
      if (failRatio > 0.1) {
        issues.push({
          type: 'HIGH_FAILURE_RATE',
          severity: 'critical',
          message: `Failure rate ${(failRatio * 100).toFixed(1)}% exceeds 10% threshold`,
          details: { failedCells: stats.failedInterpolations, totalCells: stats.totalCells, failRatio },
        });
      } else if (failRatio > 0.05) {
        warnings.push({
          type: 'ELEVATED_FAILURE_RATE',
          message: `Failure rate ${(failRatio * 100).toFixed(1)}% is elevated`,
          details: { failedCells: stats.failedInterpolations, totalCells: stats.totalCells },
        });
      }
    }

    if (stats.outlierCount > 0) {
      const outlierRatio = stats.outlierCount / stats.totalCells;
      if (outlierRatio > this.thresholds.maxOutlierRatio) {
        issues.push({
          type: 'EXCESSIVE_OUTLIERS',
          severity: 'major',
          message: `Outlier ratio ${(outlierRatio * 100).toFixed(1)}% exceeds ${(this.thresholds.maxOutlierRatio * 100).toFixed(1)}% threshold`,
          details: { outlierCount: stats.outlierCount, totalCells: stats.totalCells },
        });
      }
    }

    if (stats.qualityScore < 0.95) {
      warnings.push({
        type: 'LOW_QUALITY_SCORE',
        message: `Quality score ${(stats.qualityScore * 100).toFixed(1)}% is below 95%`,
        details: { qualityScore: stats.qualityScore },
      });
    }

    if (stats.highVarianceCount > 0) {
      const hvRatio = stats.highVarianceCount / stats.totalCells;
      if (hvRatio > this.thresholds.maxVarianceRatio) {
        warnings.push({
          type: 'HIGH_VARIANCE_CELLS',
          message: `${(hvRatio * 100).toFixed(1)}% of cells have high variance`,
          details: { highVarianceCount: stats.highVarianceCount, totalCells: stats.totalCells },
        });
      }
    }
  }

  _checkValueDistribution(values, stats, issues, warnings) {
    if (!values || values.length === 0) return;

    const validValues = values.filter(v => !isNaN(v) && isFinite(v));
    if (validValues.length === 0) {
      issues.push({
        type: 'ALL_INVALID_VALUES',
        severity: 'critical',
        message: 'All interpolated values are NaN or infinite',
      });
      return;
    }

    const mean = validValues.reduce((a, b) => a + b, 0) / validValues.length;
    const stdDev = Math.sqrt(validValues.reduce((s, v) => s + (v - mean) ** 2, 0) / validValues.length);

    if (stdDev < this.thresholds.minValueRange && Math.abs(mean) > 0.01) {
      warnings.push({
        type: 'LOW_VARIABILITY',
        message: `Value standard deviation (${stdDev.toFixed(6)}) is suspiciously low`,
        details: { mean, stdDev },
      });
    }

    const outlierThreshold = mean + this.thresholds.maxStdDevMultiplier * stdDev;
    const lowerOutlierThreshold = mean - this.thresholds.maxStdDevMultiplier * stdDev;
    const statisticalOutliers = validValues.filter(v => v > outlierThreshold || v < lowerOutlierThreshold);
    const outlierRatio = statisticalOutliers.length / validValues.length;

    if (outlierRatio > 0.01) {
      warnings.push({
        type: 'STATISTICAL_OUTLIERS',
        message: `${(outlierRatio * 100).toFixed(2)}% of values are statistical outliers (>${this.thresholds.maxStdDevMultiplier}σ)`,
        details: { outlierCount: statisticalOutliers.length, outlierThreshold, lowerOutlierThreshold, mean, stdDev },
      });
    }
  }

  _checkVarianceQuality(variance, stats, issues, warnings) {
    if (!variance || variance.length === 0) return;

    const validVariance = variance.filter(v => v >= 0);
    const negativeVarianceCount = variance.filter(v => v < 0).length;

    if (negativeVarianceCount > 0) {
      const ratio = negativeVarianceCount / variance.length;
      if (ratio > 0.1) {
        issues.push({
          type: 'NEGATIVE_VARIANCE',
          severity: 'major',
          message: `${(ratio * 100).toFixed(1)}% of cells have negative variance (interpolation failed)`,
          details: { negativeVarianceCount, totalCells: variance.length },
        });
      } else {
        warnings.push({
          type: 'NEGATIVE_VARIANCE',
          message: `${negativeVarianceCount} cells have negative variance`,
        });
      }
    }

    if (validVariance.length > 0) {
      const avgVariance = validVariance.reduce((a, b) => a + b, 0) / validVariance.length;
      if (stats.algorithm === 'kriging' && avgVariance > 0) {
        const meanValue = stats.meanValue || 1;
        const cv = Math.sqrt(avgVariance) / Math.abs(meanValue);
        if (cv > 1.0) {
          warnings.push({
            type: 'HIGH_COEFFICIENT_OF_VARIATION',
            message: `Coefficient of variation (${cv.toFixed(3)}) is high, indicating low precision`,
            details: { cv, avgVariance, meanValue },
          });
        }
      }
    }
  }

  _checkSpatialConsistency(values, metadata, stats, issues, warnings) {
    if (!values || !metadata || !metadata.grid) return;

    const { grid } = metadata;
    const sizeX = grid.size?.x || 1;
    const sizeY = grid.size?.y || 1;
    const totalCells = sizeX * sizeY;

    if (values.length < 4 || totalCells < 4) return;

    let largeJumpCount = 0;
    let totalNeighbors = 0;

    for (let y = 0; y < sizeY; y++) {
      for (let x = 0; x < sizeX; x++) {
        const idx = x + y * sizeX;
        if (idx >= values.length || isNaN(values[idx])) continue;

        const current = values[idx];
        const neighbors = [];

        if (x + 1 < sizeX && idx + 1 < values.length && !isNaN(values[idx + 1])) {
          neighbors.push(values[idx + 1]);
        }
        if (y + 1 < sizeY && idx + sizeX < values.length && !isNaN(values[idx + sizeX])) {
          neighbors.push(values[idx + sizeX]);
        }

        for (const neighbor of neighbors) {
          totalNeighbors++;
          const jump = Math.abs(current - neighbor);
          const meanAbs = (Math.abs(current) + Math.abs(neighbor)) / 2;
          if (meanAbs > 0.001 && jump / meanAbs > 0.5) {
            largeJumpCount++;
          }
        }
      }
    }

    if (totalNeighbors > 0) {
      const jumpRatio = largeJumpCount / totalNeighbors;
      if (jumpRatio > 1 - this.thresholds.spatialConsistencyThreshold) {
        issues.push({
          type: 'SPATIAL_INCONSISTENCY',
          severity: 'major',
          message: `Spatial consistency ratio ${(1 - jumpRatio).toFixed(3)} is below threshold ${this.thresholds.spatialConsistencyThreshold}`,
          details: { largeJumpCount, totalNeighbors, jumpRatio },
        });
      }
    }
  }

  _checkAgainstInputPoints(values, inputPoints, metadata, stats, issues, warnings) {
    if (!metadata || !metadata.grid || !inputPoints || inputPoints.length === 0) return;

    const { grid } = metadata;
    const sizeX = grid.size?.x || 1;
    let closeMatches = 0;
    let totalChecked = 0;

    for (const point of inputPoints) {
      const gridX = Math.round((point.x - (grid.origin?.x || 0)) / (grid.spacing?.x || 1));
      const gridY = Math.round((point.y - (grid.origin?.y || 0)) / (grid.spacing?.y || 1));

      if (gridX >= 0 && gridX < sizeX && gridY >= 0 && gridY < (grid.size?.y || 1)) {
        const idx = gridX + gridY * sizeX;
        if (idx < values.length && !isNaN(values[idx])) {
          totalChecked++;
          const diff = Math.abs(values[idx] - point.value);
          const relDiff = Math.abs(point.value) > 0.001 ? diff / Math.abs(point.value) : diff;
          if (relDiff < 0.1) {
            closeMatches++;
          }
        }
      }
    }

    if (totalChecked > 0) {
      const matchRate = closeMatches / totalChecked;
      if (matchRate < 0.5 && totalChecked >= 3) {
        warnings.push({
          type: 'POOR_INPUT_POINT_MATCH',
          message: `Only ${(matchRate * 100).toFixed(1)}% of input points closely match interpolated values at corresponding positions`,
          details: { closeMatches, totalChecked, matchRate },
        });
      }
    }
  }

  _checkCrossValidation(cvResult, issues, warnings) {
    if (!cvResult || cvResult.sampleCount === 0) return;

    if (cvResult.r2 < 0) {
      issues.push({
        type: 'NEGATIVE_R2',
        severity: 'major',
        message: `Cross-validation R² (${cvResult.r2.toFixed(4)}) is negative, model may be invalid`,
        details: cvResult,
      });
    } else if (cvResult.r2 < 0.3) {
      warnings.push({
        type: 'LOW_R2',
        message: `Cross-validation R² (${cvResult.r2.toFixed(4)}) indicates poor model fit`,
        details: cvResult,
      });
    }

    if (cvResult.rmse === Infinity) {
      issues.push({
        type: 'CROSS_VALIDATION_FAILED',
        severity: 'major',
        message: 'Cross-validation produced infinite RMSE',
        details: cvResult,
      });
    }
  }

  markAnomalies(result) {
    const { data, metadata } = result;
    if (!data || !data.values) return result;

    const values = data.values;
    const variance = data.variance || [];
    const stats = data.stats || {};
    const grid = metadata?.grid;

    const anomalies = [];
    const sizeX = grid?.size?.x || 1;
    const sizeY = grid?.size?.y || 1;

    const validValues = values.filter(v => !isNaN(v) && isFinite(v));
    if (validValues.length === 0) return result;

    const mean = validValues.reduce((a, b) => a + b, 0) / validValues.length;
    const stdDev = Math.sqrt(validValues.reduce((s, v) => s + (v - mean) ** 2, 0) / validValues.length);

    for (let i = 0; i < values.length; i++) {
      if (isNaN(values[i])) {
        anomalies.push({
          index: i,
          x: i % sizeX,
          y: Math.floor(i / sizeX) % sizeY,
          type: 'invalid_value',
          value: values[i],
          severity: 'critical',
          suggestion: 'Recalculate this cell',
        });
        continue;
      }

      if (variance[i] < 0) {
        anomalies.push({
          index: i,
          x: i % sizeX,
          y: Math.floor(i / sizeX) % sizeY,
          type: 'failed_interpolation',
          value: values[i],
          variance: variance[i],
          severity: 'major',
          suggestion: 'Interpolation failed, value is neighbor-estimated',
        });
        continue;
      }

      const zScore = stdDev > 0 ? Math.abs(values[i] - mean) / stdDev : 0;
      if (zScore > this.thresholds.maxStdDevMultiplier) {
        const x = i % sizeX;
        const y = Math.floor(i / sizeX) % sizeY;

        const neighborValues = this._getNeighborValues(values, i, sizeX, values.length);
        const neighborMean = neighborValues.length > 0
          ? neighborValues.reduce((a, b) => a + b, 0) / neighborValues.length
          : mean;

        anomalies.push({
          index: i,
          x,
          y,
          type: 'statistical_outlier',
          value: values[i],
          zScore: zScore.toFixed(2),
          severity: zScore > 4 ? 'major' : 'minor',
          suggestion: neighborValues.length > 0
            ? `Consider replacing with neighbor mean: ${neighborMean.toFixed(4)}`
            : 'Review this value manually',
        });
      }

      if (variance[i] > 0 && stats.meanValue) {
        const cv = Math.sqrt(variance[i]) / Math.abs(stats.meanValue);
        if (cv > 1.0) {
          anomalies.push({
            index: i,
            x: i % sizeX,
            y: Math.floor(i / sizeX) % sizeY,
            type: 'high_uncertainty',
            value: values[i],
            variance: variance[i],
            coefficientOfVariation: cv.toFixed(3),
            severity: 'minor',
            suggestion: 'High interpolation uncertainty, consider adding more sample points nearby',
          });
        }
      }
    }

    const anomalyMap = new Float32Array(values.length).fill(0);
    for (const anomaly of anomalies) {
      anomalyMap[anomaly.index] = anomaly.severity === 'critical' ? 3 :
                                    anomaly.severity === 'major' ? 2 : 1;
    }

    return {
      ...result,
      data: {
        ...data,
        anomalyMap: Array.from(anomalyMap),
        anomalies,
        anomalyStats: {
          totalAnomalies: anomalies.length,
          critical: anomalies.filter(a => a.severity === 'critical').length,
          major: anomalies.filter(a => a.severity === 'major').length,
          minor: anomalies.filter(a => a.severity === 'minor').length,
          anomalyRatio: anomalies.length / values.length,
        },
      },
    };
  }

  _getNeighborValues(values, idx, gridWidth, totalCells) {
    const neighbors = [];
    const offsets = [1, -1, gridWidth, -gridWidth, gridWidth + 1, gridWidth - 1, -gridWidth + 1, -gridWidth - 1];

    for (const offset of offsets) {
      const nIdx = idx + offset;
      if (nIdx >= 0 && nIdx < totalCells && !isNaN(values[nIdx]) && isFinite(values[nIdx])) {
        neighbors.push(values[nIdx]);
      }
    }

    return neighbors;
  }

  _calculateOverallScore(issues, warnings, stats) {
    let score = 100;

    for (const issue of issues) {
      switch (issue.severity) {
        case 'critical': score -= 30; break;
        case 'major': score -= 15; break;
        case 'minor': score -= 5; break;
      }
    }

    for (const warning of warnings) {
      score -= 3;
    }

    if (stats.qualityScore) {
      score = score * (0.7 + 0.3 * stats.qualityScore);
    }

    return Math.max(0, Math.min(100, score));
  }

  _getQualityGrade(score) {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  _generateRecommendations(issues, warnings) {
    const recommendations = new Set();

    for (const issue of issues) {
      switch (issue.type) {
        case 'HIGH_FAILURE_RATE':
          recommendations.add('Increase search radius or max neighbors for interpolation');
          recommendations.add('Check for data quality issues in input points');
          break;
        case 'EXCESSIVE_OUTLIERS':
          recommendations.add('Review variogram model parameters');
          recommendations.add('Consider using a different interpolation algorithm');
          break;
        case 'ALL_INVALID_VALUES':
          recommendations.add('Verify input data format and coordinate system');
          recommendations.add('Check if grid parameters are compatible with sample points');
          break;
        case 'NEGATIVE_VARIANCE':
          recommendations.add('Check numerical stability of the Kriging system');
          break;
        case 'SPATIAL_INCONSISTENCY':
          recommendations.add('Reduce grid spacing for smoother interpolation');
          recommendations.add('Increase the number of sample points in inconsistent areas');
          break;
        case 'NEGATIVE_R2':
          recommendations.add('The variogram model is unsuitable, try a different model type');
          recommendations.add('Check for spatial trends and consider universal Kriging');
          break;
      }
    }

    for (const warning of warnings) {
      switch (warning.type) {
        case 'LOW_QUALITY_SCORE':
          recommendations.add('Consider adding more sample points to improve interpolation quality');
          break;
        case 'STATISTICAL_OUTLIERS':
          recommendations.add('Review outlier values and consider data cleaning before interpolation');
          break;
        case 'POOR_INPUT_POINT_MATCH':
          recommendations.add('Verify that the variogram model is appropriate for the data');
          break;
        case 'LOW_R2':
          recommendations.add('Try different variogram models (spherical, exponential, gaussian)');
          break;
        case 'HIGH_COEFFICIENT_OF_VARIATION':
          recommendations.add('Consider adding more sample points to reduce uncertainty');
          break;
      }
    }

    return Array.from(recommendations);
  }
}

const resultValidator = new ResultValidator();

module.exports = {
  ResultValidator,
  resultValidator,
};
