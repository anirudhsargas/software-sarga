// Daily automatic backup script for MySQL database
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const BACKUP_DIR = path.join(__dirname, '../backups');
const DB_NAME = process.env.DB_NAME || 'sarga_db';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASS = process.env.DB_PASS || '';
const DATE = new Date().toISOString().replace(/[:T]/g, '-').split('.')[0];
const BACKUP_FILE = path.join(BACKUP_DIR, `backup-${DATE}.sql`);

if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR);
}

const dumpCmd = `mysqldump -u ${DB_USER} ${DB_PASS ? '-p' + DB_PASS : ''} ${DB_NAME} > "${BACKUP_FILE}"`;

exec(dumpCmd, (error, stdout, stderr) => {
    if (error) {
        console.error('Backup failed:', error);
    } else {
        console.log('Backup completed:', BACKUP_FILE);
    }
});

// To schedule: Use Windows Task Scheduler or a cron job to run this script daily.
