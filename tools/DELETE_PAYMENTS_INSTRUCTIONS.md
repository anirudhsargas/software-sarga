# Delete ALL payment records — instructions

WARNING: These steps are destructive. Do NOT proceed unless you have a verified backup and explicit confirmation.

Default target assumed: Aiven production (host and creds are taken from `.env`). If you want a different target, say so.

1) Preview the rows that will be affected

Run (you will be prompted for the DB password):

```
mysql -h db-sarga-software-sarga.b.aivencloud.com -P 14194 -u avnadmin -p defaultdb < tools/delete-payments-preview.sql
```

2) Backup the affected tables (recommended)

Identify which payment/refund tables exist after preview, then run a selective dump. Example backing up the common tables:

```
mysqldump --single-transaction -h db-sarga-software-sarga.b.aivencloud.com -P 14194 -u avnadmin defaultdb \
  sarga_customer_payments invoice_payments sarga_refunds sarga_vendor_bills > tools/backup_payments_$(Get-Date -Format yyyyMMdd).sql
```

3) Execute deletion (careful)

- Open `tools/delete-payments.sql` and review the steps. The destructive `DELETE` statements are commented out.
- After you have verified the preview and backup, to proceed on the default Aiven DB reply with the exact confirmation phrase: `CONFIRM DELETE PAYMENTS`.
- I will only run the deletion after you send that exact phrase and confirm the target.

4) Verify

Run the preview again to confirm rows were removed.

5) Rollback plan

If you created a backup in step 2, you can restore it with:

```
mysql -h <host> -P <port> -u <user> -p <database> < tools/backup_payments_YYYYMMDD.sql
```

If you want me to run the preview now, reply `RUN PAYMENTS PREVIEW`.
