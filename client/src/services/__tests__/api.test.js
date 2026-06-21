import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import api, { imgUrl, deduplicatedGet, cachedGet, API_URL, devFallback } from '../api';

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
  toast: { error: vi.fn(), success: vi.fn() },
}));

describe('API Service', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('API_URL', () => {
    it('returns a non-empty string', () => {
      expect(API_URL).toBeTruthy();
      expect(typeof API_URL).toBe('string');
    });

    it('ends with /api/', () => {
      expect(API_URL.endsWith('/api/') || API_URL.endsWith('/api/')).toBe(true);
    });
  });

  describe('imgUrl', () => {
    it('returns empty string for falsy path', () => {
      expect(imgUrl('')).toBe('');
      expect(imgUrl(null)).toBe('');
      expect(imgUrl(undefined)).toBe('');
    });

    it('appends token query param when token exists', () => {
      localStorage.setItem('token', 'test-token');
      const url = imgUrl('/uploads/test.jpg');
      expect(url).toContain('token=test-token');
    });

    it('handles absolute URLs', () => {
      localStorage.setItem('token', 'tok');
      const url = imgUrl('https://example.com/image.jpg');
      expect(url).toContain('token=tok');
      expect(url).toContain('https://example.com/image.jpg');
    });
  });

  describe('deduplicatedGet', () => {
    it('deduplicates concurrent requests', async () => {
      const mockGet = vi.spyOn(api, 'get').mockResolvedValue({ data: 'result' });

      const p1 = deduplicatedGet('/test');
      const p2 = deduplicatedGet('/test');

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toEqual(r2);
      mockGet.mockRestore();
    });
  });

  describe('devFallback', () => {
    it('returns path as-is when not local', () => {
      Object.defineProperty(window, 'location', {
        value: { hostname: 'example.com' },
        writable: true,
      });
      expect(devFallback('/api/products')).toBe('/api/products');
    });
  });
});
