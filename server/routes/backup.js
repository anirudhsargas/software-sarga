const router = require('express').Router();
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { auditLog, asyncHandler } = require('../helpers');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Validates that a string is safe to pass as a mysqldump/mysql CLI argument.
 * Only alphanumeric characters, underscores, and hyphens are permitted.
 * Prevents flag injection via crafted DB_USER or DB_NAME values.
 */
function assertSafeDbArg(value, name) {
    if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) {
        throw new Error(`Unsafe or missing environment variable ${name}: "${value}"`);
    }
}

const BACKUP_DIR = path.join(__dirname, '../backups');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// List available backups
router.get('/backups', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
    if (!fs.existsSync(BACKUP_DIR)) {
        return res.json([]);
    }
    const files = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.endsWith('.sql'))
        .map(f => {
            const stats = fs.statSync(path.join(BACKUP_DIR, f));
            return {
                filename: f,
                size: stats.size,
                sizeFormatted: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
                created: stats.mtime
            };
        })
        .sort((a, b) => new Date(b.created) - new Date(a.created));
    res.json(files);
}));

// Create a new backup
router.post('/backups', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
    const DB_NAME = process.env.DB_NAME || 'sarga_db';
    const DB_USER = process.env.DB_USER || 'root';
    const DB_PASS = process.env.DB_PASS || '';
    const DATE = new Date().toISOString().replace(/[:T]/g, '-').split('.')[0];
    const BACKUP_FILE = path.join(BACKUP_DIR, `backup-${DATE}.sql`);

    const env = { ...process.env };
    if (DB_PASS) env.MYSQL_PWD = DB_PASS;

    assertSafeDbArg(DB_USER, 'DB_USER');
    assertSafeDbArg(DB_NAME, 'DB_NAME');

    const child = spawn('mysqldump', ['-u', DB_USER, DB_NAME], { env });
    const writeStream = fs.createWriteStream(BACKUP_FILE);
    child.stdout.pipe(writeStream);

    child.on('error', (error) => {
        console.error('Backup failed:', error);
        return res.status(500).json({ message: 'Backup failed' });
    });

    child.on('close', (code) => {
        if (code !== 0) {
            console.error('Backup failed with exit code:', code);
            return res.status(500).json({ message: 'Backup failed' });
        }
        const stats = fs.statSync(BACKUP_FILE);
        auditLog(req.user.id, 'BACKUP_CREATE', `Created backup: backup-${DATE}.sql (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`);
        res.json({
            message: 'Backup created successfully',
            filename: `backup-${DATE}.sql`,
            size: stats.size,
            sizeFormatted: (stats.size / (1024 * 1024)).toFixed(2) + ' MB'
        });
    });
}));

// Restore from a backup
router.post('/backups/restore', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
    const { filename } = req.body;
    if (!filename) return res.status(400).json({ message: 'filename is required' });

    // Sanitize filename to prevent path traversal
    const safeName = path.basename(filename);
    const backupFile = path.join(BACKUP_DIR, safeName);

    if (!fs.existsSync(backupFile)) {
        return res.status(404).json({ message: 'Backup file not found' });
    }

    const DB_NAME = process.env.DB_NAME || 'sarga_db';
    const DB_USER = process.env.DB_USER || 'root';
    const DB_PASS = process.env.DB_PASS || '';

    const env = { ...process.env };
    if (DB_PASS) env.MYSQL_PWD = DB_PASS;

    assertSafeDbArg(DB_USER, 'DB_USER');
    assertSafeDbArg(DB_NAME, 'DB_NAME');

    const child = spawn('mysql', ['-u', DB_USER, DB_NAME], { env });
    const readStream = fs.createReadStream(backupFile);
    readStream.pipe(child.stdin);

    child.on('error', (error) => {
        console.error('Restore failed:', error);
        return res.status(500).json({ message: 'Restore failed' });
    });

    child.on('close', (code) => {
        if (code !== 0) {
            console.error('Restore failed with exit code:', code);
            return res.status(500).json({ message: 'Restore failed' });
        }
        auditLog(req.user.id, 'BACKUP_RESTORE', `Restored database from: ${safeName}`);
        res.json({ message: `Database restored successfully from ${safeName}` });
    });
}));

// Delete a backup
router.delete('/backups/:filename', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
    const safeName = path.basename(req.params.filename);
    const backupFile = path.join(BACKUP_DIR, safeName);

    if (!fs.existsSync(backupFile)) {
        return res.status(404).json({ message: 'Backup file not found' });
    }

    fs.unlinkSync(backupFile);
    auditLog(req.user.id, 'BACKUP_DELETE', `Deleted backup: ${safeName}`);
    res.json({ message: `Backup ${safeName} deleted` });
}));

// Download a backup file
router.get('/backups/download/:filename', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
    const safeName = path.basename(req.params.filename);
    const backupFile = path.join(BACKUP_DIR, safeName);

    if (!fs.existsSync(backupFile)) {
        return res.status(404).json({ message: 'Backup file not found' });
    }

    res.download(backupFile, safeName);
}));

module.exports = router;
