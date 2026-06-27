const axios = require('axios');
const logger = require('./logger');

// Dedicated axios instance for ML service calls only.
// The interceptor is registered here — NOT on the global axios instance —
// so that non-ML routes (e.g. Google OAuth calls) are never affected.
const mlAxios = axios.create();

mlAxios.interceptors.request.use(
    (config) => {
        const mlUrl = process.env.ML_SERVICE_URL || 'http://127.0.0.1:5001';
        if (config.url && config.url.startsWith(mlUrl)) {
            if (process.env.ENABLE_ML !== 'true') {
                logger.debug('[AI_DISABLED] ML skipped — ENABLE_ML is not true');
                throw new Error('ML Service is disabled (ENABLE_ML is not true)');
            }
            const isLocal = mlUrl.includes('127.0.0.1') || mlUrl.includes('localhost');
            const isNotConfigured = !process.env.ML_SERVICE_URL || process.env.ML_SERVICE_URL === 'none';
            if (process.env.NODE_ENV === 'production' && (isLocal || isNotConfigured)) {
                throw new Error('ML Service not configured in production (skipping call)');
            }
        }
        return config;
    },
    (error) => Promise.reject(error)
);

module.exports = mlAxios;
