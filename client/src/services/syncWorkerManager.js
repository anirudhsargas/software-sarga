class SyncWorkerManager {
  constructor() {
    this.worker = null;
    this.listeners = new Map();
    this.status = 'idle'; // idle | syncing | error
    this.pendingCount = 0;
    this.lastSync = null;
  }

  // Initialize worker
  init() {
    if (this.worker) return;
    if (!window.Worker) {
      console.warn('Web Workers not supported');
      return;
    }

    // Load the versioned worker to ensure clients pick up updates
    this.worker = new Worker('/syncWorker.v2.js');

    // Handle messages from worker
    this.worker.onmessage = (event) => {
      this.handleWorkerMessage(event.data);
    };

    this.worker.onerror = (err) => {
      console.error('Sync worker error:', err);
      this.status = 'error';
      this.emit('status_change', { status: 'error' });
    };

    // Send config to worker
    const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';

    // Resolve API base URL with fallbacks so production clients still work
    // even when build-time env var is not present (e.g. missing Vercel env).
    let apiBaseUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '';
    if (!apiBaseUrl) {
      // Known production backend fallback for hosted app
      const host = window.location.hostname || '';
        if (host.includes('software-sarga.vercel.app') || host.includes('software-sarga')) {
          apiBaseUrl = 'https://software-sarga-2.onrender.com/api';
        } else {
        // Default to same origin /api as last resort (useful for local preview)
        apiBaseUrl = window.location.origin + '/api';
      }
      console.warn('[SyncWorkerManager] VITE_API_URL missing; using fallback:', apiBaseUrl);
    }

    this.worker.postMessage({
      type: 'INIT',
      payload: {
        apiBaseUrl,
        token,
        dbName: 'sarga-offline'
      }
    });
  }

  // Handle messages from worker
  handleWorkerMessage(data) {
    switch (data.type) {
      case 'WORKER_READY':
        this.startAutoSync();
        break;

      case 'SYNC_STARTED':
        this.status = 'syncing';
        this.emit('status_change', { status: 'syncing' });
        break;

      case 'SYNC_COMPLETED':
        this.status = 'synced';
        this.lastSync = data.timestamp;
        this.emit('status_change', {
          status: 'synced',
          billsSynced: data.billsSynced,
          paymentsSynced: data.paymentsSynced,
          timestamp: data.timestamp
        });
        // Notify UI to refresh data if anything was synced
        if (data.billsSynced > 0 || data.paymentsSynced > 0) {
          this.emit('data_changed', data);
        }
        break;

      case 'SYNC_FAILED':
        this.status = 'error';
        this.emit('status_change', { status: 'error', error: data.error });
        break;

      case 'BILL_SYNCED':
        this.emit('bill_synced', data);
        break;

      case 'PAYMENT_SYNCED':
        this.emit('payment_synced', data);
        break;

      case 'MASTER_DATA_UPDATED':
        this.emit('master_data_updated', data);
        break;
    }
  }

  // Start auto sync
  startAutoSync() {
    this.worker?.postMessage({ type: 'START_AUTO_SYNC' });
  }

  // Manual sync trigger
  syncNow() {
    this.worker?.postMessage({ type: 'SYNC_NOW' });
  }

  // Invalidate cache for a data key and trigger sync
  invalidateCache(dataKey) {
    this.worker?.postMessage({
      type: 'INVALIDATE_CACHE',
      payload: { dataKey }
    });
  }

  // Update token after login
  updateToken(token) {
    this.worker?.postMessage({
      type: 'UPDATE_TOKEN',
      payload: { token }
    });
  }

  // Update online status
  setOnlineStatus(online) {
    this.worker?.postMessage({
      type: 'UPDATE_ONLINE_STATUS',
      payload: { online }
    });
  }

  // Event system
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    const list = this.listeners.get(event) || [];
    this.listeners.set(event, list.filter(cb => cb !== callback));
  }

  emit(event, data) {
    const list = this.listeners.get(event) || [];
    list.forEach(cb => cb(data));
  }

  // Destroy worker
  destroy() {
    this.worker?.terminate();
    this.worker = null;
  }
}

// Export singleton
export const syncManager = new SyncWorkerManager();