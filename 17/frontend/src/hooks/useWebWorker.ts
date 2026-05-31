import { useEffect, useRef, useCallback, useState } from 'react';

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

export interface UseWebWorkerOptions {
  workerUrl?: string;
  timeout?: number;
}

export interface UseWebWorkerReturn<T = any> {
  data: T | null;
  loading: boolean;
  error: string | null;
  postMessage: (type: WorkerMessageType, payload: any) => string;
  terminate: () => void;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function useWebWorker<T = any>(options: UseWebWorkerOptions = {}): UseWebWorkerReturn<T> {
  const { workerUrl = new URL('@/workers/dataProcessor.worker.ts', import.meta.url).toString(), timeout = 30000 } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const pendingRequests = useRef<Map<string, {
    timeoutId: ReturnType<typeof setTimeout>;
    startTime: number;
  }>>(new Map());

  useEffect(() => {
    try {
      workerRef.current = new Worker(workerUrl, { type: 'module' });

      workerRef.current.onmessage = (event: MessageEvent<WorkerResult>) => {
        const { type, id, payload } = event.data;
        const pending = pendingRequests.current.get(id);
        
        if (pending) {
          clearTimeout(pending.timeoutId);
          pendingRequests.current.delete(id);
        }

        if (type === 'RESULT') {
          setData(payload);
          setError(null);
        } else if (type === 'ERROR') {
          setError(payload?.message || 'Worker error');
          setData(null);
        }

        if (pendingRequests.current.size === 0) {
          setLoading(false);
        }
      };

      workerRef.current.onerror = (event: ErrorEvent) => {
        setError(event.message || 'Worker error');
        setLoading(false);
        setData(null);
        pendingRequests.current.forEach((pending) => {
          clearTimeout(pending.timeoutId);
        });
        pendingRequests.current.clear();
      };
    } catch (err: any) {
      setError(err?.message || 'Failed to create worker');
    }

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      pendingRequests.current.forEach((pending) => {
        clearTimeout(pending.timeoutId);
      });
      pendingRequests.current.clear();
    };
  }, [workerUrl]);

  const postMessage = useCallback((type: WorkerMessageType, payload: any): string => {
    const id = generateId();

    if (!workerRef.current) {
      setError('Worker not initialized');
      return id;
    }

    const timeoutId = setTimeout(() => {
      pendingRequests.current.delete(id);
      if (pendingRequests.current.size === 0) {
        setLoading(false);
      }
      setError(`Worker request timed out after ${timeout}ms`);
    }, timeout);

    pendingRequests.current.set(id, { timeoutId, startTime: Date.now() });
    setLoading(true);
    setError(null);

    workerRef.current.postMessage({ type, id, payload });

    return id;
  }, [timeout]);

  const terminate = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    pendingRequests.current.forEach((pending) => {
      clearTimeout(pending.timeoutId);
    });
    pendingRequests.current.clear();
    setLoading(false);
  }, []);

  return {
    data,
    loading,
    error,
    postMessage,
    terminate,
  };
}

export interface DownsampleParams {
  data: [number, number][];
  threshold: number;
}

export interface SortParams {
  data: [number, number][];
  field: 'timestamp' | 'value';
  order: 'asc' | 'desc';
}

export interface FilterParams {
  data: [number, number][];
  field: 'timestamp' | 'value';
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';
  value: number;
}

export interface AggregateParams {
  data: [number, number][];
  interval: number;
  method: 'avg' | 'max' | 'min' | 'sum' | 'count';
}

export function useDataProcessor() {
  const worker = useWebWorker<[number, number][]>();

  const downsample = useCallback((params: DownsampleParams) => {
    return worker.postMessage('DOWNSAMPLE', params);
  }, [worker]);

  const sort = useCallback((params: SortParams) => {
    return worker.postMessage('SORT', params);
  }, [worker]);

  const filter = useCallback((params: FilterParams) => {
    return worker.postMessage('FILTER', params);
  }, [worker]);

  const aggregate = useCallback((params: AggregateParams) => {
    return worker.postMessage('AGGREGATE', params);
  }, [worker]);

  return {
    ...worker,
    downsample,
    sort,
    filter,
    aggregate,
  };
}
