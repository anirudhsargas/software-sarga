/**
 * ML Service helper — wraps axios calls to the Python Flask microservice.
 *
 * Usage:
 *   const { callMLService } = require('../config/ml');
 *   const result = await callMLService('/predict-sales', { branch: 'all', horizon: 30 });
 *   if (result.fallback) { /* ML service unreachable, handle gracefully * / }
 */
const axios = require('axios');

const ML_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:5001';
const ML_TIMEOUT = 10_000; // 10 seconds

/**
 * POST to the ML service.  Returns the response data on success,
 * or { fallback: true, data: null } if the service is unreachable.
 */
async function callMLService(endpoint, payload = {}) {
    try {
        const { data } = await axios.post(`${ML_URL}${endpoint}`, payload, {
            timeout: ML_TIMEOUT,
            headers: { 'Content-Type': 'application/json' },
        });
        return data;
    } catch (err) {
        const status = err.response?.status;
        // Log but never throw — caller always gets an object back
        console.error(
            `[ML] ${endpoint} failed (${status || err.code || 'UNKNOWN'}): ${err.message}`
        );
        return { fallback: true, data: null };
    }
}

module.exports = { callMLService, ML_URL, ML_TIMEOUT };
