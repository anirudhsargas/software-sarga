const router = require('express').Router();
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { auditLog, asyncHandler } = require('../helpers');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

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

    const dumpCmd = `mysqldump -u ${DB_USER} ${DB_PASS ? '-p' + DB_PASS : ''} ${DB_NAME} > "${BACKUP_FILE}"`;

    exec(dumpCmd, (error, stdout, stderr) => {
        if (error) {
            console.error('Backup failed:', error);
            return res.status(500).json({ message: 'Backup failed', error: error.message });
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

    const restoreCmd = `mysql -u ${DB_USER} ${DB_PASS ? '-p' + DB_PASS : ''} ${DB_NAME} < "${backupFile}"`;

    exec(restoreCmd, (error, stdout, stderr) => {
        if (error) {
            console.error('Restore failed:', error);
            return res.status(500).json({ message: 'Restore failed', error: error.message });
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
