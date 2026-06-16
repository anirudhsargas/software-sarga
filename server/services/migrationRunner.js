/**
 * migrationRunner — tracks applied migrations in schema_version table.
 *
 * Additive, non-breaking. Existing initDb() continues to work.
 * Future schema changes should go in server/migrations/ and be run via this runner.
 */

const { pool } = require('../database');
const fs = require('fs');
const path = require('path');
const logger = require('../helpers/logger');

const SCHEMA_TABLE = 'schema_version';
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

/**
 * Ensure the schema_version tracking table exists.
 */
async function ensureSchemaTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS ${SCHEMA_TABLE} (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            hash VARCHAR(64) NOT NULL,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            duration_ms INT DEFAULT 0,
            status ENUM('applied', 'failed', 'rolled_back') DEFAULT 'applied'
        )
    `);
}

/**
 * Compute a hash of a migration file for integrity checking.
 */
function computeHash(filePath) {
    const crypto = require('crypto');
    const content = fs.readFileSync(filePath, 'utf8');
    return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Get list of already-applied migrations.
 */
async function getAppliedMigrations() {
    const [rows] = await pool.query(`SELECT name, hash FROM ${SCHEMA_TABLE} WHERE status = 'applied'`);
    return new Set(rows.map(r => r.name));
}

/**
 * Run a single migration file within a transaction.
 */
async function runMigration(filePath, dryRun = false) {
    const name = path.basename(filePath);
    const hash = computeHash(filePath);
    const sql = fs.readFileSync(filePath, 'utf8');
    const statements = sql.split(';').filter(s => s.trim() && !s.trim().startsWith('--'));

    if (dryRun) {
        logger.info(`[Migration] DRY-RUN: Would apply "${name}" (${statements.length} statements)`);
        return { name, hash, statements: statements.length, dryRun: true };
    }

    const start = Date.now();
    try {
        await pool.query('START TRANSACTION');
        for (const stmt of statements) {
            await pool.query(stmt);
        }
        await pool.query(
            `INSERT INTO ${SCHEMA_TABLE} (name, hash, duration_ms, status) VALUES (?, ?, ?, 'applied')`,
            [name, hash, Date.now() - start]
        );
        await pool.query('COMMIT');
        logger.info(`[Migration] Applied "${name}" in ${Date.now() - start}ms`);
        return { name, hash, statements: statements.length, duration: Date.now() - start };
    } catch (err) {
        await pool.query('ROLLBACK');
        // Record the failure
        try {
            await pool.query(
                `INSERT INTO ${SCHEMA_TABLE} (name, hash, duration_ms, status) VALUES (?, ?, ?, 'failed')`,
                [name, hash, Date.now() - start]
            );
        } catch (_) { /* ignore */ }
        logger.error(`[Migration] Failed "${name}": ${err.message}`);
        throw err;
    }
}

/**
 * Run all pending migrations from the migrations directory.
 * Safe to call on every startup — only runs new/unapplied migrations.
 */
async function runPendingMigrations({ dryRun = false } = {}) {
    if (!fs.existsSync(MIGRATIONS_DIR)) {
        logger.info('[Migration] No migrations directory found');
        return [];
    }

    await ensureSchemaTable();
    const applied = await getAppliedMigrations();
    const files = fs.readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.sql'))
        .sort();

    const results = [];
    for (const file of files) {
        if (applied.has(file)) {
            logger.debug(`[Migration] Already applied: ${file}`);
            continue;
        }
        const filePath = path.join(MIGRATIONS_DIR, file);
        try {
            const result = await runMigration(filePath, dryRun);
            results.push(result);
        } catch (err) {
            results.push({ name: file, error: err.message });
            // Don't stop — try remaining migrations
            logger.warn(`[Migration] Continuing despite failure: ${file}`);
        }
    }

    if (results.length > 0) {
        logger.info(`[Migration] Processed ${results.length} migration(s): ${results.map(r => r.name).join(', ')}`);
    } else {
        logger.info('[Migration] No pending migrations');
    }

    return results;
}

/**
 * Get status of all migrations (applied + pending).
 */
async function getMigrationStatus() {
    await ensureSchemaTable();
    if (!fs.existsSync(MIGRATIONS_DIR)) return { migrations: [] };

    const [rows] = await pool.query(`SELECT * FROM ${SCHEMA_TABLE} ORDER BY applied_at DESC`);
    const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();

    return {
        applied: rows,
        pending: files.filter(f => !rows.some(r => r.name === f && r.status === 'applied')),
        total: files.length,
    };
}

module.exports = { runPendingMigrations, getMigrationStatus, ensureSchemaTable };
