import { describe, it, expect, vi, beforeEach } from 'vitest';
import api, { API_URL, imgUrl, getAuthHeader, deduplicatedGet } from '../../services/api';
import axios from 'axios';
import toast from 'react-hot-toast';

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    })),
  },
}));

describe('API Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('exports API_URL as a string', () => {
    expect(typeof API_URL).toBe('string');
    expect(API_URL.length).toBeGreaterThan(0);
  });

  it('exports api as an axios instance', () => {
    expect(api).toBeDefined();
  });

  it('getAuthHeader returns object with Authorization token', () => {
    localStorage.setItem('token', 'test-token');
    const header = getAuthHeader();
    expect(header).toEqual({ Authorization: 'Bearer test-token' });
  });

  it('getAuthHeader returns empty object when no token', () => {
    const header = getAuthHeader();
    expect(header).toEqual({});
  });

  it('imgUrl returns empty string for null path', () => {
    expect(imgUrl(null)).toBe('');
    expect(imgUrl('')).toBe('');
  });

  it('imgUrl includes token when stored', () => {
    localStorage.setItem('token', 'my-token');
    const url = imgUrl('/uploads/test.jpg');
    expect(url).toContain('token=my-token');
  });

  it('imgUrl handles full URLs', () => {
    localStorage.setItem('token', 't');
    const url = imgUrl('https://example.com/image.jpg');
    expect(url).toContain('https://example.com/image.jpg');
    expect(url).toContain('token=t');
  });
});

describe('deduplicatedGet', () => {
  it('deduplicates concurrent requests', async () => {
    const mockGet = vi.fn().mockResolvedValue({ data: 'result' });
    const mockApi = { get: mockGet };

    const promise1 = deduplicatedGet('/test', {}, mockApi);
    const promise2 = deduplicatedGet('/test', {}, mockApi);

    expect(mockGet).toHaveBeenCalledTimes(1);

    await promise1;
    await promise2;
  });
});
