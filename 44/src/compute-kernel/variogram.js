const { InterpolationError } = require('../common/errors');

function sphericalVariogram(h, range, sill, nugget = 0) {
  if (h === 0) return nugget;
  if (h >= range) return sill + nugget;
  const ratio = h / range;
  return nugget + (sill - nugget) * (1.5 * ratio - 0.5 * ratio * ratio * ratio);
}

function exponentialVariogram(h, range, sill, nugget = 0) {
  if (h === 0) return nugget;
  return nugget + (sill - nugget) * (1 - Math.exp(-3 * h / range));
}

function gaussianVariogram(h, range, sill, nugget = 0) {
  if (h === 0) return nugget;
  const ratio = h / range;
  return nugget + (sill - nugget) * (1 - Math.exp(-3 * ratio * ratio));
}

function linearVariogram(h, range, sill, nugget = 0) {
  if (h === 0) return nugget;
  if (h >= range) return sill + nugget;
  return nugget + (sill - nugget) * (h / range);
}

const variogramModels = {
  spherical: sphericalVariogram,
  exponential: exponentialVariogram,
  gaussian: gaussianVariogram,
  linear: linearVariogram,
};

function createVariogram(params) {
  const { model = 'spherical', range, sill, nugget = 0 } = params;
  const variogramFn = variogramModels[model];
  if (!variogramFn) {
    throw new InterpolationError(
      `Unknown variogram model: ${model}`,
      'kriging',
      { availableModels: Object.keys(variogramModels) }
    );
  }
  return (h) => variogramFn(h, range, sill, nugget);
}

function calculateDistance(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dz = (p2.z || 0) - (p1.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function calculateEmpiricalVariogram(points, lagSize, maxLag) {
  const distances = [];
  const squaredDifferences = [];

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dist = calculateDistance(points[i], points[j]);
      if (dist <= maxLag) {
        distances.push(dist);
        const diff = points[i].value - points[j].value;
        squaredDifferences.push(diff * diff);
      }
    }
  }

  const lags = [];
  const variogramValues = [];
  const counts = [];
  const numLags = Math.ceil(maxLag / lagSize);

  for (let lag = 0; lag < numLags; lag++) {
    const lagStart = lag * lagSize;
    const lagEnd = lagStart + lagSize;
    const lagMid = lagStart + lagSize / 2;

    const lagIndices = distances.reduce((acc, d, idx) => {
      if (d >= lagStart && d < lagEnd) acc.push(idx);
      return acc;
    }, []);

    if (lagIndices.length > 0) {
      const avgSqDiff = lagIndices.reduce((sum, idx) => sum + squaredDifferences[idx], 0) / lagIndices.length;
      lags.push(lagMid);
      variogramValues.push(0.5 * avgSqDiff);
      counts.push(lagIndices.length);
    }
  }

  return { lags, variogramValues, counts };
}

function fitVariogramModel(empiricalData, modelType) {
  const { lags, variogramValues, counts } = empiricalData;
  if (lags.length < 3) {
    throw new InterpolationError(
      'Insufficient data for variogram fitting',
      'kriging',
      { lagsCount: lags.length }
    );
  }

  const maxLag = lags[lags.length - 1];
  const weightedSill = _calculateWeightedSill(lags, variogramValues, counts);
  const sill = weightedSill;
  const nugget = _estimateNugget(lags, variogramValues);

  const bestFit = _gridSearchWithRefinement(modelType, lags, variogramValues, counts, maxLag, sill, nugget);

  return bestFit;
}

function _calculateWeightedSill(lags, variogramValues, counts) {
  const tailLagCount = Math.max(1, Math.floor(lags.length * 0.3));
  let weightedSum = 0;
  let totalWeight = 0;

  for (let i = lags.length - tailLagCount; i < lags.length; i++) {
    const weight = counts ? (counts[i] || 1) : 1;
    weightedSum += variogramValues[i] * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : variogramValues[variogramValues.length - 1];
}

function _estimateNugget(lags, variogramValues) {
  if (lags.length < 2) return variogramValues[0] || 0;

  const n = Math.min(3, lags.length);
  const ratios = [];
  for (let i = 0; i < n - 1; i++) {
    const slope = (variogramValues[i + 1] - variogramValues[i]) / (lags[i + 1] - lags[i]);
    ratios.push(slope);
  }

  const avgSlope = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  const extrapolated = variogramValues[0] - avgSlope * lags[0];

  return Math.max(0, extrapolated);
}

function _gridSearchWithRefinement(modelType, lags, variogramValues, counts, maxLag, sill, nugget) {
  const variogramFn = variogramModels[modelType] || sphericalVariogram;

  let bestRange = maxLag * 0.6;
  let bestNugget = nugget;
  let bestSill = sill;
  let minError = Infinity;

  const coarseStep = maxLag * 0.05;
  for (let r = maxLag * 0.1; r <= maxLag; r += coarseStep) {
    const error = _calculateWeightedSSE(variogramFn, lags, variogramValues, counts, r, sill, nugget);
    if (error < minError) {
      minError = error;
      bestRange = r;
    }
  }

  const fineStep = maxLag * 0.005;
  const fineStart = Math.max(maxLag * 0.05, bestRange - coarseStep * 2);
  const fineEnd = Math.min(maxLag, bestRange + coarseStep * 2);
  for (let r = fineStart; r <= fineEnd; r += fineStep) {
    const error = _calculateWeightedSSE(variogramFn, lags, variogramValues, counts, r, sill, nugget);
    if (error < minError) {
      minError = error;
      bestRange = r;
    }
  }

  for (let s = sill * 0.7; s <= sill * 1.3; s += sill * 0.05) {
    for (let n = Math.max(0, nugget * 0.5); n <= nugget * 1.5 + 0.01; n += Math.max(0.001, nugget * 0.1)) {
      const error = _calculateWeightedSSE(variogramFn, lags, variogramValues, counts, bestRange, s, n);
      if (error < minError) {
        minError = error;
        bestSill = s;
        bestNugget = n;
      }
    }
  }

  const rmse = Math.sqrt(minError / lags.length);
  const r2 = _calculateR2(variogramFn, lags, variogramValues, bestRange, bestSill, bestNugget);

  return {
    model: modelType,
    range: bestRange,
    sill: bestSill,
    nugget: bestNugget,
    rmse,
    r2,
  };
}

function _calculateWeightedSSE(variogramFn, lags, variogramValues, counts, range, sill, nugget) {
  let sse = 0;
  for (let i = 0; i < lags.length; i++) {
    const predicted = variogramFn(lags[i], range, sill, nugget);
    const weight = counts ? (counts[i] || 1) : 1;
    const residual = predicted - variogramValues[i];
    sse += weight * residual * residual;
  }
  return sse;
}

function _calculateR2(variogramFn, lags, variogramValues, range, sill, nugget) {
  const mean = variogramValues.reduce((a, b) => a + b, 0) / variogramValues.length;
  let totalSS = 0;
  let residualSS = 0;

  for (let i = 0; i < lags.length; i++) {
    const predicted = variogramFn(lags[i], range, sill, nugget);
    totalSS += (variogramValues[i] - mean) ** 2;
    residualSS += (variogramValues[i] - predicted) ** 2;
  }

  return totalSS > 0 ? 1 - residualSS / totalSS : 0;
}

function crossValidate(points, params, folds = 5) {
  const { model = 'spherical', maxNeighbors = 12 } = params;
  const shuffled = [...points].sort(() => Math.random() - 0.5);
  const foldSize = Math.floor(shuffled.length / folds);
  const results = [];

  for (let fold = 0; fold < folds; fold++) {
    const testStart = fold * foldSize;
    const testEnd = fold === folds - 1 ? shuffled.length : testStart + foldSize;

    const testSet = shuffled.slice(testStart, testEnd);
    const trainSet = [...shuffled.slice(0, testStart), ...shuffled.slice(testEnd)];

    if (trainSet.length < 3 || testSet.length === 0) continue;

    const maxDist = _calculateMaxDistance(trainSet);
    const lagSize = maxDist / 15;

    try {
      const empirical = calculateEmpiricalVariogram(trainSet, lagSize, maxDist);
      if (empirical.lags.length < 3) continue;

      const fitted = fitVariogramModel(empirical, model);
      const variogramFn = createVariogram({
        model: fitted.model,
        range: fitted.range,
        sill: fitted.sill,
        nugget: fitted.nugget,
      });

      for (const testPoint of testSet) {
        try {
          const neighbors = _findNeighbors(testPoint, trainSet, maxNeighbors);
          const predicted = _krigingPredict(testPoint, neighbors, variogramFn, trainSet);
          results.push({
            actual: testPoint.value,
            predicted,
            error: testPoint.value - predicted,
            squaredError: (testPoint.value - predicted) ** 2,
          });
        } catch {
          continue;
        }
      }
    } catch {
      continue;
    }
  }

  if (results.length === 0) {
    return {
      rmse: Infinity,
      mae: Infinity,
      meanError: 0,
      r2: 0,
      sampleCount: 0,
    };
  }

  const meanActual = results.reduce((s, r) => s + r.actual, 0) / results.length;
  const rmse = Math.sqrt(results.reduce((s, r) => s + r.squaredError, 0) / results.length);
  const mae = results.reduce((s, r) => s + Math.abs(r.error), 0) / results.length;
  const meanError = results.reduce((s, r) => s + r.error, 0) / results.length;
  const totalSS = results.reduce((s, r) => s + (r.actual - meanActual) ** 2, 0);
  const residualSS = results.reduce((s, r) => s + r.squaredError, 0);
  const r2 = totalSS > 0 ? 1 - residualSS / totalSS : 0;

  return {
    rmse,
    mae,
    meanError,
    r2,
    sampleCount: results.length,
  };
}

function _calculateMaxDistance(points) {
  let maxDist = 0;
  for (let i = 0; i < Math.min(points.length, 100); i++) {
    for (let j = i + 1; j < Math.min(points.length, 100); j++) {
      const dist = calculateDistance(points[i], points[j]);
      if (dist > maxDist) maxDist = dist;
    }
  }
  return maxDist;
}

function _findNeighbors(target, points, maxNeighbors) {
  return points
    .map(p => ({ point: p, distance: calculateDistance(target, p) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxNeighbors)
    .filter(n => n.distance > 0);
}

function _krigingPredict(target, neighbors, variogramFn, allPoints) {
  const n = neighbors.length;
  const values = neighbors.map(n => n.point.value);
  const distances = neighbors.map(n => n.distance);
  const mean = allPoints.reduce((s, p) => s + p.value, 0) / allPoints.length;

  const A = [];
  const b = [];
  for (let i = 0; i < n; i++) {
    A[i] = [];
    for (let j = 0; j < n; j++) {
      A[i][j] = variogramFn(calculateDistance(neighbors[i].point, neighbors[j].point));
    }
    b[i] = variogramFn(distances[i]);
  }

  try {
    const weights = _solveSystem(A, b);
    let predicted = 0;
    for (let i = 0; i < n; i++) {
      predicted += weights[i] * values[i];
    }
    if (!isFinite(predicted)) return mean;
    return predicted;
  } catch {
    return mean;
  }
}

function _solveSystem(A, b) {
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
      throw new Error('Singular matrix');
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

function estimateOptimalGrid(points, baseGrid, targetPrecision) {
  const { size, spacing, origin } = baseGrid;
  const valueVariance = _calculateVariance(points.map(p => p.value));
  const spatialAutoCorrelation = _estimateSpatialAutocorrelation(points);

  let refinementFactor = 1;
  if (targetPrecision === 'high') {
    refinementFactor = valueVariance > 10 ? 2 : spatialAutoCorrelation < 0.5 ? 2 : 1;
  } else if (targetPrecision === 'ultra') {
    refinementFactor = 3;
  }

  if (refinementFactor > 1) {
    return {
      size: {
        x: size.x * refinementFactor,
        y: size.y * refinementFactor,
        z: size.z,
      },
      spacing: {
        x: spacing.x / refinementFactor,
        y: spacing.y / refinementFactor,
        z: spacing.z,
      },
      origin,
      refinementFactor,
    };
  }

  return { ...baseGrid, refinementFactor: 1 };
}

function _calculateVariance(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
}

function _estimateSpatialAutocorrelation(points) {
  if (points.length < 4) return 1.0;

  const distances = [];
  const valueDifferences = [];
  for (let i = 0; i < Math.min(points.length, 50); i++) {
    for (let j = i + 1; j < Math.min(points.length, 50); j++) {
      distances.push(calculateDistance(points[i], points[j]));
      valueDifferences.push(Math.abs(points[i].value - points[j].value));
    }
  }

  if (distances.length === 0) return 1.0;

  const maxDist = Math.max(...distances);
  if (maxDist === 0) return 1.0;

  const normalizedDist = distances.map(d => d / maxDist);
  const normalizedDiff = valueDifferences.map(d => d / Math.max(...valueDifferences));

  let sumProduct = 0;
  let sumDist = 0;
  let sumDiff = 0;
  for (let i = 0; i < normalizedDist.length; i++) {
    sumProduct += normalizedDist[i] * normalizedDiff[i];
    sumDist += normalizedDist[i];
    sumDiff += normalizedDiff[i];
  }

  const n = normalizedDist.length;
  const correlation = (sumProduct / n - (sumDist / n) * (sumDiff / n)) /
    (Math.sqrt(Math.max(0, sumDist * sumDist / n / n - (sumDist / n) ** 2)) *
     Math.sqrt(Math.max(0, sumDiff * sumDiff / n / n - (sumDiff / n) ** 2)) + 1e-10);

  return Math.max(0, 1 - Math.abs(correlation));
}

module.exports = {
  variogramModels,
  createVariogram,
  calculateDistance,
  calculateEmpiricalVariogram,
  fitVariogramModel,
  crossValidate,
  estimateOptimalGrid,
  sphericalVariogram,
  exponentialVariogram,
  gaussianVariogram,
  linearVariogram,
};
