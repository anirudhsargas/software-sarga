// Role-based module permissions.
//
// `defaultRoles` mirrors the role lists hard-coded in Dashboard.jsx (sidebar menu + routes).
// They are the MAXIMUM access a role can have. From Administration → Permissions an Admin can
// switch a module OFF for a role; that hides it in the sidebar and blocks the URL.
// Admin always has full access and is not configurable.
//
// `paths` are URL prefixes under the dashboard. A URL is matched to the module with the
// longest matching prefix, so e.g. /dashboard/expenses/upload-bills belongs to "Upload Bills",
// not "Expense Manager".

export const CONFIGURABLE_ROLES = ['Front Office', 'Accountant', 'Designer', 'Printer', 'Other Staff'];

export const PERMISSION_GROUPS = [
    { key: 'sales', label: 'Sales' },
    { key: 'inventory', label: 'Inventory' },
    { key: 'production', label: 'Production' },
    { key: 'branch-ops', label: 'Branch Operations' },
    { key: 'accounts', label: 'Accounts' },
    { key: 'admin', label: 'Administration' },
    { key: 'other', label: 'Other Pages' },
];

const FO = 'Front Office';
const ACC = 'Accountant';
const DES = 'Designer';
const PRN = 'Printer';
const OTH = 'Other Staff';

export const PERMISSION_MODULES = [
    // Sales
    { id: 'sales_customers', name: 'Customers', group: 'sales', paths: ['/dashboard/sales/customers'], defaultRoles: [FO, ACC] },
    { id: 'sales_orders', name: 'Orders', group: 'sales', paths: ['/dashboard/sales/orders'], defaultRoles: [FO, ACC, DES, PRN, OTH] },
    { id: 'sales_quotes', name: 'Quotations', group: 'sales', paths: ['/dashboard/sales/quotes'], defaultRoles: [FO, ACC] },
    { id: 'sales_invoices', name: 'Invoices', group: 'sales', paths: ['/dashboard/sales/invoices'], defaultRoles: [FO, ACC] },
    { id: 'sales_payments', name: 'Payments', group: 'sales', paths: ['/dashboard/sales/payments'], defaultRoles: [FO, ACC] },
    { id: 'shortcuts', name: 'Shortcuts', group: 'sales', paths: ['/dashboard/shortcuts'], defaultRoles: [FO, ACC, DES, PRN] },
    { id: 'designer_jobs', name: 'Assigned Jobs (Designer)', group: 'sales', paths: ['/dashboard/designer-dashboard'], defaultRoles: [DES] },
    { id: 'printer_jobs', name: 'Assigned Jobs (Printer)', group: 'sales', paths: ['/dashboard/printer-dashboard'], defaultRoles: [PRN] },

    // Inventory
    { id: 'inventory', name: 'Inventory', group: 'inventory', paths: ['/dashboard/inventory'], defaultRoles: [FO, ACC] },
    { id: 'paper_inventory', name: 'Paper Inventory', group: 'inventory', paths: ['/dashboard/paper', '/dashboard/inventory/paper'], defaultRoles: [FO, ACC] },
    { id: 'consumables', name: 'Consumables', group: 'inventory', paths: ['/dashboard/inventory/consumables'], defaultRoles: [FO, ACC] },
    { id: 'stock_transfer', name: 'Stock Transfer', group: 'inventory', paths: ['/dashboard/stock-transfer'], defaultRoles: [FO, ACC] },
    { id: 'stock_verification', name: 'Stock Verification', group: 'inventory', paths: ['/dashboard/stock-verification'], defaultRoles: [ACC] },
    { id: 'scan_item', name: 'Scan Item', group: 'inventory', paths: ['/dashboard/inventory/scan'], defaultRoles: [FO, ACC] },

    // Production
    { id: 'product_library', name: 'Product Library', group: 'production', paths: ['/dashboard/products'], defaultRoles: [FO, DES, ACC] },
    { id: 'machines', name: 'Machine Management', group: 'production', paths: ['/dashboard/machines'], defaultRoles: [FO] },
    { id: 'waste_proof', name: 'Waste & Proof Log', group: 'production', paths: ['/dashboard/production/waste-proof'], defaultRoles: [FO, ACC, PRN, OTH] },
    { id: 'production_tracker', name: 'Production Tracker', group: 'production', paths: ['/dashboard/production-tracker'], defaultRoles: [FO] },
    { id: 'paper_layout', name: 'Paper Layout', group: 'production', paths: ['/dashboard/paper-layout'], defaultRoles: [FO, DES] },
    { id: 'design_check', name: 'Design Check', group: 'production', paths: ['/dashboard/design-check'], defaultRoles: [DES] },

    // Branch operations
    { id: 'product_requests', name: 'Product Requests', group: 'branch-ops', paths: ['/dashboard/product-requests'], defaultRoles: [ACC] },
    { id: 'internal_transfers', name: 'Internal Transfers', group: 'branch-ops', paths: ['/dashboard/internal-transactions'], defaultRoles: [ACC, FO] },

    // Accounts
    { id: 'daily_report', name: 'Daily Cash Book', group: 'accounts', paths: ['/dashboard/daily-report'], defaultRoles: [FO, ACC] },
    { id: 'expenses', name: 'Expense Manager', group: 'accounts', paths: ['/dashboard/expenses'], defaultRoles: [FO, ACC] },
    { id: 'upload_bills', name: 'Upload Bills', group: 'accounts', paths: ['/dashboard/expenses/upload-bills'], defaultRoles: [FO, ACC] },
    { id: 'vendors', name: 'Vendors', group: 'accounts', paths: ['/dashboard/vendors', '/dashboard/utilities'], defaultRoles: [ACC, FO] },
    { id: 'payment_verification', name: 'Payment Verification', group: 'accounts', paths: ['/dashboard/payment-verification'], defaultRoles: [ACC] },
    { id: 'accounts_gst', name: 'Accounts & GST', group: 'accounts', paths: ['/dashboard/accounts'], defaultRoles: [ACC] },
    { id: 'recurring_invoices', name: 'Recurring Invoices', group: 'accounts', paths: ['/dashboard/recurring-invoices'], defaultRoles: [ACC] },

    // Administration
    { id: 'staff_management', name: 'Staff Management', group: 'admin', paths: ['/dashboard/staff', '/dashboard/employee'], defaultRoles: [ACC, FO] },
    { id: 'requests', name: 'Requests', group: 'admin', paths: ['/dashboard/requests'], defaultRoles: [ACC] },
    { id: 'schedules', name: 'Schedule & Time', group: 'admin', paths: ['/dashboard/schedules'], defaultRoles: [ACC] },

    // Pages reachable by URL / in-page links but not in the sidebar
    { id: 'reports', name: 'Reports', group: 'other', paths: ['/dashboard/reports'], defaultRoles: [ACC] },
    { id: 'attendance_salary', name: 'Attendance & Salary', group: 'other', paths: ['/dashboard/attendance-salary'], defaultRoles: [ACC] },
    { id: 'job_priority', name: 'Job Priority', group: 'other', paths: ['/dashboard/job-priority'], defaultRoles: [FO, DES, PRN] },
    { id: 'plates', name: 'Plate Management', group: 'other', paths: ['/dashboard/plates'], defaultRoles: [DES] },
];

const normalizePath = (p) => String(p || '').replace(/\/+$/, '').toLowerCase();

/** Find the module that owns a dashboard URL (longest prefix wins). */
export function findModuleForPath(pathname) {
    const target = normalizePath(pathname);
    let best = null;
    let bestLen = -1;
    for (const mod of PERMISSION_MODULES) {
        for (const p of mod.paths) {
            const prefix = normalizePath(p);
            if ((target === prefix || target.startsWith(prefix + '/')) && prefix.length > bestLen) {
                best = mod;
                bestLen = prefix.length;
            }
        }
    }
    return best;
}

/** Effective access of a role to a module: admin override if set, else the built-in default. */
export function isModuleEnabled(role, mod, overridesByRole) {
    const override = overridesByRole?.[role]?.[mod.id];
    if (typeof override === 'boolean') return override;
    return mod.defaultRoles.includes(role);
}

/**
 * Admin override for the module that owns `pathname`:
 *   false → switched off for this role, true → explicitly granted, null → no override (use code roles).
 * Admin is never overridden.
 */
export function getPathOverride(role, pathname, overridesByRole) {
    if (!role || role === 'Admin') return null;
    const mod = findModuleForPath(pathname);
    if (!mod) return null;
    const override = overridesByRole?.[role]?.[mod.id];
    return typeof override === 'boolean' ? override : null;
}

/** Final access decision: override wins, otherwise the route/menu's own role list. */
export function canRoleAccessPath(role, pathname, codeRoles, overridesByRole) {
    const override = getPathOverride(role, pathname, overridesByRole);
    if (override !== null) return override;
    if (!codeRoles) return true;
    const r = String(role || '').toLowerCase().trim();
    return codeRoles.some(x => x.toLowerCase().trim() === r);
}
