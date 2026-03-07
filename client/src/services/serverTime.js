/**
 * Server Time Service
 * Fetches the real date/time from the server so staff cannot
 * manipulate it by changing their device clock.
 * 
 * Usage:
 *   import { initServerTime, serverNow, serverToday, serverThisMonth } from '../services/serverTime';
 *   await initServerTime();          // call once on app load
 *   const now   = serverNow();       // Date object using server offset
 *   const date  = serverToday();     // "YYYY-MM-DD"
 *   const month = serverThisMonth(); // "YYYY-MM"
 */
import api from './api';

let offsetMs = 0;      // server_time - client_time (milliseconds)
let initialized = false;

/**
 * Call once on app bootstrap (e.g. after login).
 * Calculates the offset between server clock and client clock.
 */
export async function initServerTime() {
    try {
        const before = Date.now();
        const res = await api.get('/server-time');
        const after = Date.now();
        const roundTrip = after - before;
        const serverTs = res.data.timestamp;
        // Estimate server time at midpoint of request
        offsetMs = serverTs - (before + roundTrip / 2);
        initialized = true;
    } catch (err) {
        console.warn('Failed to sync server time, falling back to device clock:', err.message);
        offsetMs = 0;
        initialized = true;
    }
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
