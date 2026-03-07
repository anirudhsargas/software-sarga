import { useEffect, useRef, useCallback } from 'react';

/**
 * usePolling — Sets up an interval that pauses when the tab is hidden.
 * Prevents wasteful API calls when user isn't looking at the page.
 *
 * @param {Function} callback - Async function to call on each tick
 * @param {number} intervalMs - Interval in milliseconds (default 30000)
 * @param {boolean} [enabled=true] - Whether polling is active
 */
const usePolling = (callback, intervalMs = 30000, enabled = true) => {
    const savedCallback = useRef(callback);
    const intervalRef = useRef(null);

    // Keep ref current without re-triggering effect
    useEffect(() => {
        savedCallback.current = callback;
    }, [callback]);

    const start = useCallback(() => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => {
            if (document.visibilityState === 'visible') {
                savedCallback.current();
            }
        }, intervalMs);
    }, [intervalMs]);

    const stop = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (!enabled) {
            stop();
            return;
        }

        start();

        // Also refresh when tab becomes visible again after being hidden
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                savedCallback.current();
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            stop();
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [enabled, start, stop]);

    return { start, stop };
};

export default usePolling;
