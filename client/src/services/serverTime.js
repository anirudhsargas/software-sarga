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

let offsetMs = 0;      // server_time - client_time (milliseconds)
let initialized = false;
let isChecking = false;
let isHealthy = true;

/**
 * Check if the server is reachable using the health endpoint.
 * Uses fetch() instead of Axios to avoid CORS preflight (no credentials).
 * Returns true if healthy, false otherwise.
 */
export async function checkHealth() {
    try {
        const url = API_URL.startsWith('http')
            ? `${API_URL.replace(/\/?$/, '/')}health`
            : 'https://software-sarga-2.onrender.com/api/health';
        const res = await fetch(url);
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
 * Call once on app bootstrap (e.g. after login).
 * Calculates the offset between server clock and client clock.
 * First verifies server health, then syncs time.
 */
export async function initServerTime() {
    if (isChecking) return;
    isChecking = true;
    try {
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
