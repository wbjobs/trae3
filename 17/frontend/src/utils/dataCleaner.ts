import type { TimeSeriesPoint } from '@/types';
import { DATA_CLEANING_CONFIG } from '@/constants';

export interface CleaningResult {
  data: TimeSeriesPoint[];
  removedOutliers: number;
  filledMissing: number;
  totalProcessed: number;
  stats: {
    originalCount: number;
    validCount: number;
    outlierCount: number;
    missingCount: number;
  };
}

export interface CleaningOptions {
  outlierThreshold?: number;
  enableInterpolation?: boolean;
  interpolationMethod?: 'linear' | 'spline' | 'time';
  removeNegative?: boolean;
  maxGapSize?: number;
  validRange?: { min: number; max: number };
}

function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function calculateStd(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1));
}

function linearInterpolation(
  x: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): number {
  if (x0 === x1) return y0;
  return y0 + (y1 - y0) * ((x - x0) / (x1 - x0));
}

export function removeOutliers(
  data: TimeSeriesPoint[],
  threshold: number = DATA_CLEANING_CONFIG.outlierThreshold
): { data: TimeSeriesPoint[]; removed: number } {
  if (!Array.isArray(data) || data.length < 3) {
    return { data: data || [], removed: 0 };
  }

  const values = data
    .filter(p => p && typeof p.value === 'number' && !isNaN(p.value))
    .map(p => p.value);

  if (values.length === 0) {
    return { data: [], removed: 0 };
  }

  const mean = calculateMean(values);
  const std = calculateStd(values, mean);

  if (std === 0) {
    return { data: [...data], removed: 0 };
  }

  const lowerBound = mean - threshold * std;
  const upperBound = mean + threshold * std;

  const filtered = data.filter(p => {
    if (!p || typeof p.value !== 'number' || isNaN(p.value)) return false;
    return p.value >= lowerBound && p.value <= upperBound;
  });

  return {
    data: filtered,
    removed: data.length - filtered.length,
  };
}

export function interpolateMissing(
  data: TimeSeriesPoint[],
  method: 'linear' | 'spline' | 'time' = 'linear',
  maxGapSize: number = 5
): { data: TimeSeriesPoint[]; filled: number } {
  if (!Array.isArray(data) || data.length < 2) {
    return { data: data || [], filled: 0 };
  }

  const sortedData = [...data].sort((a, b) => a.timestamp - b.timestamp);
  const result: TimeSeriesPoint[] = [];
  let filledCount = 0;

  for (let i = 0; i < sortedData.length; i++) {
    const current = sortedData[i];
    result.push(current);

    if (i < sortedData.length - 1) {
      const next = sortedData[i + 1];
      const timeDiff = next.timestamp - current.timestamp;
      const avgInterval = i > 0
        ? (current.timestamp - sortedData[i - 1].timestamp)
        : timeDiff;

      if (avgInterval > 0 && timeDiff > avgInterval * 1.5) {
        const estimatedPoints = Math.min(
          Math.floor(timeDiff / avgInterval) - 1,
          maxGapSize
        );

        for (let j = 1; j <= estimatedPoints; j++) {
          const ratio = j / (estimatedPoints + 1);
          const interpolatedTimestamp = current.timestamp + timeDiff * ratio;
          const interpolatedValue = linearInterpolation(
            interpolatedTimestamp,
            current.timestamp,
            current.value,
            next.timestamp,
            next.value
          );

          result.push({
            timestamp: Math.round(interpolatedTimestamp),
            value: interpolatedValue,
            isInterpolated: true,
          });
          filledCount++;
        }
      }
    }
  }

  return {
    data: result.sort((a, b) => a.timestamp - b.timestamp),
    filled: filledCount,
  };
}

export function removeInvalidValues(
  data: TimeSeriesPoint[],
  validRange?: { min: number; max: number },
  removeNegative: boolean = true
): TimeSeriesPoint[] {
  if (!Array.isArray(data)) return [];

  return data.filter(p => {
    if (!p) return false;
    if (typeof p.timestamp !== 'number' || isNaN(p.timestamp)) return false;
    if (typeof p.value !== 'number' || isNaN(p.value)) return false;
    if (removeNegative && p.value < 0) return false;
    if (validRange) {
      if (p.value < validRange.min || p.value > validRange.max) return false;
    }
    return true;
  });
}

export function dedupeTimestamps(data: TimeSeriesPoint[]): TimeSeriesPoint[] {
  if (!Array.isArray(data)) return [];

  const seen = new Map<number, number[]>();
  data.forEach(p => {
    if (p && typeof p.timestamp === 'number' && typeof p.value === 'number') {
      if (!seen.has(p.timestamp)) {
        seen.set(p.timestamp, []);
      }
      seen.get(p.timestamp)!.push(p.value);
    }
  });

  const result: TimeSeriesPoint[] = [];
  seen.forEach((values, timestamp) => {
    result.push({
      timestamp,
      value: calculateMean(values),
    });
  });

  return result.sort((a, b) => a.timestamp - b.timestamp);
}

export function cleanTimeSeriesData(
  data: TimeSeriesPoint[],
  options: CleaningOptions = {}
): CleaningResult {
  const originalCount = Array.isArray(data) ? data.length : 0;

  let cleanedData = removeInvalidValues(
    data,
    options.validRange,
    options.removeNegative !== false
  );

  const validAfterInvalid = cleanedData.length;

  cleanedData = dedupeTimestamps(cleanedData);

  let removedOutliers = 0;
  if (options.outlierThreshold !== 0) {
    const outlierResult = removeOutliers(
      cleanedData,
      options.outlierThreshold || DATA_CLEANING_CONFIG.outlierThreshold
    );
    cleanedData = outlierResult.data;
    removedOutliers = outlierResult.removed;
  }

  let filledMissing = 0;
  if (options.enableInterpolation) {
    const interpolationResult = interpolateMissing(
      cleanedData,
      options.interpolationMethod || DATA_CLEANING_CONFIG.interpolationMethod as any,
      options.maxGapSize || 5
    );
    cleanedData = interpolationResult.data;
    filledMissing = interpolationResult.filled;
  }

  return {
    data: cleanedData,
    removedOutliers,
    filledMissing,
    totalProcessed: originalCount,
    stats: {
      originalCount,
      validCount: cleanedData.length,
      outlierCount: removedOutliers,
      missingCount: filledMissing,
    },
  };
}

export function batchCleanData(
  datasets: Record<string, TimeSeriesPoint[]>,
  options: CleaningOptions = {}
): Record<string, CleaningResult> {
  const results: Record<string, CleaningResult> = {};

  Object.keys(datasets).forEach(key => {
    results[key] = cleanTimeSeriesData(datasets[key] || [], options);
  });

  return results;
}

export function getQualityScore(result: CleaningResult): number {
  const { originalCount, validCount, outlierCount, missingCount } = result.stats;

  if (originalCount === 0) return 0;

  const validityRatio = validCount / originalCount;
  const outlierRatio = outlierCount / originalCount;
  const missingRatio = missingCount / Math.max(validCount + missingCount, 1);

  const score = Math.max(0, 100 * (validityRatio - outlierRatio * 0.5 - missingRatio * 0.3));

  return Math.round(score * 100) / 100;
}

export function getDataQualityColor(score: number): string {
  if (score >= 90) return '#52c41a';
  if (score >= 70) return '#faad14';
  if (score >= 50) return '#fa8c16';
  return '#ff4d4f';
}
