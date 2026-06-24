ALTER TABLE sarga_daily_credit_transactions
  ADD COLUMN description VARCHAR(500) NULL
  AFTER amount;
