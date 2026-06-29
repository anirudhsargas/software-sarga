const { Server } = require('socket.io');
const logger = require('../helpers/logger');

let io = null;

function initSocket(server, app) {
    const allowedOrigins = [
        'http://localhost:5173',
        'http://localhost:3000',
        'https://software-sarga.vercel.app',
        'https://software-sarga-2.onrender.com',
    ];

    io = new Server(server, {
        cors: {
            origin: (origin, callback) => {
                if (!origin || allowedOrigins.some(o => origin.startsWith(o))) {
                    callback(null, true);
                } else {
                    callback(new Error('Origin not allowed'));
                }
            },
            credentials: true,
        },
        pingTimeout: 60000,
        pingInterval: 25000,
    });

    io.on('connection', (socket) => {
        logger.info(`[Socket] Client connected: ${socket.id}`);

        socket.on('join-branch', (branchId) => {
            if (branchId) {
                socket.join(`branch:${branchId}`);
                logger.debug(`[Socket] ${socket.id} joined branch:${branchId}`);
            }
        });

        socket.on('leave-branch', (branchId) => {
            if (branchId) {
                socket.leave(`branch:${branchId}`);
            }
        });

        socket.on('disconnect', (reason) => {
            logger.info(`[Socket] Client disconnected: ${socket.id} (${reason})`);
        });
    });

    logger.info('[Socket] Socket.io initialized');
    return io;
}

function getIO() {
    if (!io) {
        throw new Error('Socket.io not initialized. Call initSocket() first.');
    }
    return io;
}

function emitProductEvent(event, data) {
    try {
        if (io) {
            io.emit(event, data);
        }
    } catch (err) {
        logger.error(`[Socket] Error emitting ${event}:`, err.message);
    }
}

module.exports = { initSocket, getIO, emitProductEvent };
