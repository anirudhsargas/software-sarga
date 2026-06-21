import { describe, it, expect, vi, beforeEach } from 'vitest';
import api from '../api';

vi.mock('../api', () => ({
  default: { get: vi.fn() },
}));

describe('serverTime service', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('initServerTime calculates offset on success', async () => {
    const mockTimestamp = Date.now();
    api.get.mockResolvedValue({ data: { timestamp: mockTimestamp } });

    const { initServerTime, serverNow } = await import('../serverTime');
    await initServerTime();

    const now = serverNow();
    expect(now).toBeInstanceOf(Date);
    expect(now.getTime()).toBeGreaterThan(0);
  });

  it('initServerTime falls back to device clock on failure', async () => {
    api.get.mockRejectedValue(new Error('Network error'));

    const { initServerTime, serverNow } = await import('../serverTime');
    await initServerTime();

    const now = serverNow();
    expect(now).toBeInstanceOf(Date);
  });

  it('serverToday returns YYYY-MM-DD format', async () => {
    const { serverToday } = await import('../serverTime');
    expect(serverToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('serverThisMonth returns YYYY-MM format', async () => {
    const { serverThisMonth } = await import('../serverTime');
    expect(serverThisMonth()).toMatch(/^\d{4}-\d{2}$/);
  });

  it('serverDateTimeLocal returns ISO-like datetime', async () => {
    const { serverDateTimeLocal } = await import('../serverTime');
    const val = serverDateTimeLocal();
    expect(val).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('isServerTimeReady returns boolean', async () => {
    const { isServerTimeReady } = await import('../serverTime');
    expect(typeof isServerTimeReady()).toBe('boolean');
  });
});
