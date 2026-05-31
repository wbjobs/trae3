export type WorkerMessageType = 'DOWNSAMPLE' | 'SORT' | 'FILTER' | 'AGGREGATE';
export type WorkerResultType = 'RESULT' | 'ERROR' | 'PROGRESS';

export interface WorkerMessage {
  type: WorkerMessageType;
  id: string;
  payload: any;
}

export interface WorkerResult {
  type: WorkerResultType;
  id: string;
  payload: any;
}

export interface DownsamplePayload {
  data: [number, number][];
  threshold: number;
}

export interface SortPayload {
  data: [number, number][];
  field: 'timestamp' | 'value';
  order: 'asc' | 'desc';
}

export interface FilterPayload {
  data: [number, number][];
  field: 'timestamp' | 'value';
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';
  value: number;
}

export interface AggregatePayload {
  data: [number, number][];
  interval: number;
  method: 'avg' | 'max' | 'min' | 'sum' | 'count';
}

function lttbDownsample(data: [number, number][], threshold: number): [number, number][] {
  if (!Array.isArray(data) || data.length <= threshold) {
    return data || [];
  }

  const sampled: [number, number][] = [data[0]];
  const bucketSize = (data.length - 2) / (threshold - 2);

  for (let i = 0; i < threshold - 2; i++) {
    const avgStart = Math.floor(i * bucketSize) + 1;
    const avgEnd = Math.floor((i + 1) * bucketSize) + 1;

    let sumX = 0, sumY = 0, count = 0;
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

function sortData(data: [number, number][], field: 'timestamp' | 'value', order: 'asc' | 'desc'): [number, number][] {
  const index = field === 'timestamp' ? 0 : 1;
  return [...data].sort((a, b) => {
    const diff = a[index] - b[index];
    return order === 'asc' ? diff : -diff;
  });
}

function filterData(data: [number, number][], field: 'timestamp' | 'value', operator: string, value: number): [number, number][] {
  const index = field === 'timestamp' ? 0 : 1;
  return data.filter(item => {
    const v = item[index];
    switch (operator) {
      case 'gt': return v > value;
      case 'gte': return v >= value;
      case 'lt': return v < value;
      case 'lte': return v <= value;
      case 'eq': return v === value;
      case 'neq': return v !== value;
      default: return true;
    }
  });
}

function aggregateData(data: [number, number][], interval: number, method: string): [number, number][] {
  if (!Array.isArray(data) || data.length === 0) return [];

  const minTime = data[0][0];
  const maxTime = data[data.length - 1][0];
  const result: [number, number][] = [];

  const totalBuckets = Math.ceil((maxTime - minTime) / interval);

  for (let i = 0; i < totalBuckets; i++) {
    const bucketStart = minTime + i * interval;
    const bucketEnd = bucketStart + interval;

    const bucketValues = data
      .filter(d => d[0] >= bucketStart && d[0] < bucketEnd)
      .map(d => d[1]);

    if (bucketValues.length === 0) continue;

    let aggregatedValue: number;
    switch (method) {
      case 'avg':
        aggregatedValue = bucketValues.reduce((a, b) => a + b, 0) / bucketValues.length;
        break;
      case 'max':
        aggregatedValue = Math.max(...bucketValues);
        break;
      case 'min':
        aggregatedValue = Math.min(...bucketValues);
        break;
      case 'sum':
        aggregatedValue = bucketValues.reduce((a, b) => a + b, 0);
        break;
      case 'count':
        aggregatedValue = bucketValues.length;
        break;
      default:
        aggregatedValue = bucketValues.reduce((a, b) => a + b, 0) / bucketValues.length;
    }

    result.push([bucketStart, aggregatedValue]);
  }

  return result;
}

function handleMessage(message: WorkerMessage): WorkerResult {
  const { type, id, payload } = message;

  try {
    switch (type) {
      case 'DOWNSAMPLE': {
        const { data, threshold } = payload as DownsamplePayload;
        const result = lttbDownsample(data, threshold);
        return { type: 'RESULT', id, payload: result };
      }
      case 'SORT': {
        const { data, field, order } = payload as SortPayload;
        const result = sortData(data, field, order);
        return { type: 'RESULT', id, payload: result };
      }
      case 'FILTER': {
        const { data, field, operator, value } = payload as FilterPayload;
        const result = filterData(data, field, operator, value);
        return { type: 'RESULT', id, payload: result };
      }
      case 'AGGREGATE': {
        const { data, interval, method } = payload as AggregatePayload;
        const result = aggregateData(data, interval, method);
        return { type: 'RESULT', id, payload: result };
      }
      default:
        return { type: 'ERROR', id, payload: { message: `Unknown message type: ${type}` } };
    }
  } catch (err: any) {
    return { type: 'ERROR', id, payload: { message: err.message || 'Unknown error' } };
  }
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const result = handleMessage(event.data);
  (self as unknown as Worker).postMessage(result);
};
