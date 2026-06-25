const { google } = require("googleapis");

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
  ],
});

async function setup() {
  const sheets = google.sheets({ version: "v4", auth });

  const workbook = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: "Sarga_Backup" },
      sheets: [
        { properties: { title: "RAW_Bills" } },
        { properties: { title: "RAW_Jobs" } },
        { properties: { title: "RAW_Customers" } },
        { properties: { title: "RAW_Inventory" } },
        { properties: { title: "RAW_Expenses" } },
        { properties: { title: "RAW_Staff" } },
        { properties: { title: "RAW_Attendance" } },
        { properties: { title: "RAW_CreditTxns" } },
        { properties: { title: "DASH_Revenue" } },
        { properties: { title: "DASH_Jobs" } },
        { properties: { title: "DASH_Expenses" } },
        { properties: { title: "CONTROL" } },
      ],
    },
  });

  const spreadsheetId = workbook.data.spreadsheetId;
  console.log("Spreadsheet:", spreadsheetId);

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        {
          range: "RAW_Customers!A1:F1",
          values: [["CustomerID", "Name", "Phone", "GST", "Address", "CreatedAt"]],
        },
        {
          range: "RAW_Jobs!A1:G1",
          values: [["JobID", "Customer", "Branch", "Status", "Amount", "Designer", "CreatedAt"]],
        },
        {
          range: "RAW_Bills!A1:F1",
          values: [["BillID", "Date", "Customer", "Total", "Mode", "CreatedAt"]],
        },
        {
          range: "RAW_Inventory!A1:E1",
          values: [["Item", "Branch", "Stock", "Unit", "UpdatedAt"]],
        },
        {
          range: "RAW_Expenses!A1:F1",
          values: [["ExpenseID", "Category", "Amount", "Branch", "Status", "CreatedAt"]],
        },
        {
          range: "CONTROL!A1:D2",
          values: [
            ["last_backup_at", "total_rows", "backup_status", "manual_trigger"],
            ["", 0, "READY", "NO"],
          ],
        },
      ],
    },
  });

  console.log("Sheets initialized");
}

setup().catch(console.error);
