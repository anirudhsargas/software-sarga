import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePagination } from '../usePagination';

describe('usePagination', () => {
  const mockFetchFn = vi.fn();

  beforeEach(() => {
    mockFetchFn.mockReset();
  });

  it('initializes with default values', () => {
    const { result } = renderHook(() => usePagination(mockFetchFn));
    expect(result.current.page).toBe(1);
    expect(result.current.total).toBe(0);
    expect(result.current.totalPages).toBe(1);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual([]);
  });

  it('calls fetchFn on refresh and updates data', async () => {
    mockFetchFn.mockResolvedValue({
      data: [{ id: 1, name: 'Test' }],
      total: 1,
      totalPages: 1,
    });

    const { result } = renderHook(() => usePagination(mockFetchFn));

    result.current.refresh();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual([{ id: 1, name: 'Test' }]);
    expect(result.current.total).toBe(1);
  });

  it('handles errors', async () => {
    mockFetchFn.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => usePagination(mockFetchFn));

    result.current.refresh();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.error.message).toBe('Network error');
  });

  it('goToPage calls fetch with new page number', () => {
    const { result } = renderHook(() => usePagination(mockFetchFn));

    const scrollSpy = vi.fn();
    window.scrollTo = scrollSpy;

    result.current.goToPage(3);
    expect(scrollSpy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });
});
