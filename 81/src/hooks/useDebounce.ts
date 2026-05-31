import { useState, useEffect, useCallback, useRef } from 'react';

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

interface UsePollingOptions {
  interval?: number;
  enabled?: boolean;
}

export function usePolling(
  callback: () => Promise<void>,
  options: UsePollingOptions = {}
) {
  const { interval = 30000, enabled = true } = options;
  const callbackRef = useRef(callback);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      setIsPolling(true);
      try {
        await callbackRef.current();
      } catch (error) {
        console.error('Polling error:', error);
      } finally {
        if (!cancelled) setIsPolling(false);
      }
    };

    tick();

    intervalRef.current = setInterval(tick, interval);

    return () => {
      cancelled = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, interval]);

  const refreshNow = useCallback(async () => {
    setIsPolling(true);
    try {
      await callbackRef.current();
    } catch (error) {
      console.error('Refresh error:', error);
    } finally {
      setIsPolling(false);
    }
  }, []);

  return {
    isPolling,
    refreshNow
  };
}
