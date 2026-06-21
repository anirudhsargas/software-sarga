import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncManager } from '../syncWorkerManager';

describe('SyncWorkerManager', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'Worker', {
      writable: true,
      value: vi.fn(() => ({
        postMessage: vi.fn(),
        terminate: vi.fn(),
        onmessage: null,
        onerror: null,
      })),
    });
  });

  it('initializes a web worker', () => {
    syncManager.init();
    expect(window.Worker).toHaveBeenCalled();
  });

  it('does not initialize twice', () => {
    const workerCount = window.Worker.mock.calls.length;
    syncManager.init();
    expect(window.Worker.mock.calls.length).toBe(workerCount);
  });

  it('starts with idle status', () => {
    expect(syncManager.status).toBe('idle');
  });

  it('has event methods', () => {
    const cb = vi.fn();
    syncManager.on('status_change', cb);
    syncManager.emit('status_change', { status: 'synced' });
    expect(cb).toHaveBeenCalledWith({ status: 'synced' });

    syncManager.off('status_change', cb);
    syncManager.emit('status_change', { status: 'error' });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('syncNow posts message to worker', () => {
    syncManager.init();
    const postSpy = vi.spyOn(syncManager.worker, 'postMessage');
    syncManager.syncNow();
    expect(postSpy).toHaveBeenCalledWith({ type: 'SYNC_NOW' });
  });

  it('updateToken posts message', () => {
    syncManager.init();
    const postSpy = vi.spyOn(syncManager.worker, 'postMessage');
    syncManager.updateToken('new-token');
    expect(postSpy).toHaveBeenCalledWith({
      type: 'UPDATE_TOKEN',
      payload: { token: 'new-token' },
    });
  });

  it('setOnlineStatus posts message', () => {
    syncManager.init();
    const postSpy = vi.spyOn(syncManager.worker, 'postMessage');
    syncManager.setOnlineStatus(true);
    expect(postSpy).toHaveBeenCalledWith({
      type: 'UPDATE_ONLINE_STATUS',
      payload: { online: true },
    });
  });

  it('invalidateCache posts message', () => {
    syncManager.init();
    const postSpy = vi.spyOn(syncManager.worker, 'postMessage');
    syncManager.invalidateCache('jobs');
    expect(postSpy).toHaveBeenCalledWith({
      type: 'INVALIDATE_CACHE',
      payload: { dataKey: 'jobs' },
    });
  });

  it('destroy terminates worker', () => {
    syncManager.init();
    const termSpy = vi.spyOn(syncManager.worker, 'terminate');
    syncManager.destroy();
    expect(termSpy).toHaveBeenCalled();
    expect(syncManager.worker).toBeNull();
  });

  it('handleWorkerMessage responds to WORKER_READY', () => {
    syncManager.init();
    const startSpy = vi.spyOn(syncManager, 'startAutoSync');
    syncManager.handleWorkerMessage({ type: 'WORKER_READY' });
    expect(startSpy).toHaveBeenCalled();
  });

  it('handleWorkerMessage responds to SYNC_COMPLETED', () => {
    const cb = vi.fn();
    syncManager.on('status_change', cb);
    syncManager.handleWorkerMessage({
      type: 'SYNC_COMPLETED',
      billsSynced: 0,
      paymentsSynced: 1,
      timestamp: 12345,
    });
    expect(syncManager.status).toBe('synced');
  });

  it('handleWorkerMessage responds to SYNC_FAILED', () => {
    const cb = vi.fn();
    syncManager.on('status_change', cb);
    syncManager.handleWorkerMessage({ type: 'SYNC_FAILED', error: 'fail' });
    expect(syncManager.status).toBe('error');
  });

  it('handleWorkerMessage responds to MASTER_DATA_UPDATED', () => {
    const cb = vi.fn();
    syncManager.on('master_data_updated', cb);
    syncManager.handleWorkerMessage({ type: 'MASTER_DATA_UPDATED' });
    expect(cb).toHaveBeenCalled();
  });
});
