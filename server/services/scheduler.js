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
    const scheduleStartedAt = process.hrtime.bigint();
    logger.info(`[Scheduler] ${name} registration started`);
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
        logger.info(`[Scheduler] ${name} registration completed in ${(Number(process.hrtime.bigint() - scheduleStartedAt) / 1e6).toFixed(1)}ms`);

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
    const startedAt = process.hrtime.bigint();
    const tasks = [];

    // Bill email parser — daily at 9:00 AM
    try {
        const stepStartedAt = process.hrtime.bigint();
        logger.info('[Scheduler] Loading Bill Email Parser task module');
        const { scheduleDaily, runNow: _runNow } = require('./billScheduler');
        logger.info(`[Scheduler] Bill Email Parser module loaded in ${(Number(process.hrtime.bigint() - stepStartedAt) / 1e6).toFixed(1)}ms`);
        const scheduleStartedAt = process.hrtime.bigint();
        scheduleDaily();
        logger.info(`[Scheduler] Bill Email Parser scheduleDaily completed in ${(Number(process.hrtime.bigint() - scheduleStartedAt) / 1e6).toFixed(1)}ms`);
        tasks.push('Bill Email Parser');
        logSchedule('Bill Email Parser', '0 9 * * *', 'scheduled');
    } catch (e) {
        logSchedule('Bill Email Parser', '0 9 * * *', 'error', e);
    }

    // Daily Book Automation (dynamic schedule)
    try {
        setTimeout(() => initializeDailyBookCron(), 10_000);
        tasks.push('Daily Book Automation');
        logSchedule('Daily Book Automation', 'dynamic', 'scheduled');
    } catch (e) {
        logSchedule('Daily Book Automation', 'dynamic', 'error', e);
    }



    // Summary
    logger.info(`[Scheduler] Initialized with ${tasks.length} tasks: ${tasks.join(', ')}`);
    logger.info(`[Scheduler] initializeScheduler completed in ${(Number(process.hrtime.bigint() - startedAt) / 1e6).toFixed(1)}ms`);
    return { tasks, registeredJobs };
}

function initializeDailyBookCron() {
    const stepStartedAt = process.hrtime.bigint();
    logger.info('[Scheduler] Loading Daily Book Automation task module');
    try {
        const { initializeDailyBookCron: initializeDailyBookCronImpl } = require('./dailyBookScheduler');
        logger.info(`[Scheduler] Daily Book Automation module loaded in ${(Number(process.hrtime.bigint() - stepStartedAt) / 1e6).toFixed(1)}ms`);
        initializeDailyBookCronImpl();
    } catch (error) {
        logger.error(`[Scheduler] Daily Book Automation deferred init failed: ${error.message}`);
    }
}

function getSchedulerStatus() {
    return {
        healthy: registeredJobs.filter(j => j.status === 'error').length === 0,
        total: registeredJobs.length,
        jobs: registeredJobs,
    };
}

module.exports = { initializeScheduler, getSchedulerStatus, safeSchedule };
