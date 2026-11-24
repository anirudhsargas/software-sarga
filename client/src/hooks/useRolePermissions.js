import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';

// Shared, module-level store so every consumer (sidebar, route guards, admin page)
// sees the same data and only one request is in flight at a time.
let state = { overrides: {}, loaded: false };
let inflight = null;
const listeners = new Set();

const emit = () => listeners.forEach((fn) => fn(state));

export async function refreshRolePermissions() {
    if (inflight) return inflight;
    inflight = api.get('/role-permissions')
        .then((res) => {
            state = { overrides: res.data?.overrides || {}, loaded: true };
            emit();
            return state;
        })
        .catch(() => {
            // On failure keep the last known map (defaults = everything allowed by code).
            state = { ...state, loaded: true };
            emit();
            return state;
        })
        .finally(() => { inflight = null; });
    return inflight;
}

export function setRolePermissionsLocal(overrides) {
    state = { overrides: overrides || {}, loaded: true };
    emit();
}

export default function useRolePermissions() {
    const [snapshot, setSnapshot] = useState(state);

    useEffect(() => {
        listeners.add(setSnapshot);
        if (!state.loaded) refreshRolePermissions();
        // Pick up changes an Admin made while this tab was in the background.
        const onFocus = () => refreshRolePermissions();
        window.addEventListener('focus', onFocus);
        return () => {
            listeners.delete(setSnapshot);
            window.removeEventListener('focus', onFocus);
        };
    }, []);

    const refresh = useCallback(() => refreshRolePermissions(), []);
    return { overrides: snapshot.overrides, loaded: snapshot.loaded, refresh };
}
