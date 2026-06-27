import { useState, useCallback, useRef, useEffect } from 'react';
import api from '../services/api';

/**
 * Custom hook for handling API requests with offline/error handling
 * Returns { data, loading, error, retry, lastUpdated }
 * 
 * Usage:
 * const { data, loading, error, retry } = useApiRequest('/endpoint');
 */
const useApiRequest = (url, options) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  
  const lastDataRef = useRef(null);
  const abortControllerRef = useRef(null);
  const mountedRef = useRef(true);
  const optionsRef = useRef(options);

  // Keep ref in sync with latest options to avoid stale closures
  useEffect(() => { optionsRef.current = options; });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);

    // Cancel previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      const response = await api.get(url, {
        signal: abortControllerRef.current.signal,
        ...optionsRef.current
      });

      const responseData = response.data || null;

      if (mountedRef.current) {
        setData(responseData);
        lastDataRef.current = responseData;
        setLastUpdated(new Date());
        setError(false);
      }

      return responseData;
    } catch (err) {
      // Don't treat abort errors as failures
      if (err.name === 'AbortError') {
        return;
      }

      console.error(`API Error [${url}]:`, err.message);

      if (mountedRef.current) {
        setError(true);

        // Use last cached data if available
        if (lastDataRef.current) {
          setData(lastDataRef.current);
        }
      }

      return lastDataRef.current || null;
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [url]);

  // Initial fetch on mount or when URL changes
  useEffect(() => {
    mountedRef.current = true;
    fetchData();

    return () => {
      mountedRef.current = false;
      // Cleanup: abort request on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchData]);

  const retry = useCallback(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    retry,
    lastUpdated,
    hasData: data !== null && data !== undefined
  };
};

export default useApiRequest;
