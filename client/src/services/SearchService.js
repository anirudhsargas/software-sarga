/**
 * SearchService — Centralized search utilities for SmartSearch.
 *
 * Handles API calls with AbortController support, and
 * persists recent searches in localStorage.
 */

import api from './api';

const RECENT_KEY = 'sarga_recent_searches';
const MAX_RECENT = 5;

/**
 * Perform a search request. Accepts an optional AbortSignal for cancellation.
 * Resolves with { customers, jobs, products } or empty arrays. Re-throws AbortError for cancellation detection.
 *
 * @param {string} query
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ customers: any[], jobs: any[], products: any[] }>}
 */
export async function search(query, signal) {
    if (!query?.trim() || query.trim().length < 2) {
        return { customers: [], jobs: [], products: [] };
    }

    try {
        const res = await api.get('/search', {
            params: { q: query.trim() },
            signal,
        });

        const data = res.data || {};
        return {
            customers: Array.isArray(data.customers) ? data.customers : [],
            jobs: Array.isArray(data.jobs) ? data.jobs : [],
            products: Array.isArray(data.products) ? data.products : [],
        };
    } catch (err) {
        // Swallow abort errors silently
        if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') {
            throw err; // Re-throw so caller can detect cancellation
        }
        console.warn('[SearchService] search error:', err?.message);
        return { customers: [], jobs: [], products: [] };
    }
}

/**
 * Get the list of recent searches from localStorage.
 * @returns {string[]}
 */
export function getRecentSearches() {
    try {
        const raw = localStorage.getItem(RECENT_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/**
 * Save a query to the recent searches list (deduped, max MAX_RECENT items).
 * @param {string} query
 */
export function addRecentSearch(query) {
    if (!query?.trim() || query.trim().length < 2) return;
    const q = query.trim();
    try {
        const existing = getRecentSearches().filter(r => r !== q);
        const next = [q, ...existing].slice(0, MAX_RECENT);
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
        // localStorage may be blocked in private mode — ignore
    }
}

/**
 * Remove a single entry from recent searches.
 * @param {string} query
 */
export function removeRecentSearch(query) {
    try {
        const next = getRecentSearches().filter(r => r !== query);
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {}
}

/**
 * Clear all recent searches.
 */
export function clearRecentSearches() {
    try {
        localStorage.removeItem(RECENT_KEY);
    } catch {}
}
