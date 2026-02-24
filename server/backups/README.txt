This folder stores daily automatic database backups.

To schedule daily backups:
- Use Windows Task Scheduler or a cron job to run scripts/auto-backup.js every day.
- Each backup file is named with the date and time.
- Ensure the MySQL user has permission to run mysqldump.
- Backups are stored as .sql files for easy restore.

Restore instructions:
- Use the command: mysql -u <user> -p <database> < backup-file.sql
