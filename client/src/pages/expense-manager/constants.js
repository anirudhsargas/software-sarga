import { API_URL } from '../../services/api';
import { serverToday, serverThisMonth } from '../../services/serverTime';

/* ══════════ Category / Type Constants ══════════ */
export const EXPENSE_CATEGORIES = {
  'Vendor': [],
  'Utility': ['Electricity', 'Internet / Broadband', 'Phone', 'Water'],
  'Rent': [],
  'Office & Admin': ['Stationery', 'Printer Paper', 'Toner', 'Office Cleaning', 'Tea / Water / Snacks', 'Furniture', 'Computer Repair', 'UPS / Inverter'],
  'Transport & Delivery': ['Courier Charges', 'Auto / Taxi', 'Fuel', 'Goods Transport', 'Customer Delivery'],
  'Marketing & Sales': ['Flex Printing', 'Google / Facebook Ads', 'Visiting Card Promo', 'Banner / Board', 'Festival Offers', 'Sponsorships'],
  'Machine & Maintenance': ['Minor Repair', 'Oil / Grease', 'Technician', 'AMC Payment', 'Cleaning Materials'],
  'Bank & Finance': ['Bank Charges', 'Loan EMI', 'Interest Paid', 'GST Payment', 'TDS', 'Professional Tax', 'ROC / CA Fees'],
  'Miscellaneous': ['Tips', 'Donations', 'Small Tools', 'Emergency Purchases']
};

export const OFFICE_EXPENSE_TYPES = ['Stationery', 'Office Supplies', 'Furniture', 'Equipment', 'Software', 'Internet', 'Phone', 'Maintenance', 'Other'];
export const TRANSPORT_EXPENSE_TYPES = ['Delivery', 'Fuel', 'Vehicle Maintenance', 'Vehicle Rent', 'Driver Charges', 'Toll', 'Parking', 'Other'];
export const MISC_CATEGORIES = ['Tips', 'Donations', 'Small Tools', 'Emergency Purchases', 'Returns / Refunds', 'Festival / Events', 'Government Fees', 'Other'];
export const DOCUMENT_TYPES = ['Invoice', 'Receipt', 'Bill', 'Quotation', 'Purchase Order', 'Agreement', 'License', 'Tax Document', 'Bank Statement', 'Other'];

export const REPORT_TYPES = [
  { key: 'monthly-expenses', label: 'Monthly Expenses' },
  { key: 'category-wise', label: 'Category Wise' },
  { key: 'branch-wise', label: 'Branch Wise' },
  { key: 'vendor-ledger', label: 'Vendor Ledger' },
  { key: 'utility-statement', label: 'Utility Statement' },
  { key: 'rent-statement', label: 'Rent Statement' },
  { key: 'emi-statement', label: 'EMI Statement' },
  { key: 'kuri-statement', label: 'Kuri Statement' },
  { key: 'cash-vs-bank', label: 'Cash vs Bank' },
];

/* ══════════ Utility Helpers ══════════ */
export const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
export const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const today = () => serverToday();
export const thisMonth = () => serverThisMonth();
export const baseFileUrl = API_URL.replace(/\/api$/, '');

export const exportRowsToCsv = (rows, filename) => {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [keys.join(','), ...rows.map(r => keys.map(k => `"${(r[k] ?? '').toString().replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
};
