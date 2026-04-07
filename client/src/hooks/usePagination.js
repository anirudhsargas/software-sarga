import { useState, useCallback } from 'react';

export const usePagination = (fetchFn, options = {}) => {
  const {
    defaultLimit = 20,
    defaultPage = 1,
  } = options;

  const [data, setData] = useState([]);
  const [page, setPage] = useState(defaultPage);
  const [limit] = useState(defaultLimit);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(async (pageNum = page, filters = {}) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: pageNum,
        limit,
        ...filters
      });
      const result = await fetchFn(params.toString());
      // Handle both {data, total, ...} and just data array
      const items = result.data || (Array.isArray(result) ? result : []);
      setData(items);
      setTotal(result.total || items.length);
      setTotalPages(result.totalPages || 1);
      setPage(pageNum);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [page, limit, fetchFn]);

  const goToPage = (pageNum) => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    fetch(pageNum);
  };

  return {
    data, page, total, totalPages,
    loading, error,
    goToPage, refresh: fetch
  };
};

export default usePagination;
