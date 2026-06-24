ALTER TABLE sarga_daily_credit_transactions
  ADD COLUMN IF NOT EXISTS description VARCHAR(500) NULL
  AFTER amount;
