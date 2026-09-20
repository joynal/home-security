import { useEffect, useState, useCallback, useRef } from 'react';
import { apiFetch, type ApiFetchOptions } from '../services/core';

export interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<T | null>;
}

export type FetcherFn<T> = () => Promise<T>;

export function useFetch<T = unknown>(
  urlOrFetcher: string | FetcherFn<T> | null,
  options?: ApiFetchOptions,
): UseFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const fetcherRef = useRef(urlOrFetcher);
  fetcherRef.current = urlOrFetcher;

  const execute = useCallback(async (): Promise<T | null> => {
    const target = fetcherRef.current;
    if (!target) {
      setLoading(false);
      return null;
    }
    setLoading(true);
    try {
      let result: T;
      if (typeof target === 'function') {
        result = await target();
      } else {
        result = await apiFetch<T>(target, optionsRef.current);
      }
      setData(result);
      setError(null);
      return result;
    } catch (err) {
      setError(err as Error);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const dep = typeof urlOrFetcher === 'string' ? urlOrFetcher : null;

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const target = fetcherRef.current;
      if (!target) {
        if (!cancelled) setLoading(false);
        return;
      }
      if (!cancelled) setLoading(true);
      try {
        let result: T;
        if (typeof target === 'function') {
          result = await target();
        } else {
          result = await apiFetch<T>(target, optionsRef.current);
        }
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err as Error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [dep]);

  return { data, loading, error, refetch: execute };
}

export default useFetch;
