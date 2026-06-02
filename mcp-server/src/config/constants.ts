/**
 * Sarga Prints MCP Server — Constants & Enums
 */

// ─── Branch Identifiers ─────────────────────────────────
export const BRANCHES = {
  PERAMBRA: 'Perambra',
  MEPPAYUR: 'Meppayur',
} as const;

export type Branch = (typeof BRANCHES)[keyof typeof BRANCHES];

// ─── Staff Roles (from sarga_staff.role) ─────────────────
export const ROLES = {
  ADMIN: 'Admin',
  ACCOUNTANT: 'Accountant',
  FRONT_OFFICE: 'Front Office',
  STAFF: 'Staff',
  DESIGNER: 'Designer',
  PRINT_OPERATOR: 'Print Operator',
} as const;

export type StaffRole = (typeof ROLES)[keyof typeof ROLES];

// ─── Role Permissions ────────────────────────────────────
export const READ_ROLES: StaffRole[] = [
  ROLES.ADMIN, ROLES.ACCOUNTANT, ROLES.FRONT_OFFICE,
  ROLES.STAFF, ROLES.DESIGNER, ROLES.PRINT_OPERATOR,
];

export const WRITE_ROLES: StaffRole[] = [
  ROLES.ADMIN, ROLES.ACCOUNTANT, ROLES.FRONT_OFFICE,
];

export const ADMIN_ROLES: StaffRole[] = [
  ROLES.ADMIN,
];

// ─── Job Statuses ────────────────────────────────────────
export const JOB_STATUSES = [
  'Pending', 'Processing', 'Designing', 'Printing',
  'Cutting', 'Lamination', 'Binding', 'Production',
  'Approval Pending', 'Completed', 'Delivered', 'Cancelled',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

// ─── Payment Statuses ────────────────────────────────────
export const PAYMENT_STATUSES = ['Unpaid', 'Partial', 'Paid'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

// ─── Payment Methods ─────────────────────────────────────
export const PAYMENT_METHODS = [
  'Cash', 'UPI', 'Both', 'Cheque', 'Account Transfer', 'Bank Transfer',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// ─── Vendor Categories ───────────────────────────────────
export const VENDOR_CATEGORIES = [
  'paper', 'ink', 'plates', 'chemicals', 'machinery',
  'stationery', 'transport', 'other',
] as const;

// ─── Invoice Statuses ────────────────────────────────────
export const INVOICE_STATUSES = ['pending', 'partial', 'paid', 'overdue'] as const;

// ─── Inventory Categories ────────────────────────────────
export const INVENTORY_CATEGORIES = ['Retail', 'Consumable'] as const;

// ─── Paper Categories ────────────────────────────────────
export const PAPER_CATEGORIES = ['LASER', 'OFFSET'] as const;

// ─── Stock Movement Types ────────────────────────────────
export const MOVEMENT_TYPES = ['INWARD', 'OUTWARD', 'ADJUSTMENT', 'TRANSFER'] as const;

// ─── Machine / Book Types ────────────────────────────────
export const BOOK_TYPES = ['Offset', 'Laser', 'Other'] as const;

// ─── Customer Types ──────────────────────────────────────
export const CUSTOMER_TYPES = ['Walk-in', 'Retail', 'Offset'] as const;

// ─── Expense Types ───────────────────────────────────────
export const EXPENSE_TYPES = [
  'Vendor', 'Utility', 'Salary', 'Rent', 'Other',
] as const;

// ─── Artwork Upload Statuses ─────────────────────────────
export const ARTWORK_STATUSES = [
  'uploaded', 'under_review', 'proof_sent', 'approved',
  'printing', 'completed', 'cancelled',
] as const;

// ─── Job Priority ────────────────────────────────────────
export const JOB_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'] as const;

// ─── Defaults ────────────────────────────────────────────
export const DEFAULTS = {
  PAGE: 1,
  PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  CACHE_TTL: 300, // 5 minutes
  QUERY_TIMEOUT: 30_000, // 30 seconds
  DATE_RANGE_DAYS: 30,
} as const;

// ─── Consumable Categories ───────────────────────────────
export const CONSUMABLE_CATEGORIES = [
  'ink', 'chemical', 'plate', 'spare_part', 'other',
] as const;
