import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

interface CacheOptions {
  ttl?: number;
  maxSize?: number;
}

interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

class CacheStore {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private ttl: number = 5 * 60 * 1000;
  private maxSize: number = 100;

  constructor(options: CacheOptions = {}) {
    this.ttl = options.ttl || this.ttl;
    this.maxSize = options.maxSize || this.maxSize;
  }

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return undefined;
    
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return undefined;
    }
    
    return entry.value;
  }

  set<T>(key: string, value: T): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  invalidate(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }
}

const globalCache = new CacheStore();

export function useCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions & { enabled?: boolean } = {}
): {
  data: T | undefined;
  loading: boolean;
  error: Error | undefined;
  refetch: () => Promise<T>;
  clearCache: () => void;
} {
  const [data, setData] = useState<T | undefined>(() => globalCache.get<T>(key));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>();
  const isFetching = useRef(false);

  const fetchData = useCallback(async (skipCache = false): Promise<T> => {
    if (!skipCache) {
      const cached = globalCache.get<T>(key);
      if (cached !== undefined) {
        setData(cached);
        return cached;
      }
    }

    if (isFetching.current) {
      return new Promise((resolve) => {
        const check = setInterval(() => {
          const cached = globalCache.get<T>(key);
          if (cached !== undefined) {
            clearInterval(check);
            resolve(cached);
          }
        }, 100);
      });
    }

    isFetching.current = true;
    setLoading(true);
    setError(undefined);

    try {
      const result = await fetcher();
      globalCache.set(key, result);
      setData(result);
      return result;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
      isFetching.current = false;
    }
  }, [key, fetcher]);

  const refetch = useCallback(() => {
    return fetchData(true);
  }, [fetchData]);

  const clearCache = useCallback(() => {
    globalCache.delete(key);
    setData(undefined);
  }, [key]);

  useEffect(() => {
    if (options.enabled !== false) {
      fetchData();
    }
  }, [fetchData, options.enabled]);

  return { data, loading, error, refetch, clearCache };
}

export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

export function useThrottle<T>(value: T, limit: number = 500): T {
  const [throttledValue, setThrottledValue] = useState(value);
  const lastRan = useRef(Date.now());

  useEffect(() => {
    const handler = setTimeout(() => {
      if (Date.now() - lastRan.current >= limit) {
        setThrottledValue(value);
        lastRan.current = Date.now();
      }
    }, limit - (Date.now() - lastRan.current));

    return () => clearTimeout(handler);
  }, [value, limit]);

  return throttledValue;
}

export function useVirtualList<T>(
  items: T[],
  itemHeight: number,
  containerHeight: number,
  overscan: number = 5
) {
  const [scrollTop, setScrollTop] = useState(0);

  const virtualData = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      items.length,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    );
    
    return {
      items: items.slice(startIndex, endIndex),
      startIndex,
      endIndex,
      offsetY: startIndex * itemHeight
    };
  }, [items, itemHeight, containerHeight, scrollTop, overscan]);

  const totalHeight = items.length * itemHeight;

  return {
    virtualItems: virtualData.items,
    totalHeight,
    offsetY: virtualData.offsetY,
    startIndex: virtualData.startIndex,
    endIndex: virtualData.endIndex,
    onScroll: (e: React.UIEvent<HTMLElement>) => setScrollTop(e.currentTarget.scrollTop)
  };
}

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = (value: T) => {
    try {
      setStoredValue(value);
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  };

  return [storedValue, setValue];
}

export { CacheStore, globalCache };
