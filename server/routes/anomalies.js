/**
 * /api/ai/anomalies — Fraud / anomaly detection route
 *
 * GET  /api/ai/anomalies       — run detection (or return cached result)
 * POST /api/ai/anomalies/check — trigger an immediate check (called after job/expense save)
 *
 * The heavy lifting happens in the Python Flask service on port 5001.
 * If the ML service is unreachable we return the last cached result — never a 500.
 */
const router = require('express').Router();
const axios = require('axios');
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const ML_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:5001';
const ML_TIMEOUT = 15_000; // 15 s

// ── In-memory cache so the UI always gets data even if ML is down ────────────
let cachedAnomalies = { anomalies: [], checkedAt: null };

// ── Gather today's data from MySQL for the ML service ────────────────────────
async function gatherData() {
    const today = new Date().toISOString().slice(0, 10);

    let jobs;
    try {
        [jobs] = await pool.query(
            `SELECT id, customer_id, branch_id, job_name, quantity, unit_price,
                    total_amount, advance_paid, balance_amount, payment_status,
                    discount_percent, created_at, created_by
             FROM sarga_jobs
             WHERE DATE(created_at) = ?`, [today]
        );
    } catch (err) {
        // Some deployments may not yet have sarga_jobs.discount_percent.
        if (err && err.code === 'ER_BAD_FIELD_ERROR') {
            [jobs] = await pool.query(
                `SELECT id, customer_id, branch_id, job_name, quantity, unit_price,
                        total_amount, advance_paid, balance_amount, payment_status,
                        0 AS discount_percent, created_at, NULL AS created_by
                 FROM sarga_jobs
                 WHERE DATE(created_at) = ?`, [today]
            );
        } else {
            throw err;
        }
    }

    let expenses;
    try {
        [expenses] = await pool.query(
            `SELECT id, branch_id, category, amount, description, date, created_at
             FROM sarga_payments
             WHERE DATE(date) = ? OR DATE(created_at) = ?`, [today, today]
        );
    } catch (err) {
        if (err && err.code === 'ER_BAD_FIELD_ERROR') {
            [expenses] = await pool.query(
                `SELECT id, branch_id, type AS category, amount, description,
                        payment_date AS date, payment_date AS created_at
                 FROM sarga_payments
                 WHERE DATE(payment_date) = ?`, [today]
            );
        } else {
            throw err;
        }
    }

    let transactions;
    try {
        [transactions] = await pool.query(
            `SELECT cp.id, cp.customer_id, cp.job_id, cp.total_amount AS amount,
                    cp.payment_method, cp.branch_id, cp.payment_date, cp.created_at,
                    cp.cash_amount, cp.upi_amount
             FROM sarga_customer_payments cp
             WHERE DATE(cp.payment_date) = ? OR DATE(cp.created_at) = ?`, [today, today]
        );
    } catch (err) {
        if (err && err.code === 'ER_BAD_FIELD_ERROR') {
            [transactions] = await pool.query(
                `SELECT cp.id, cp.customer_id, NULL AS job_id, cp.total_amount AS amount,
                        cp.payment_method, cp.branch_id, cp.payment_date, cp.created_at,
                        cp.cash_amount, cp.upi_amount
                 FROM sarga_customer_payments cp
                 WHERE DATE(cp.payment_date) = ? OR DATE(cp.created_at) = ?`, [today, today]
            );
        } else {
            throw err;
        }
    }

    let attendance;
    try {
        [attendance] = await pool.query(
            `SELECT staff_id, branch_id, status, date
             FROM sarga_attendance
             WHERE date = ?`, [today]
        );
    } catch (err) {
        if (err && (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_FIELD_ERROR')) {
            [attendance] = await pool.query(
                `SELECT a.staff_id, COALESCE(s.branch_id, 0) AS branch_id,
                        a.status, a.attendance_date AS date
                 FROM sarga_staff_attendance a
                 LEFT JOIN sarga_staff s ON s.id = a.staff_id
                 WHERE a.attendance_date = ?`, [today]
            );
        } else {
            throw err;
        }
    }

    // Also pull salary payments for duplicate-salary check
    let salaryPayments;
    try {
        [salaryPayments] = await pool.query(
            `SELECT id, staff_id, branch_id, net_salary AS amount, month_year,
                    payment_date AS date, created_at
             FROM sarga_salary_payments
             WHERE YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE())`
        );
    } catch (err) {
        if (err && (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_FIELD_ERROR')) {
            salaryPayments = [];
        } else {
            throw err;
        }
    }

    // Merge salary payments into transactions for the duplicate check
    const allTransactions = [
        ...transactions.map(t => ({ ...t, type: 'payment' })),
        ...salaryPayments.map(s => ({ ...s, type: 'salary', category: 'salary' })),
    ];

    return {
        jobs: jobs.map(r => ({ ...r })),
        expenses: expenses.map(r => ({ ...r })),
        transactions: allTransactions,
        attendance: attendance.map(r => ({ ...r })),
    };
}

// ── Call the Python ML service ───────────────────────────────────────────────
async function callMLService(payload) {
    const res = await axios.post(`${ML_URL}/detect-anomalies`, payload, {
        timeout: ML_TIMEOUT,
        headers: { 'Content-Type': 'application/json' },
    });
    return res.data;
}

// ── Public function so cron / triggers can call it ───────────────────────────
async function checkAnomalies() {
    try {
        const payload = await gatherData();
        const result = await callMLService(payload);
        cachedAnomalies = {
            anomalies: result.anomalies || [],
            checkedAt: new Date().toISOString(),
        };
        console.log(`[AnomalyCheck] ${cachedAnomalies.anomalies.length} anomalies detected`);
    } catch (err) {
        console.error('[AnomalyCheck] ML service error (returning cached):', err.message);
        // Keep stale cache — do NOT overwrite with empty
    }
    return cachedAnomalies;
}

// ── GET /api/ai/anomalies ────────────────────────────────────────────────────
router.get('/anomalies', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        // If we've never checked or cache is older than 20 min, refresh now
        const staleMs = 20 * 60 * 1000;
        if (!cachedAnomalies.checkedAt || (Date.now() - new Date(cachedAnomalies.checkedAt).getTime()) > staleMs) {
            await checkAnomalies();
        }
        res.json(cachedAnomalies);
    } catch (err) {
        console.error('[GET /ai/anomalies]', err.message);
        res.json(cachedAnomalies); // fallback — never 500
    }
});

// ── POST /api/ai/anomalies/check — immediate trigger ────────────────────────
router.post('/anomalies/check', authenticateToken, async (req, res) => {
    try {
        const result = await checkAnomalies();
        res.json(result);
    } catch (err) {
        console.error('[POST /ai/anomalies/check]', err.message);
        res.json(cachedAnomalies);
    }
});

module.exports = router;
module.exports.checkAnomalies = checkAnomalies;
