const logger = require('../helpers/logger');

const DEFAULT_MAX_PER_WINDOW = 12;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_QUEUE = 50;

class RequestQueue {
  constructor(options = {}) {
    this.maxPerWindow = options.maxPerWindow || DEFAULT_MAX_PER_WINDOW;
    this.windowMs = options.windowMs || DEFAULT_WINDOW_MS;
    this.maxQueue = options.maxQueue || DEFAULT_MAX_QUEUE;
    this.queue = [];
    this.timestamps = [];
    this.processing = false;
    this.interval = Math.ceil(this.windowMs / this.maxPerWindow);
  }

  getQueueStatus() {
    const queueLength = this.queue.length;
    const estimatedWaitSeconds = queueLength > 0
      ? Math.ceil((queueLength * this.interval) / 1000)
      : 0;
    return { queueLength, estimatedWaitSeconds };
  }

  enqueue(fn) {
    return new Promise((resolve, reject) => {
      if (this.queue.length >= this.maxQueue) {
        const err = new Error('Too many pending extractions, please try again in a few minutes');
        logger.warn('[RequestQueue] Queue full, rejecting enqueue', { queueLength: this.queue.length });
        return reject(err);
      }

      this.queue.push({ fn, resolve, reject });
      logger.info('[RequestQueue] Enqueued request', { queueLength: this.queue.length });

      if (!this.processing) {
        this.processing = true;
        this._processNext();
      }
    });
  }

  _processNext() {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    const now = Date.now();
    this.timestamps = this.timestamps.filter(t => now - t < this.windowMs);

    if (this.timestamps.length >= this.maxPerWindow) {
      const waitTime = this.timestamps[0] + this.windowMs - now;
      logger.debug('[RequestQueue] Rate limit reached, waiting', { waitMs: waitTime, queueLength: this.queue.length });
      setTimeout(() => this._processNext(), Math.max(waitTime, 1));
      return;
    }

    const item = this.queue.shift();
    this.timestamps.push(Date.now());

    const startTime = Date.now();
    item.fn().then(result => {
      const elapsed = Date.now() - startTime;
      logger.info('[RequestQueue] Request completed', { elapsedMs: elapsed, queueLength: this.queue.length });
      item.resolve(result);
    }).catch(err => {
      logger.error('[RequestQueue] Request failed', { error: err.message, queueLength: this.queue.length });
      item.reject(err);
    });

    setTimeout(() => this._processNext(), this.interval);
  }
}

module.exports = RequestQueue;
