const { createClient } = require('redis');
const logger = require('../helpers/logger');

let client = null;
let isConnected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 50; // eslint-disable-line no-unused-vars
const RECONNECT_BASE_DELAY = 1000;

function getRedisConfig() {
    if (process.env.REDIS_URL) {
        return { url: process.env.REDIS_URL };
    }
    return {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
        password: process.env.REDIS_PASSWORD || undefined,
    };
}

async function connectRedis() {
    if (client && isConnected) return client;
    if (client) return client;

    const config = getRedisConfig();
    client = createClient(config);

    client.on('connect', () => {
        logger.info('[Redis] Connecting...');
    });

    client.on('ready', () => {
        isConnected = true;
        reconnectAttempts = 0;
        logger.info('[Redis] Connected');
    });

    client.on('end', () => {
        isConnected = false;
        logger.warn('[Redis] Connection closed');
    });

    client.on('error', (err) => {
        isConnected = false;
        logger.error(`[Redis] Error: ${err.message}`);
    });

    client.on('reconnecting', () => {
        reconnectAttempts++;
        const delay = Math.min(RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts - 1), 30000);
        logger.warn(`[Redis] Reconnecting (attempt ${reconnectAttempts}, delay ${delay}ms)`);
    });

    try {
        await client.connect();
        return client;
    } catch (err) {
        logger.error(`[Redis] Failed to connect: ${err.message}`);
        client = null;
        isConnected = false;
        return null;
    }
}

function getRedisClient() {
    return client;
}

function isRedisConnected() {
    return isConnected && client?.isReady;
}

async function disconnectRedis() {
    if (client) {
        try {
            await client.quit();
        } catch {
            try { await client.disconnect(); } catch (_ignored) { /* ignored */ }
        }
        client = null;
        isConnected = false;
        logger.info('[Redis] Disconnected gracefully');
    }
}

async function redisHealthCheck() {
    if (!isRedisConnected()) {
        return { status: 'disconnected', latency: null };
    }
    const start = Date.now();
    try {
        await client.ping();
        const latency = Date.now() - start;
        return { status: 'connected', latency: `${latency} ms` };
    } catch (err) {
        return { status: 'error', latency: null, error: err.message };
    }
}

module.exports = {
    connectRedis,
    getRedisClient,
    isRedisConnected,
    disconnectRedis,
    redisHealthCheck,
};
