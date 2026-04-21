# Delete ALL work-related data — instructions

WARNING: These steps are destructive. Do NOT proceed unless you have a verified backup and explicit confirmation.

1) Preview the rows that will be affected

Run (replace host/user/db/port as needed; you'll be prompted for the password):

```
mysql -h db-sarga-software-sarga.b.aivencloud.com -P 14194 -u avnadmin -p defaultdb < tools/delete-works-preview.sql
```

2) Backup the affected tables (recommended)

Backup only the work-related tables (fast):

```
mysqldump -h db-sarga-software-sarga.b.aivencloud.com -P 14194 -u avnadmin -p defaultdb \
  work_jobs work_job_specs work_orders job_dependencies work_audit_logs > backup_works_$(Get-Date -Format yyyyMMdd).sql
```

Or perform a full database backup:

```
mysqldump -h db-sarga-software-sarga.b.aivencloud.com -P 14194 -u avnadmin -p --single-transaction --routines --triggers defaultdb > backup_full_defaultdb.sql
```

3) Execute deletion (careful)

- Open `tools/delete-works.sql` and review the steps. The destructive `DELETE` statements are commented out.
- After you have verified the preview and backup, either:
  - remove the leading `-- ` from the DELETE lines to uncomment them and run the file with `mysql`, or
  - copy the specific DELETE statements you want to run into a `mysql` prompt and execute them interactively.

Example command to run the (uncommented) deletion script:

```
mysql -h db-sarga-software-sarga.b.aivencloud.com -P 14194 -u avnadmin -p defaultdb < tools/delete-works.sql
```

4) Verify

Run the preview again to confirm rows were removed.

5) Rollback plan

If you have a backup file created in step 2, you can restore it with:

```
mysql -h <host> -P <port> -u <user> -p <database> < backup_works_YYYYMMDD.sql
```

If you want me to perform the deletion for you, reply with the exact target (production Aiven DB or local DB), and type `CONFIRM DELETE WORKS` to acknowledge you understand this is irreversible. I will not run anything without that exact confirmation.
