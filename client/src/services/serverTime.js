/**
 * Server Time Service
 * Fetches the real date/time from the server so staff cannot
 * manipulate it by changing their device clock.
 * 
 * Usage:
 *   import { initServerTime, serverNow, serverToday, serverThisMonth, checkHealth } from '../services/serverTime';
 *   await initServerTime();          // call once on app load
 *   const now   = serverNow();       // Date object using server offset
 *   const date  = serverToday();     // "YYYY-MM-DD"
 *   const month = serverThisMonth(); // "YYYY-MM"
 *   await checkHealth();             // returns true if server is reachable
 */
import api from './api';
import { API_URL } from './api';
import auth from './auth';

let offsetMs = 0;      // server_time - client_time (milliseconds)
let initialized = false;
let isChecking = false;
let isHealthy = true;

/**
 * Check if the server is reachable using the health endpoint.
 * Uses fetch() instead of Axios to avoid CORS preflight (no credentials).
 * Times out after `timeoutMs` (default 8000ms) via AbortController.
 * Returns true if healthy, false otherwise.
 */
export async function checkHealth(timeoutMs = 8000) {
    try {
        const url = API_URL.startsWith('http')
            ? `${API_URL.replace(/\/?$/, '/')}health`
            : 'https://software-sarga-2.onrender.com/api/health';
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        const healthy = res.status === 200;
        isHealthy = healthy;
        return healthy;
    } catch (err) {
        console.warn('Health check failed:', err.message);
        isHealthy = false;
        return false;
    }
}

/**
 * Wait for the server to become healthy by retrying checkHealth().
 * Resolves as soon as the server responds, rejects after max attempts.
 * Calls `onRetry(delayMs, attempt)` between each attempt so the caller
 * can update the UI.
 */
export async function waitForServer({
    maxAttempts = 20,
    initialDelayMs = 3000,
    onRetry = () => {}
} = {}) {
    let delay = initialDelayMs;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const healthy = await checkHealth(8000);
        if (healthy) return true;
        if (attempt < maxAttempts) {
            onRetry(delay, attempt);
            await new Promise(r => setTimeout(r, delay));
            delay = Math.min(delay * 1.3, 10000);
        }
    }
    return false;
}

/**
 * Call once on app bootstrap (e.g. after login).
 * Calculates the offset between server clock and client clock.
 * First verifies server health, then syncs time.
 */
export async function initServerTime() {
    if (isChecking) return;
    isChecking = true;
    try {
        // Skip if not authenticated — server-time requires auth
        if (!auth.isAuthenticated()) {
            console.warn('No valid auth token, skipping server time sync');
            offsetMs = 0;
            initialized = true;
            return;
        }

        // First check if server is healthy
        const healthy = await checkHealth();
        if (!healthy) {
            console.warn('Server unhealthy, skipping time sync');
            offsetMs = 0;
            initialized = true;
            return;
        }

        const before = Date.now();
        const res = await api.get('/server-time');
        if (res.status !== 200) {
            console.warn('Server time returned', res.status, 'falling back to device clock');
            offsetMs = 0;
            initialized = true;
            return;
        }
        const after = Date.now();
        const roundTrip = after - before;
        const serverTs = res.data.timestamp;
        // Estimate server time at midpoint of request
        offsetMs = serverTs - (before + roundTrip / 2);
        initialized = true;
    } catch (err) {
        if (err.response?.status === 429) {
            console.warn('Server time rate limited, falling back to device clock');
        } else if (err.response?.status >= 500) {
            console.warn('Server time failed with server error:', err.response.status);
        } else {
            console.warn('Failed to sync server time, falling back to device clock:', err.message);
        }
        offsetMs = 0;
        initialized = true;
    } finally {
        isChecking = false;
    }
}

/**
 * Get current health status
 */
export function isServerHealthy() {
    return isHealthy;
}

/** Returns a Date object adjusted to server time */
export function serverNow() {
    return new Date(Date.now() + offsetMs);
}

/** Returns server date as "YYYY-MM-DD" */
export function serverToday() {
    const d = serverNow();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Returns server month as "YYYY-MM" */
export function serverThisMonth() {
    const d = serverNow();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** Returns ISO datetime string for form defaults "YYYY-MM-DDTHH:MM" */
export function serverDateTimeLocal() {
    const d = serverNow();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Whether server time has been initialized */
export function isServerTimeReady() {
    return initialized;
}
