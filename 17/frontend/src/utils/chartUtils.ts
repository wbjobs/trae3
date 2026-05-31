import type { TimeSeriesPoint } from '@/types';
import { LTTB_SAMPLE_SIZE } from '@/constants';

export function lttbDownsample(data: [number, number][], threshold: number = LTTB_SAMPLE_SIZE): [number, number][] {
  if (!Array.isArray(data) || data.length <= threshold) {
    return data || [];
  }

  const sampled: [number, number][] = [data[0]];
  const bucketSize = (data.length - 2) / (threshold - 2);

  for (let i = 0; i < threshold - 2; i++) {
    const avgStart = Math.floor(i * bucketSize) + 1;
    const avgEnd = Math.floor((i + 1) * bucketSize) + 1;

    let sumX = 0, sumY = 0;
    let count = 0;
    for (let j = avgStart; j < avgEnd && j < data.length - 1; j++) {
      if (data[j] && typeof data[j][0] === 'number' && typeof data[j][1] === 'number') {
        sumX += data[j][0];
        sumY += data[j][1];
        count++;
      }
    }

    if (count === 0) continue;

    const avgX = sumX / count;
    const avgY = sumY / count;

    let maxArea = 0;
    let maxPoint = data[avgStart] || [0, 0];

    for (let j = avgStart; j < avgEnd && j < data.length - 1; j++) {
      if (!data[j] || !sampled[i]) continue;

      const area = Math.abs(
        (sampled[i][0] - avgX) * (data[j][1] - sampled[i][1]) -
        (sampled[i][0] - data[j][0]) * (avgY - sampled[i][1])
      ) / 2;

      if (area > maxArea) {
        maxArea = area;
        maxPoint = data[j];
      }
    }
    sampled.push(maxPoint);
  }

  if (data.length > 0) {
    sampled.push(data[data.length - 1]);
  }

  return sampled;
}

export function formatTimeSeriesData(
  points: TimeSeriesPoint[],
  sampling: 'none' | 'lttb' | 'average' = 'average',
  sampleSize: number = LTTB_SAMPLE_SIZE
): [number, number][] {
  if (!Array.isArray(points) || points.length === 0) {
    return [];
  }

  let chartData = points
    .filter(p => p && typeof p.timestamp === 'number' && typeof p.value === 'number' && !isNaN(p.value))
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(p => [p.timestamp, p.value] as [number, number]);

  if (sampling === 'lttb' && chartData.length > sampleSize) {
    chartData = lttbDownsample(chartData, sampleSize);
  }

  return chartData;
}

export function calculateChartStats(data: [number, number][]) {
  if (!Array.isArray(data) || data.length === 0) {
    return { min: 0, max: 0, avg: 0, count: 0 };
  }

  const values = data.map(d => d[1]).filter(v => typeof v === 'number' && !isNaN(v));
  if (values.length === 0) {
    return { min: 0, max: 0, avg: 0, count: 0 };
  }

  return {
    min: Math.min(...values),
    max: Math.max(...values),
    avg: values.reduce((a, b) => a + b, 0) / values.length,
    count: values.length,
  };
}

export function safeChartData(data: Record<string, TimeSeriesPoint[]> | undefined | null): Record<string, [number, number][]> {
  if (!data || typeof data !== 'object') {
    return {};
  }

  const result: Record<string, [number, number][]> = {};

  Object.keys(data).forEach(key => {
    const points = data[key];
    if (Array.isArray(points)) {
      result[key] = formatTimeSeriesData(points);
    }
  });

  return result;
}

export function hasValidData(data: Record<string, TimeSeriesPoint[]> | undefined | null): boolean {
  if (!data || typeof data !== 'object') {
    return false;
  }

  return Object.values(data).some(points =>
    Array.isArray(points) && points.some(p =>
      p && typeof p.timestamp === 'number' && typeof p.value === 'number' && !isNaN(p.value)
    )
  );
}
