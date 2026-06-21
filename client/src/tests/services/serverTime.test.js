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
}));

describe('Server Time Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initServerTime fetches and computes offset', async () => {
    const api = (await import('../../services/api')).default;
    const now = Date.now();
    api.get.mockResolvedValue({
      data: { timestamp: now, date: '2026-06-21', month: '2026-06' },
    });

    await initServerTime();
    expect(api.get).toHaveBeenCalledWith('/server-time');
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
    api.get.mockRejectedValue(new Error('Network error'));
    await initServerTime();
    expect(isServerTimeReady()).toBe(true);
  });
});
