import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  initServerTime,
  serverNow,
  serverToday,
  serverThisMonth,
  serverDateTimeLocal,
  isServerTimeReady,
} from '../../services/serverTime';

vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(),
  },
  API_URL: 'http://localhost:3000/api/',
}));

describe('Server Time Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('initServerTime fetches and computes offset', async () => {
    const api = (await import('../../services/api')).default;
    const now = Date.now();
    // Health check uses fetch
    global.fetch.mockResolvedValueOnce({ status: 200 });
    // Server-time uses api.get
    api.get.mockResolvedValueOnce({
      data: { timestamp: now, date: '2026-06-21', month: '2026-06' },
    });

    await initServerTime();
    expect(isServerTimeReady()).toBe(true);
  });

  it('serverNow returns a Date', async () => {
    const now = serverNow();
    expect(now).toBeInstanceOf(Date);
  });

  it('serverToday returns YYYY-MM-DD string', async () => {
    const date = serverToday();
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('serverThisMonth returns YYYY-MM string', async () => {
    const month = serverThisMonth();
    expect(month).toMatch(/^\d{4}-\d{2}$/);
  });

  it('serverDateTimeLocal returns YYYY-MM-DDTHH:MM format', () => {
    const dt = serverDateTimeLocal();
    expect(dt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('handles network failure gracefully', async () => {
    const api = (await import('../../services/api')).default;
    // Health check passes
    global.fetch.mockResolvedValueOnce({ status: 200 });
    // Server-time fails
    api.get.mockRejectedValueOnce(new Error('Network error'));
    await initServerTime();
    expect(isServerTimeReady()).toBe(true);
  });
});
