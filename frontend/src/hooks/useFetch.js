import { useEffect, useState, useCallback, useRef } from 'react';
import { apiFetch } from '../services/core';

export function useFetch(urlOrFetcher, options) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const fetcherRef = useRef(urlOrFetcher);
  fetcherRef.current = urlOrFetcher;

  const execute = useCallback(async () => {
    const target = fetcherRef.current;
    if (!target) {
      setLoading(false);
      return null;
    }
    setLoading(true);
    try {
      let result;
      if (typeof target === 'function') {
        result = await target();
      } else {
        result = await apiFetch(target, optionsRef.current);
      }
      setData(result);
      setError(null);
      return result;
    } catch (err) {
      setError(err);
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
        let result;
        if (typeof target === 'function') {
          result = await target();
        } else {
          result = await apiFetch(target, optionsRef.current);
        }
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err);
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
