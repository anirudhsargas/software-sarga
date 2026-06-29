import { io } from 'socket.io-client';
import auth from './auth';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

let socket = null;
let listeners = {};

export function connectSocket() {
    if (socket?.connected) return socket;

    const token = auth.getToken();
    if (!token) return null;

    socket = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
    });

    socket.on('connect', () => {
        console.debug('[Socket] Connected:', socket.id);
    });

    socket.on('disconnect', (reason) => {
        console.debug('[Socket] Disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
        console.debug('[Socket] Connection error:', err.message);
    });

    // Re-register any existing listeners after reconnection
    socket.on('connect', () => {
        Object.entries(listeners).forEach(([event, fns]) => {
            fns.forEach(fn => socket.on(event, fn));
        });
    });

    return socket;
}

export function disconnectSocket() {
    if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
        socket = null;
        listeners = {};
    }
}

export function onSocketEvent(event, callback) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(callback);
    if (socket) {
        socket.on(event, callback);
    }
    return () => {
        if (socket) socket.off(event, callback);
        if (listeners[event]) {
            listeners[event] = listeners[event].filter(fn => fn !== callback);
        }
    };
}

export function getSocket() {
    return socket;
}
