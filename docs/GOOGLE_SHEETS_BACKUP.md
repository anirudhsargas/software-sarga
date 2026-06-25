# Google Sheets Backup and Reporting Module

This module provides a production-ready Google Sheets backup, reporting, and recovery layer integrated directly into the sarga application.

---

## 1. Environment Variables

Configure these keys in your backend `.env` file (locally) or in the Render environment settings (production):

- `GOOGLE_SERVICE_ACCOUNT`: The complete JSON key credentials file issued by Google Cloud Console for your Service Account. It can be formatted as:
  - A raw, single-line JSON string (e.g. `{"type":"service_account",...}`)
  - A Base64-encoded string of the JSON credentials (highly recommended for production deploys like Render to avoid escaping issues).
- `GOOGLE_SHEET_ID`: The ID of your target Google Spreadsheet (extracted from the URL: `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`).

---

## 2. Google Cloud Setup Steps

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project or select an existing one.
3. Search for the **Google Sheets API** and **Google Drive API** and click **Enable** on both.
4. Go to **APIs & Services** > **Credentials**.
5. Click **Create Credentials** > **Service Account**.
6. Provide a name, and once created, click on the service account email.
7. Under the **Keys** tab, click **Add Key** > **Create New Key** (JSON). Download the key file.
8. Open your Google Spreadsheet and click **Share**. Add the service account's `client_email` address (found in the JSON key) with **Editor** permissions.
9. Populate the downloaded JSON key (either raw or Base64 encoded) and the spreadsheet ID into your environment variables.

---

## 3. Spreadsheet Architecture

When the sync engine runs, it automatically verifies the existence of the following sheets (tabs) and creates them with appropriate headers if they are missing:

| Tab Name | Data Source Table | Sync Threshold column |
| :--- | :--- | :--- |
| `RAW_Customers` | `sarga_customers` | `updated_at` |
| `RAW_Jobs` | `sarga_jobs` | `updated_at` |
| `RAW_Bills` | `sarga_bills_documents` | `created_at` |
| `RAW_Inventory` | `sarga_inventory` | `created_at` |
| `RAW_Expenses` | `sarga_payments` (`type = 'Expense'`) | `created_at` |
| `RAW_Vendors` | `vendors` | `updated_at` |
| `RAW_Staff` | `sarga_staff` | `created_at` |
| `RAW_Attendance` | `sarga_staff_attendance` | `created_at` |
| `RAW_Payments` | `sarga_customer_payments` | `created_at` |
| `RAW_Orders` | `sarga_orders` | `updated_at` |
| `RAW_Designs` | `sarga_customer_designs` | `created_at` |
| `CONTROL` | Last sync timestamp lookup table | — |
| `AUDIT` | Sync latencies, rows synced, lock status logs | — |
| `DASHBOARD` | Realtime formulas & low-stock alerts | — |

---

## 4. Cron Scheduling

Centralized crons are registered inside `server/services/scheduler.js`:

1. **Incremental Sync** (`*/15 * * * *`): Runs every 15 minutes. Selects database changes since the last run and upserts them.
2. **Full Snapshot Sync** (`0 1 * * *`): Runs nightly at 1:00 AM. Performs a complete rebuild of the sheet data.
3. **Monthly Spreadsheet Archiver** (`0 2 1 * *`): Runs on the 1st of every month at 2:00 AM. Duplicates the spreadsheet in Google Drive to create a monthly timestamped snapshot.

---

## 5. Emergency Recovery (Database Restore)

The restore system reads the rows from Google Sheets, maps headers back to database columns, and executes a transactional `ON DUPLICATE KEY UPDATE` query in MySQL.

### Restore Filters
- **Branch Scope**: Only restores rows matching the selected `branch_id`.
- **Date Range**: Filtered by `created_at` range of the rows.
- **Full System**: Restores all tables, overwriting matching rows.

> [!CAUTION]
> RESTORE operations overwrite MySQL database records with Google Sheets values. Confirm that sheet data is correct and clean before triggering recovery.
