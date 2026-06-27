// Daily automatic backup script for MySQL database
const { spawn } = require('child_process');
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

const env = { ...process.env };
if (DB_PASS) env.MYSQL_PWD = DB_PASS;

const child = spawn('mysqldump', ['-u', DB_USER, DB_NAME], { env });
const writeStream = fs.createWriteStream(BACKUP_FILE);
child.stdout.pipe(writeStream);

child.on('error', (error) => {
    console.error('Backup failed:', error);
});

child.on('close', (code) => {
    if (code !== 0) {
        console.error('Backup failed with exit code:', code);
    } else {
        console.log('Backup completed:', BACKUP_FILE);
    }
});
