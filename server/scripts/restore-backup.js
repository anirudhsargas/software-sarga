// Restore MySQL database from a backup file
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const BACKUP_DIR = path.join(__dirname, '../backups');
const DB_NAME = process.env.DB_NAME || 'sarga_db';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASS = process.env.DB_PASS || '';

// Accept a specific backup file as CLI argument, or use the latest
const arg = process.argv[2];

function getLatestBackup() {
    if (!fs.existsSync(BACKUP_DIR)) {
        console.error('No backups directory found at', BACKUP_DIR);
        process.exit(1);
    }
    const files = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.endsWith('.sql'))
        .sort()
        .reverse();
    if (files.length === 0) {
        console.error('No backup files found in', BACKUP_DIR);
        process.exit(1);
    }
    return path.join(BACKUP_DIR, files[0]);
}

const backupFile = arg ? (path.isAbsolute(arg) ? arg : path.join(BACKUP_DIR, arg)) : getLatestBackup();

if (!fs.existsSync(backupFile)) {
    console.error('Backup file not found:', backupFile);
    process.exit(1);
}

console.log(`Restoring database "${DB_NAME}" from: ${backupFile}`);
console.log('WARNING: This will overwrite all current data! Press Ctrl+C within 5 seconds to abort...');

setTimeout(() => {
    const restoreCmd = `mysql -u ${DB_USER} ${DB_PASS ? '-p' + DB_PASS : ''} ${DB_NAME} < "${backupFile}"`;

    exec(restoreCmd, (error, stdout, stderr) => {
        if (error) {
            console.error('Restore failed:', error.message);
            process.exit(1);
        } else {
            console.log('Database restored successfully from:', backupFile);
        }
    });
}, 5000);

// To use: node restore-backup.js [optional-backup-filename.sql]
// If no filename is provided, the latest backup will be used.
