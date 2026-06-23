const cron = require('node-cron');
const logger = require('../helpers/logger');

const registeredJobs = [];

function logSchedule(name, expression, status, error) {
    const entry = { name, expression, status, timestamp: new Date().toISOString() };
    if (error) entry.error = error.message || String(error);
    registeredJobs.push(entry);
    if (status === 'scheduled') {
        logger.info(`[Scheduler] ${name} scheduled (${expression})`);
    } else if (status === 'error') {
        logger.error(`[Scheduler] ${name} failed: ${entry.error}`);
    } else if (status === 'startup') {
        logger.info(`[Scheduler] ${name} startup triggered`);
    }
}

function safeSchedule(name, expression, task, options = {}) {
    const { timezone, runOnStart, startDelay } = options;
    try {
        const job = cron.schedule(expression, async () => {
            const start = Date.now();
            logger.info(`[Scheduler] Running ${name}…`);
            try {
                const result = await task();
                const elapsed = Date.now() - start;
                logger.info(`[Scheduler] ${name} completed in ${elapsed}ms`);
                return result;
            } catch (err) {
                logger.error(`[Scheduler] ${name} failed after ${Date.now() - start}ms: ${err.message}`);
                if (options.onError) options.onError(err);
            }
        }, { scheduled: true, timezone });

        logSchedule(name, expression, 'scheduled');

        if (runOnStart) {
            const delay = startDelay || 10_000;
            setTimeout(() => {
                logger.info(`[Scheduler] ${name} running on startup (delay: ${delay}ms)`);
                task().catch(err => logger.error(`[Scheduler] ${name} startup failed: ${err.message}`));
                logSchedule(name, expression, 'startup');
            }, delay);
        }

        return job;
    } catch (err) {
        logSchedule(name, expression, 'error', err);
        return null;
    }
}

function initializeScheduler() {
    const tasks = [];

    // Anomaly detection — every 15 minutes
    try {
        const { checkAnomalies } = require('../routes/anomalies');
        safeSchedule('Anomaly Detection', '*/15 * * * *', () => checkAnomalies(), {
            runOnStart: true,
            startDelay: 10_000,
            onError: () => {
                setTimeout(() => {
                    logger.info('[Scheduler] Retrying anomaly detection…');
                    checkAnomalies().catch(() => {});
                }, 60_000);
            }
        });
        tasks.push('Anomaly Detection');
    } catch (e) {
        logSchedule('Anomaly Detection', '*/15 * * * *', 'error', e);
    }

    // Business insights — daily at 7:00 AM
    try {
        const { generateInsights } = require('../routes/insights');
        safeSchedule('Business Insights', '0 7 * * *', () => generateInsights());
        tasks.push('Business Insights');
    } catch (e) {
        logSchedule('Business Insights', '0 7 * * *', 'error', e);
    }

    // Seasonal analysis — 1st of month at 6:00 AM
    try {
        const { computeSeasonal } = require('../routes/seasonal');
        safeSchedule('Seasonal Analysis', '0 6 1 * *', () => computeSeasonal());
        tasks.push('Seasonal Analysis');
    } catch (e) {
        logSchedule('Seasonal Analysis', '0 6 1 * *', 'error', e);
    }

    // Bill email parser — daily at 9:00 AM
    try {
        const { scheduleDaily, runNow: _runNow } = require('./billScheduler');
        scheduleDaily();
        tasks.push('Bill Email Parser');
        logSchedule('Bill Email Parser', '0 9 * * *', 'scheduled');
    } catch (e) {
        logSchedule('Bill Email Parser', '0 9 * * *', 'error', e);
    }

    // Daily Book Automation (dynamic schedule)
    try {
        const { initializeDailyBookCron } = require('./dailyBookScheduler');
        setTimeout(() => initializeDailyBookCron(), 10_000);
        tasks.push('Daily Book Automation');
        logSchedule('Daily Book Automation', 'dynamic', 'scheduled');
    } catch (e) {
        logSchedule('Daily Book Automation', 'dynamic', 'error', e);
    }

    // Summary
    logger.info(`[Scheduler] Initialized with ${tasks.length} tasks: ${tasks.join(', ')}`);
    return { tasks, registeredJobs };
}

function getSchedulerStatus() {
    return {
        healthy: registeredJobs.filter(j => j.status === 'error').length === 0,
        total: registeredJobs.length,
        jobs: registeredJobs,
    };
}

module.exports = { initializeScheduler, getSchedulerStatus, safeSchedule };
