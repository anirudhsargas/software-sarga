/**
 * localDb.js — Offline-first read/write abstraction layer.
 *
 * ALL pages should import from this module instead of using `api` directly.
 *
 * WRITES: Save to IndexedDB first (with syncStatus: 'pending'),
 *         attempt server POST in background, return immediately.
 *
 * READS:  Always from IndexedDB. Never wait for server.
 *
 * Usage:
 *   import { getJobs, createBill, createPayment, getProducts, createVendor, createPaymentMethod,    getDeliveredJobs,
    searchCustomersLocal,
    saveInventoryItem,
    deleteInventoryItem,
    consumeInventory,
    restockInventory,
    getStaffAttendance,
    getStaffSalaryCalculation,
    getExpenseDashboard,
    saveExpensePayment,
    getExpensesByCategory,
    saveVendor,
    deleteVendor,
    getVendorLedger,
    createVendorBill,
    saveVendorRequest,
    getBillsDocuments,
    saveBillDocument,
    deleteBillDocument
} from '../services/localDb';
 */

import offlineDb from './offlineDb';
import api from './api';
import { normalizeToE164 } from '../utils/phone';

// ──────────────────── Helpers ────────────────────

/** Generate a local ID for new records */
const generateLocalId = (prefix = 'LOCAL') =>
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeCustomerMobile = (mobile) => {
    // Prefer E.164 when user provides it; fallback to legacy last-10 digits
    const e164 = normalizeToE164(mobile);
    return e164 || String(mobile || '').replace(/\D/g, '').slice(-10);
};

const isTemporaryCustomerId = (id) => typeof id === 'string' && id.startsWith('CUST-');

const customerRecordRank = (customer) => {
    let rank = 0;
    if (customer?.syncStatus === 'synced') rank += 4;
    if (customer?.serverId != null) rank += 3;
    if (!isTemporaryCustomerId(customer?.id)) rank += 2;
    if (customer?.updated_at || customer?.updatedAt) rank += 1;
    return rank;
};

function dedupeCustomers(customers = []) {
    const byKey = new Map();

    customers.forEach((customer, index) => {
        if (!customer) return;

        const mobileKey = normalizeCustomerMobile(customer.mobile);
        const serverKey = customer.serverId != null ? `server:${customer.serverId}` : null;
        const idKey = customer.id != null ? `id:${customer.id}` : null;
        const fallbackKey = `name:${String(customer.name || '').trim().toLowerCase()}|type:${String(customer.type || '').trim().toLowerCase()}`;
        const key = mobileKey ? `mobile:${mobileKey}` : (serverKey || idKey || fallbackKey);

        const existing = byKey.get(key);
        if (!existing) {
            byKey.set(key, { customer, index });
            return;
        }

        const currentRank = customerRecordRank(customer);
        const existingRank = customerRecordRank(existing.customer);
        if (currentRank > existingRank || (currentRank === existingRank && index > existing.index)) {
            byKey.set(key, { customer, index });
        }
    });

    return Array.from(byKey.values())
        .sort((a, b) => a.index - b.index)
        .map((entry) => entry.customer);
}

async function removeDuplicateCustomerCopies(primaryId, mobile, serverId) {
    const allCustomers = await offlineDb.getAll('customers');
    const normalizedMobile = normalizeCustomerMobile(mobile);

    const duplicates = allCustomers.filter((customer) => {
        if (!customer) return false;
        if (String(customer.id) === String(primaryId)) return false;
        if (serverId != null && String(customer.serverId ?? customer.id) === String(serverId)) return true;
        return normalizedMobile && normalizeCustomerMobile(customer.mobile) === normalizedMobile;
    });

    await Promise.all(duplicates.map((customer) => offlineDb.delete('customers', customer.id)));
}

/** Check if we're online */
const isOnline = () => navigator.onLine;

/** Try server call, return null on failure (never throws) */
async function tryServer(fn) {
    if (!isOnline()) return null;
    try {
        return await fn();
    } catch (err) {
        console.warn('[localDb] Server call failed, will sync later:', err.message);
        return null;
    }
}

// ──────────────────── READS (always from IndexedDB) ────────────────────

/**
 * Get product hierarchy - from cachedData store keyed as 'hierarchy'
 */
export async function getProducts() {
    return offlineDb.getCachedData('product-hierarchy');
}

/**
 * Get individual products - from products store
 */
export async function getProductList() {
    return offlineDb.getAll('products');
}

/**
 * Get all jobs for a specific customer
 */
export async function getCustomerJobs(customerId) {
    const id = isNaN(customerId) ? customerId : Number(customerId);
    const jobs = await offlineDb.getAllByIndex('jobs', 'customer_id', id);
    return (jobs || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export async function getFrontOfficeDashboard() {
    try {
        const [jobs, payments, customers] = await Promise.all([
            offlineDb.getAll('jobs').catch(() => []),
            offlineDb.getAll('payments').catch(() => []),
            offlineDb.getAll('customers').catch(() => [])
        ]);

        const stats = {
            today_orders: (jobs || []).filter(j => j.created_at && new Date(j.created_at).toDateString() === new Date().toDateString()).length,
            in_progress: (jobs || []).filter(j => j.status === 'Processing').length,
            ready_pickup: (jobs || []).filter(j => j.status === 'Completed').length,
            total_due: (customers || []).reduce((sum, c) => sum + (Number(c.due_amount) || 0), 0),
            today_collections: (payments || []).filter(p => (p.payment_date || p.created_at) && new Date(p.payment_date || p.created_at).toDateString() === new Date().toDateString())
                                       .reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
            delivered_today: (jobs || []).filter(j => j.status === 'Delivered' && j.updated_at && new Date(j.updated_at).toDateString() === new Date().toDateString()).length
        };

        const status_counts = (jobs || []).reduce((acc, j) => {
            if (j.status) {
                acc[j.status] = (acc[j.status] || 0) + 1;
            }
            return acc;
        }, {});

        return { stats, status_counts };
    } catch (err) {
        console.error('[localDb] Failed to generate dashboard stats:', err);
        // Return empty stats instead of throwing, so UI can still render
        return {
            stats: { today_orders: 0, in_progress: 0, ready_pickup: 0, total_due: 0, today_collections: 0, delivered_today: 0 },
            status_counts: {}
        };
    }
}

/**
 * Get work history for a specific staff member
 */
export async function getStaffWorkHistory(staffId) {
    try {
        const sId = isNaN(staffId) ? staffId : Number(staffId);
        // Get all assignments for this staff
        const assignments = await offlineDb.getAllByIndex('assignments', 'staff_id', sId).catch(() => []);
        
        if (!assignments || assignments.length === 0) return [];

        // Get all jobs to join
        const jobs = await offlineDb.getAll('jobs').catch(() => []);
        const customers = await offlineDb.getAll('customers').catch(() => []);
        const jobMap = new Map(jobs.map(j => [j.id, j]));
        const custMap = new Map(customers.map(c => [c.id, c]));

        return assignments.map(a => {
            const job = jobMap.get(a.job_id);
            if (!job) return null;
            const customer = job.customer_id ? custMap.get(job.customer_id) : null;

            return {
                ...job,
                assignment_id: a.id,
                assignment_status: a.status,
                customer_name: customer ? (customer.name || customer.company_name) : 'No Customer',
                customer_mobile: customer?.mobile
            };
        }).filter(Boolean).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } catch (err) {
        console.error('[localDb] Failed to get staff work history:', err);
        return [];
    }
}

export async function getActiveJobs(page = 1, limit = 50) {
    const jobs = await offlineDb.getAll('jobs').catch(() => []);
    const active = jobs.filter(j => j && !['Completed', 'Delivered', 'Cancelled'].includes(j.status))
                       .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { data: active.slice((page - 1) * limit, page * limit), total: active.length, totalPages: Math.ceil(active.length / limit) };
}

export async function getDueCustomers(page = 1, limit = 50) {
    const customers = await offlineDb.getAll('customers').catch(() => []);
    const due = customers.filter(c => c && Number(c.due_amount) > 0)
                         .sort((a, b) => (b.due_amount || 0) - (a.due_amount || 0));
    return { data: due.slice((page - 1) * limit, page * limit), total: due.length, totalPages: Math.ceil(due.length / limit) };
}

export async function getOverdueJobs(page = 1, limit = 50) {
    const jobs = await offlineDb.getAll('jobs').catch(() => []);
    const now = new Date();
    const overdue = jobs.filter(j => j && j.status !== 'Delivered' && j.status !== 'Cancelled' && j.delivery_date && new Date(j.delivery_date) < now)
                        .sort((a, b) => new Date(a.delivery_date) - new Date(b.delivery_date));
    return { data: overdue.slice((page - 1) * limit, page * limit), total: overdue.length, totalPages: Math.ceil(overdue.length / limit) };
}

export async function getRecentPayments(page = 1, limit = 50) {
    const payments = await offlineDb.getAll('payments').catch(() => []);
    const recent = payments.filter(Boolean).sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date));
    return { data: recent.slice((page - 1) * limit, page * limit), total: recent.length, totalPages: Math.ceil(recent.length / limit) };
}

export async function getDeliveredJobs(page = 1, limit = 50) {
    const jobs = await offlineDb.getAll('jobs');
    const delivered = jobs.filter(j => j.status === 'Delivered')
                          .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    return { data: delivered.slice((page - 1) * limit, page * limit), total: delivered.length, totalPages: Math.ceil(delivered.length / limit) };
}

export async function searchCustomersLocal(query) {
    const customers = dedupeCustomers(await offlineDb.getAll('customers'));
    const q = query.toLowerCase();
    return customers.filter(c => 
        c.name.toLowerCase().includes(q) || 
        (c.mobile && c.mobile.includes(q))
    ).slice(0, 10);
}

/**
 * Get vendors/payees
 */
export async function getVendors(filters = {}) {
    let vendors = await offlineDb.getAll('vendors');
    if (filters.type) {
        vendors = vendors.filter(v => v.type === filters.type);
    }
    if (filters.search) {
        const s = filters.search.toLowerCase();
        vendors = vendors.filter(v => 
            (v.name && v.name.toLowerCase().includes(s)) || 
            (v.phone && v.phone.includes(s))
        );
    }
    return vendors;
}

export async function saveVendor(vendor) {
    const isNew = !vendor.id;
    const id = vendor.id || generateLocalId('VEND');
    const result = await offlineDb.save('vendors', {
        ...vendor,
        id,
        updated_at: new Date().toISOString(),
        created_at: vendor.created_at || new Date().toISOString()
    });
    return { id: result, isNew };
}

export async function deleteVendor(id) {
    await offlineDb.delete('vendors', id);
}

export async function getVendorLedger(vendorId) {
    const vId = Number(vendorId);
    const [payments, bills] = await Promise.all([
        offlineDb.getAll('payments'),
        offlineDb.getAll('vendor_bills')
    ]);

    const vPayments = payments.filter(p => p.vendor_id === vId || p.payee_id === vId);
    const vBills = bills.filter(b => b.vendor_id === vId);

    const rows = [
        ...vPayments.map(p => ({ ...p, _entry_type: 'Payment', _date: p.payment_date || p.created_at })),
        ...vBills.map(b => ({ ...b, _entry_type: 'Purchase', _date: b.bill_date || b.created_at }))
    ].sort((a, b) => new Date(b._date) - new Date(a._date));

    return { rows, payments: vPayments, purchases: vBills };
}

export async function getVendorBills() {
    return offlineDb.getAll('vendor_bills');
}

export async function createVendorBill(billData) {
    const localId = generateLocalId('BILL');
    const record = {
        ...billData,
        id: localId,
        syncStatus: 'pending',
        created_at: new Date().toISOString()
    };

    // Save to IndexedDB first
    const idbKey = await offlineDb.save('vendor_bills', record);

    // Try to sync to server in background (non-blocking)
    if (navigator.onLine) {
        tryServer(async () => {
            await api.post('vendor-bills', billData);
        });
    }

    return { ...record, id: idbKey };
}

export async function getBillsDocuments(filters = {}) {
    let docs = await offlineDb.getAll('bills_documents');
    if (filters.document_type) {
        docs = docs.filter(d => d.document_type === filters.document_type);
    }
    if (filters.vendor_name) {
        const q = filters.vendor_name.toLowerCase();
        docs = docs.filter(d => d.vendor_name && d.vendor_name.toLowerCase().includes(q));
    }
    return docs.sort((a, b) => new Date(b.bill_date || b.created_at) - new Date(a.bill_date || a.created_at));
}

export async function saveBillDocument(doc) {
    const isNew = !doc.id;
    const result = await offlineDb.save('bills_documents', {
        ...doc,
        updated_at: new Date().toISOString(),
        created_at: doc.created_at || new Date().toISOString()
    });
    return { id: result, isNew };
}

export async function deleteBillDocument(id) {
    await offlineDb.delete('bills_documents', id);
}

/**
 * Get payment methods
 */
export async function getPaymentMethods() {
    return offlineDb.getAll('payment_methods');
}
/**
 * Get inventory items
 */
export async function getInventory(filters = {}) {
    let items = await offlineDb.getAll('inventory');

    if (filters.search) {
        const q = filters.search.toLowerCase();
        items = items.filter(i => 
            (i.name && i.name.toLowerCase().includes(q)) || 
            (i.sku && i.sku.toLowerCase().includes(q))
        );
    }

    if (filters.item_type) {
        items = items.filter(i => i.item_type === filters.item_type);
    }

    if (filters.category) {
        items = items.filter(i => i.category === filters.category);
    }

    if (filters.status) {
        if (filters.status === 'low') {
            items = items.filter(i => Number(i.quantity) <= Number(i.reorder_level || 0));
        } else if (filters.status === 'ok') {
            items = items.filter(i => Number(i.quantity) > Number(i.reorder_level || 0));
        }
    }

    if (filters.vendor_name) {
        const q = filters.vendor_name.toLowerCase();
        items = items.filter(i => i.vendor_name && i.vendor_name.toLowerCase().includes(q));
    }

    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const total = items.length;
    const totalPages = Math.ceil(total / limit);
    const data = items.slice((page - 1) * limit, page * limit);

    return { data, total, totalPages };
}

export async function saveInventoryItem(item) {
    const isNew = !item.id;
    const result = await offlineDb.save('inventory', {
        ...item,
        updated_at: new Date().toISOString(),
        created_at: item.created_at || new Date().toISOString()
    });
    // Attempt sync in background
    return { id: result, isNew };
}

export async function deleteInventoryItem(id) {
    await offlineDb.delete('inventory', id);
    // Queue deletion for sync
}

export async function consumeInventory(id, quantity) {
    const item = await offlineDb.getById('inventory', id);
    if (!item) throw new Error('Item not found');
    const newQty = Number(item.quantity) - Number(quantity);
    await offlineDb.save('inventory', { ...item, quantity: newQty });
    // Record transaction in a local logs table if needed
}

export async function restockInventory(id, quantity, cost) {
    const item = await offlineDb.getById('inventory', id);
    if (!item) throw new Error('Item not found');
    const newQty = Number(item.quantity) + Number(quantity);
    await offlineDb.save('inventory', { ...item, quantity: newQty, cost_price: cost || item.cost_price });
}

/**
 * Get staff attendance for a specific month
 */
export async function getStaffAttendance(staffId, month) {
    const allAtt = await offlineDb.getAll('attendance');
    // Simple filter by month string YYYY-MM
    return allAtt.filter(a => a.staff_id === Number(staffId) && a.attendance_date.startsWith(month));
}

/**
 * Get expense dashboard data
 */
export async function getExpenseDashboard(filters = {}) {
    const expenses = await offlineDb.getAll('expenses');
    const allPayments = await offlineDb.getAll('payments');
    const vendors = await offlineDb.getAll('vendors');

    const month = filters.month || new Date().toISOString().slice(0, 7); // YYYY-MM
    const currentMonthExpenses = expenses.filter(e => e.date && e.date.startsWith(month));
    const currentMonthPayments = allPayments.filter(p => (p.payment_date || p.created_at).startsWith(month));

    // Aggregate by category
    const categoryTotals = currentMonthExpenses.reduce((acc, exp) => {
        acc[exp.category] = (acc[exp.category] || 0) + (Number(exp.amount) || 0);
        return acc;
    }, {});

    const revenueCollected = currentMonthPayments
        .filter(p => p.type === 'Customer')
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    // Monthly Trend (last 6 months)
    const monthly_trend = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const mStr = d.toISOString().slice(0, 7);
        const total = expenses.filter(e => e.date && e.date.startsWith(mStr))
                              .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
        monthly_trend.push({ month: d.toLocaleString('default', { month: 'short' }), total });
    }

    // Payment Mode Analysis
    const cash_total = currentMonthPayments
        .filter(p => p.payment_method === 'Cash' || p.payment_method === 'Both')
        .reduce((sum, p) => sum + (Number(p.payment_method === 'Both' ? p.cash_amount : p.amount) || 0), 0);
    const upi_total = currentMonthPayments
        .filter(p => p.payment_method === 'UPI' || p.payment_method === 'Both')
        .reduce((sum, p) => sum + (Number(p.payment_method === 'Both' ? p.upi_amount : p.amount) || 0), 0);

    return {
        total_expenses: Object.values(categoryTotals).reduce((a, b) => a + b, 0),
        revenue_collected: revenueCollected,
        net_profit: revenueCollected - Object.values(categoryTotals).reduce((a, b) => a + b, 0),
        by_category: categoryTotals,
        monthly_trend,
        recent_payments: allPayments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10),
        vendor: {
            total_payable: vendors.reduce((sum, v) => sum + (Number(v.due_amount) || 0), 0),
            purchases_this_month: 0, // Needs vendor_bills
            payments_this_month: currentMonthPayments.filter(p => p.type === 'Vendor').reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
        },
        cash_vs_bank: { cash_total, upi_total, bank_total: 0, other_total: 0 }
    };
}

export async function saveExpensePayment(payment) {
    // Record both as a payment and an expense for tracking
    const pId = await offlineDb.save('payments', {
        ...payment,
        created_at: new Date().toISOString()
    });
    
    await offlineDb.save('expenses', {
        payment_id: pId,
        category: payment.category || 'Miscellaneous',
        amount: payment.amount,
        date: payment.payment_date || new Date().toISOString(),
        notes: payment.notes
    });

    return { id: pId };
}

export async function getExpensesByCategory(category) {
    const all = await offlineDb.getAll('expenses');
    return all.filter(e => e.category === category).sort((a, b) => new Date(b.date) - new Date(a.date));
}

/**
 * Get salary calculation (stub for now, needs cached data)
 */
export async function getStaffSalaryCalculation() {
    // This usually needs complex server logic. 
    // We should cache the latest calculation in a 'salary_cache' store.
    // For now, return empty or cached.
    return null;
}

/**
 * Get product hierarchy from cached data.
 */
export async function getProductHierarchy() {
    return offlineDb.getCachedData('product-hierarchy');
}

/**
 * Get all customers from IndexedDB.
 * Supports optional text search across name/mobile.
 */
export async function getCustomers(filters = '') {
    const all = dedupeCustomers(await offlineDb.getCachedCustomers());
    if (!filters) return all;

    // Handle old string-only query for compatibility
    if (typeof filters === 'string') {
        const q = filters.toLowerCase().trim();
        if (!q) return all;
        return all.filter(c =>
            (c.name && c.name.toLowerCase().includes(q)) ||
            (c.mobile && (c.mobile || '').includes(q)) ||
            (c.phone && (c.phone || '').includes(q)) ||
            (c.company_name && (c.company_name || '').toLowerCase().includes(q))
        );
    }

    // Handle filter object { search, type }
    let result = all;
    if (filters.type) {
        result = result.filter(c => c.type === filters.type);
    }
    if (filters.search) {
        const q = filters.search.toLowerCase().trim();
        result = result.filter(c =>
            (c.name && c.name.toLowerCase().includes(q)) ||
            (c.mobile && (c.mobile || '').includes(q)) ||
            (c.phone && (c.phone || '').includes(q)) ||
            (c.company_name && (c.company_name || '').toLowerCase().includes(q))
        );
    }
    return result;
}

/**
 * Get a single customer by ID from IndexedDB.
 */
export async function getCustomerById(id) {
    return offlineDb.getById('customers', id);
}

/**
 * Get all branches from IndexedDB.
 */
export async function getBranches() {
    return offlineDb.getCachedBranches();
}

/**
 * Get all machines from IndexedDB.
 */
export async function getMachines() {
    return offlineDb.getCachedMachines();
}

/**
 * Get all staff from IndexedDB, optionally filtered by branch.
 */
export async function getStaff(filters = {}) {
    if (filters.branch_id) {
        return offlineDb.getAllByIndex('staff', 'branch_id', filters.branch_id);
    }
    return offlineDb.getCachedStaff();
}

/**
 * Get pricing rules from IndexedDB.
 */
export async function getPricing() {
    return offlineDb.getCachedPricing();
}

/**
 * Get all jobs from IndexedDB, with optional filtering.
 */
export async function getJobs(filters = {}) {
    let jobs = await offlineDb.getCachedJobs();

    // Also include locally-created bills as jobs
    const pendingBills = await offlineDb.getAllBills();
    const billsAsJobs = pendingBills
        .filter(b => b.status !== 'synced')
        .map(b => ({
            id: b.offlineInvoiceRef || `local-${b.id}`,
            customer_name: b.customerName || b.customer_name || 'Walk-in',
            customer_id: b.customerId || b.customer_id,
            status: 'pending',
            total_amount: b.totalAmount || b.total_amount || 0,
            created_at: new Date(b.createdAt).toISOString(),
            syncStatus: b.syncStatus || 'pending',
            _isLocal: true,
            orderLines: b.orderLines || b.order_lines || [],
        }));

    jobs = [...billsAsJobs, ...jobs];

    // Apply filters
    if (filters.status) {
        jobs = jobs.filter(j => j.status === filters.status);
    }
    if (filters.customer_id) {
        jobs = jobs.filter(j => j.customer_id == filters.customer_id);
    }
    if (filters.branch_id) {
        jobs = jobs.filter(j => j.branch_id == filters.branch_id);
    }
    if (filters.startDate) {
        const start = new Date(filters.startDate).getTime();
        jobs = jobs.filter(j => new Date(j.created_at || j.createdAt).getTime() >= start);
    }
    if (filters.endDate) {
        const end = new Date(filters.endDate).getTime() + 86400000; // end of day
        jobs = jobs.filter(j => new Date(j.created_at || j.createdAt).getTime() < end);
    }
    if (filters.search) {
        const q = filters.search.toLowerCase();
        jobs = jobs.filter(j =>
            (j.customer_name && j.customer_name.toLowerCase().includes(q)) ||
            (j.customer_mobile && j.customer_mobile.includes(q)) ||
            (j.product_name && j.product_name.toLowerCase().includes(q)) ||
            (j.description && j.description.toLowerCase().includes(q)) ||
            String(j.id).includes(q)
        );
    }

    return jobs;
}

/**
 * Get a single job by ID from IndexedDB.
 */
export async function getJobById(id) {
    const jId = isNaN(id) ? id : Number(id);
    return offlineDb.getJobById(jId);
}

/**
 * Get consolidated customer dashboard
 */
export async function getCustomerDashboard(customerId) {
    // Determine if we're dealing with a numeric server ID or a temporary local string ID
    const isTemp = isTemporaryCustomerId(customerId);
    const id = isTemp ? customerId : Number(customerId);
    const [customer, allJobsRaw, allPaymentsRaw] = await Promise.all([
        offlineDb.getById('customers', id),
        offlineDb.getAll('jobs'),
        offlineDb.getAll('payments')
    ]);

    const normMobile = customer?.mobile ? String(customer.mobile).replace(/\D/g, '').slice(-10) : null;
    const normName = customer?.name ? String(customer.name).trim().toLowerCase() : null;

    const allJobs = (allJobsRaw || []).filter(j => {
        if (j.customer_id != null && String(j.customer_id) === String(id)) return true;
        if (normMobile && j.customer_mobile && String(j.customer_mobile).replace(/\D/g, '').slice(-10) === normMobile) return true;
        if (normName && j.customer_name && String(j.customer_name).trim().toLowerCase() === normName) return true;
        return false;
    });

    const payments = (allPaymentsRaw || []).filter(p => {
        if (p.customer_id != null && String(p.customer_id) === String(id)) return true;
        if (normMobile && p.customer_mobile && String(p.customer_mobile).replace(/\D/g, '').slice(-10) === normMobile) return true;
        if (normName && p.customer_name && String(p.customer_name).trim().toLowerCase() === normName) return true;
        return false;
    });

    if (!customer) return null;

    // Include pending offline bills as synthetic jobs so newly created orders show up immediately
    const pendingBills = await offlineDb.getAllBills();
    const billsForCustomer = (pendingBills || []).filter(b => {
        const cid = b.customerId != null ? b.customerId : (b.customer_id != null ? b.customer_id : null);
        // Compare values by converting both to strings to avoid type mismatch issues (string vs number)
        return String(cid) === String(id);
    });
    const billsAsJobs = (billsForCustomer || []).filter(b => (b.status || b.syncStatus) !== 'synced').map(b => ({
        id: b.offlineInvoiceRef || `local-bill-${b.id}`,
        customer_name: b.customerName || b.customer_name || 'Walk-in',
        customer_id: b.customerId || b.customer_id || id,
        status: 'Pending',
        total_amount: b.totalAmount || b.total_amount || 0,
        advance_paid: b.advancePaid || b.advance_paid || 0,
        created_at: (b.createdAt ? new Date(b.createdAt).toISOString() : new Date().toISOString()),
        orderLines: b.orderLines || b.order_lines || [],
        _isLocal: true,
        syncStatus: b.syncStatus || 'pending',
    }));

    const jobs = [...billsAsJobs, ...(allJobs || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Fetch assignments for all these jobs
    const assignmentPromises = jobs.map(j => offlineDb.getAssignmentsByJob(j.id));
    const allAssignmentsChunks = await Promise.all(assignmentPromises);
    const assignments = allAssignmentsChunks.flat();

    // Calculate Summary
    const summary = {
        totalOrders: jobs.length,
        totalSpent: payments.reduce((sum, p) => sum + Number(p.advance_paid || 0), 0) + 
                     jobs.reduce((sum, j) => sum + Number(j.advance_paid || 0), 0), // Simplification
        pendingOrders: jobs.filter(j => j.status === 'Pending').length,
        processingOrders: jobs.filter(j => j.status === 'Processing').length,
        completedOrders: jobs.filter(j => j.status === 'Completed').length,
        cancelledOrders: jobs.filter(j => j.status === 'Cancelled').length,
        lastOrderDate: jobs.length > 0 ? jobs[0].created_at : null
    };

    // Calculate Payment Dues
    const totalBilled = jobs.reduce((sum, j) => sum + Number(j.total_amount || 0), 0);
    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0) + 
                      jobs.reduce((sum, j) => sum + Number(j.advance_paid || 0), 0);

    return {
        customer,
        summary,
        jobs,
        assignments,
        payments: {
            records: payments,
            totalBilled,
            totalPaid,
            outstandingBalance: Math.max(0, totalBilled - totalPaid),
            methodBreakdown: payments.reduce((acc, p) => {
                const m = p.payment_method || 'Cash';
                acc[m] = (acc[m] || 0) + Number(p.amount || 0);
                return acc;
            }, {})
        },
        reorderItems: [] // Calculated from unique products in jobs if needed
    };
}

/**
 * Get full job details (job + assignments + logs + designs + proofs)
 */
export async function getJobDetails(id) {
    const jobId = isNaN(id) ? id : Number(id);
    const [job, assignments, paperLogs, designs, proofs] = await Promise.all([
        offlineDb.getJobById(jobId),
        offlineDb.getAssignmentsByJob(jobId),
        offlineDb.getPaperLogsByJob(jobId),
        offlineDb.getDesignsByJob(jobId),
        offlineDb.getProofsByJob(jobId)
    ]);

    if (!job) return null;

    return {
        job,
        assignments: assignments || [],
        paper_logs: paperLogs || [],
        designs: designs || [],
        proofs: proofs || [],
        // Derived structure for JobDetail.jsx compatibility
        payments: [], // Payments should be fetched via getPayments({ job_id })
        statusHistory: []
    };
}

/**
 * Cache (save) a job into local IndexedDB.
 * Used to persist server-fetched jobs so they become available offline.
 */
export async function cacheJob(job) {
    try {
        // ensure numeric id
        const j = { ...job, id: Number(job.id) };
        await offlineDb.putJob(j);
    } catch (err) {
        console.warn('[localDb] cacheJob failed:', err);
    }
}

/**
 * Get all payments from IndexedDB, with optional filtering and pagination.
 */
export async function getPayments(filters = {}) {
    let payments = await offlineDb.getCachedPayments();

    // Include pending payments
    const pending = await offlineDb.getPendingPayments();
    const pendingAsPayments = pending.map(p => ({
        ...p,
        id: p.offlinePaymentRef || `local-${p.id}`,
        syncStatus: p.syncStatus || 'pending',
        _isLocal: true,
    }));

    payments = [...pendingAsPayments, ...payments];

    // Apply filters
    if (filters.customer_id) {
        payments = payments.filter(p => p.customer_id == filters.customer_id);
    }
    if (filters.startDate) {
        const start = new Date(filters.startDate).getTime();
        payments = payments.filter(p => new Date(p.payment_date || p.createdAt).getTime() >= start);
    }
    if (filters.endDate) {
        const end = new Date(filters.endDate).getTime() + 86400000;
        payments = payments.filter(p => new Date(p.payment_date || p.createdAt).getTime() < end);
    }
    if (filters.type) {
        payments = payments.filter(p => p.type === filters.type);
    }

    // Sort by date DESC
    payments.sort((a, b) => new Date(b.payment_date || b.created_at) - new Date(a.payment_date || a.created_at));

    // Pagination
    if (filters.limit) {
        const page = Number(filters.page) || 1;
        const limit = Number(filters.limit);
        const total = payments.length;
        const data = payments.slice((page - 1) * limit, page * limit);
        return {
            data,
            total,
            totalPages: Math.ceil(total / limit),
            page
        };
    }

    return payments;
}

/**
 * Get attendance records from IndexedDB, with optional filtering.
 */
export async function getAttendance(filters = {}) {
    let records = await offlineDb.getAllAttendance();

    if (filters.staff_id) {
        records = records.filter(r => r.staff_id == filters.staff_id);
    }
    if (filters.date) {
        records = records.filter(r => r.date === filters.date);
    }
    if (filters.startDate && filters.endDate) {
        records = records.filter(r => r.date >= filters.startDate && r.date <= filters.endDate);
    }

    return records;
}

/**
 * Get all expenses from IndexedDB, with optional filtering.
 */
export async function getExpenses(filters = {}) {
    let records = await offlineDb.getAllExpenses();

    if (filters.category) {
        records = records.filter(r => r.category === filters.category);
    }
    if (filters.startDate && filters.endDate) {
        records = records.filter(r => r.date >= filters.startDate && r.date <= filters.endDate);
    }

    return records;
}

// ──────────────────── WRITES (IndexedDB first, then try server) ────────────────────

/**
 * Create a bill — saves to IndexedDB immediately, tries server in background.
 * Returns the saved bill data (don't wait for server).
 */
export async function createBill(billData, matterFiles = []) {
    const localId = generateLocalId('BILL');
    const record = {
        ...billData,
        localId,
        syncStatus: 'pending',
    };

    // 1. Save to IndexedDB
    const idbKey = await offlineDb.queueBill(record);

    // 2. Try server in background (non-blocking)
    tryServer(async () => {
        // Create jobs first
        const lines = billData.orderLines || billData.order_lines || [];
        let createdJobs = [];
        if (lines.length > 0) {
            const jobRes = await api.post('jobs/bulk', {
                customer_id: billData.customerId || billData.customer_id || null,
                order_lines: lines,
            });
            createdJobs = jobRes.data?.jobs || [];
        }

        // If any order lines included a paper_consume instruction, attempt to call consume endpoint
        if (createdJobs && createdJobs.length > 0) {
            try {
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    const job = createdJobs[i];
                    if (!line || !job) continue;
                    if (line.paper_consume && Array.isArray(line.paper_consume.items) && line.paper_consume.items.length > 0) {
                        try {
                            await api.post(`/jobs/${job.id}/consume-paper`, {
                                items: line.paper_consume.items,
                                stage: 'optimizer-apply',
                                notes: 'Auto-consume from optimizer at billing'
                            });
                        } catch (consumeErr) {
                            console.warn(`[localDb] Auto-consume failed for job ${job.id}:`, consumeErr?.message || consumeErr);
                        }
                    }
                }
            } catch (e) {
                // non-fatal: do not block bill sync on consume errors
                console.warn('[localDb] Auto-consume loop failed:', e?.message || e);
            }
        }

        // Upload matter files for each job (non-blocking, best-effort)
        if (matterFiles && matterFiles.length > 0) {
            for (let i = 0; i < matterFiles.length; i++) {
                const matterFile = matterFiles[i];
                const job = createdJobs[i];
                if (!matterFile || !job?.id) continue;
                try {
                    const fd = new FormData();
                    fd.append('file', matterFile, matterFile.name);
                    fd.append('notes', 'Attached at billing');
                    await api.post(`jobs/${job.id}/matter`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                } catch (err) {
                    console.warn(`Matter file upload failed for job ${job?.id}:`, err.message);
                    // Non-fatal: don't block bill completion
                }
            }
        }

        // Create payment
        await api.post('customer-payments', {
            customer_id: billData.customerId || billData.customer_id || null,
            customer_name: billData.customerName || billData.customer_name,
            customer_mobile: billData.customerMobile || billData.customer_mobile || null,
            total_amount: billData.totalAmount != null ? billData.totalAmount : (billData.total_amount != null ? billData.total_amount : 0),
            net_amount: billData.netAmount != null ? billData.netAmount : (billData.net_amount != null ? billData.net_amount : 0),
            sgst_amount: billData.sgstAmount != null ? billData.sgstAmount : (billData.sgst_amount != null ? billData.sgst_amount : 0),
            cgst_amount: billData.cgstAmount != null ? billData.cgstAmount : (billData.cgst_amount != null ? billData.cgst_amount : 0),
            discount_percent: billData.discountPercent || billData.discount_percent || null,
            discount_amount: billData.discountAmount || billData.discount_amount || null,
            advance_paid: billData.advancePaid != null ? billData.advancePaid : (billData.advance_paid != null ? billData.advance_paid : 0),
            payment_method: billData.paymentMethod || billData.payment_method,
            cash_amount: billData.cashAmount || billData.cash_amount || 0,
            upi_amount: billData.upiAmount || billData.upi_amount || 0,
            cheque_amount: billData.chequeAmount || billData.cheque_amount || 0,
            account_transfer_amount: billData.accountTransferAmount || billData.account_transfer_amount || 0,
            reference_number: billData.referenceNumber || billData.reference_number || null,
            description: billData.description || `Offline bill synced (ref: ${localId})`,
            payment_date: billData.paymentDate || billData.payment_date,
            book_type: billData.book_type || billData.bookType || 'Laser',
            order_lines: lines,
            job_ids: createdJobs.map(j => j.id),
            auto_deliver: billData.auto_deliver || billData.autoDeliver || false,
            is_internal: billData.is_internal || 0,
            internal_department: billData.internal_department || null,
        });

        // Mark as synced
        await offlineDb.updateBillStatus(idbKey, 'synced');
    });

    // Build synthetic payment & jobs so callers can use them immediately (real IDs arrive after background sync)
    const syntheticPayment = {
        id: idbKey,
        invoice_number: localId.replace('BILL-', 'INV-'),
        local: true,
        syncStatus: 'pending'
    };
    const syntheticJobs = (billData.orderLines || billData.order_lines || []).map((line, i) => ({
        id: `${localId}-JOB-${i}`,
        job_number: `L${(i + 1)}`,
        product_id: line.product_id,
        product_name: line.product_name || line.job_name
    }));

    return { ...record, id: idbKey, localId, payment: syntheticPayment, jobs: syntheticJobs };
}

/**
 * Create a payment — saves to IndexedDB immediately, tries server in background.
 */
export async function createPayment(paymentData) {
    const localId = generateLocalId('PAY');
    const record = {
        ...paymentData,
        localId,
        syncStatus: 'pending',
    };

    const idbKey = await offlineDb.savePendingPayment(record);

    // --- Optimistic Update: Refresh local job balances ---
    const jobIds = Array.isArray(paymentData.job_ids) ? paymentData.job_ids : [];
    if (jobIds.length > 0) {
        try {
            const advance = Number(paymentData.advance_paid) || 0;
            // Get current job records from IndexedDB
            const jobs = await Promise.all(jobIds.map(id => offlineDb.getJobById(Number(id))));
            const validJobs = jobs.filter(Boolean);
            
            // Distribute advance among jobs with balance (same logic as server)
            const unpaidJobs = validJobs.filter(j => {
                const bal = Number(j.total_amount) - (Number(j.advance_paid) || 0);
                return bal > 0;
            });
            const totalBalance = unpaidJobs.reduce((sum, j) => sum + (Number(j.total_amount) - (Number(j.advance_paid) || 0)), 0);
            
            let allocated = 0;
            for (let i = 0; i < unpaidJobs.length; i++) {
                const job = unpaidJobs[i];
                const jobTotal = Number(job.total_amount) || 0;
                const jobBalance = jobTotal - (Number(job.advance_paid) || 0);
                let jobAdvanceShare = 0;

                if (totalBalance > 0) {
                    if (i === unpaidJobs.length - 1) {
                        jobAdvanceShare = Math.max(advance - allocated, 0);
                    } else {
                        jobAdvanceShare = (advance * (jobBalance / totalBalance));
                        jobAdvanceShare = Math.round(jobAdvanceShare * 100) / 100;
                        allocated += jobAdvanceShare;
                    }
                }
                
                jobAdvanceShare = Math.min(jobAdvanceShare, jobBalance);
                const currentAdvance = Number(job.advance_paid) || 0;
                const nextAdvance = Math.min(jobTotal, currentAdvance + jobAdvanceShare);
                const nextBalance = jobTotal - nextAdvance;
                const effectiveBalance = nextBalance < 1 ? 0 : nextBalance;
                const effectiveAdvance = effectiveBalance === 0 ? jobTotal : nextAdvance;
                const nextStatus = effectiveBalance === 0 ? 'Paid' : (effectiveAdvance > 0 ? 'Partial' : 'Unpaid');

                // Update local record
                await offlineDb.putJob({
                    ...job,
                    advance_paid: effectiveAdvance,
                    balance_amount: effectiveBalance,
                    payment_status: nextStatus,
                    syncStatus: 'pending_update' // Mark for future reconcilation 
                });
            }
        } catch (localErr) {
            console.warn('[localDb] Optimistic job update failed:', localErr);
        }
    }

    tryServer(async () => {
        await api.post('customer-payments', {
            customer_id: paymentData.customer_id || null,
            customer_name: paymentData.customer_name,
            customer_mobile: paymentData.customer_mobile || null,
            total_amount: paymentData.total_amount,
            net_amount: paymentData.net_amount,
            sgst_amount: paymentData.sgst_amount,
            cgst_amount: paymentData.cgst_amount,
            discount_percent: paymentData.discount_percent || null,
            discount_amount: paymentData.discount_amount || null,
            advance_paid: paymentData.advance_paid,
            payment_method: paymentData.payment_method || 'Cash',
            cash_amount: paymentData.cash_amount || 0,
            upi_amount: paymentData.upi_amount || 0,
            cheque_amount: paymentData.cheque_amount || 0,
            account_transfer_amount: paymentData.account_transfer_amount || 0,
            reference_number: paymentData.reference_number || null,
            description: paymentData.description || `Offline payment synced (ref: ${localId})`,
            payment_date: paymentData.payment_date,
            book_type: paymentData.book_type || 'Offset',
            order_lines: paymentData.order_lines || [],
            job_ids: paymentData.job_ids || [],
            auto_deliver: paymentData.auto_deliver || false,
        });

        await offlineDb.updatePaymentStatus(idbKey, 'synced');
    });

    return { ...record, id: idbKey, localId };
}

/**
 * Update job status — saves to IndexedDB first, tries server in background.
 */
export async function updateJobStatus(jobId, status, extraData = {}) {
    const id = isNaN(jobId) ? jobId : Number(jobId);
    // Update local job record
    const job = await offlineDb.getJobById(id);
    if (job) {
        if (status) job.status = status;
        job.syncStatus = 'pending';
        Object.assign(job, extraData);
        await offlineDb.putJob(job);
    }

    tryServer(async () => {
        await api.put(`jobs/${id}`, { status, ...extraData });
        if (job) {
            job.syncStatus = 'synced';
            await offlineDb.putJob(job);
        }
    });

    return job;
}

/**
 * Update assignment status.
 */
export async function markAssignmentStatus(assignmentId, status) {
    const id = isNaN(assignmentId) ? assignmentId : Number(assignmentId);
    const assignment = await offlineDb.getById('assignments', id);
    if (assignment) {
        assignment.status = status;
        await offlineDb.putRecord('assignments', assignment);
    }

    tryServer(async () => {
        await api.put(`/jobs/assignments/${id}/status`, { status });
    });

    return assignment;
}

/**
 * Log paper usage.
 */
export async function logPaperUsage(jobId, logData) {
    const id = isNaN(jobId) ? jobId : Number(jobId);
    const record = { ...logData, job_id: id, createdAt: Date.now(), syncStatus: 'pending' };
    const localId = await offlineDb.addRecord('paper_logs', record);

    tryServer(async () => {
        await api.post(`/jobs/${id}/paper-logs`, logData);
        await offlineDb.putRecord('paper_logs', { ...record, id: localId, syncStatus: 'synced' });
    });

    return { ...record, id: localId };
}

/**
 * Mark attendance — saves to IndexedDB first, tries server in background.
 */
export async function markAttendance(attendanceData) {
    const localId = generateLocalId('ATT');
    const record = {
        ...attendanceData,
        localId,
        syncStatus: 'pending',
    };

    const idbKey = await offlineDb.saveAttendance(record);

    tryServer(async () => {
        const res = await api.post('front-office/attendance', attendanceData);
        // If server returned the saved attendance row, attach it to local record for auditing
        const serverAttendance = res?.data?.attendance || null;
        try {
            const localRec = await offlineDb.getById('attendance', idbKey);
            if (localRec) {
                if (serverAttendance) {
                    localRec.serverAttendance = serverAttendance;
                    localRec.serverSyncedAt = Date.now();
                    localRec.serverId = serverAttendance.id;
                }
                localRec.syncStatus = 'synced';
                await offlineDb.putRecord('attendance', localRec);
            } else {
                // fallback: mark status only
                await offlineDb.updateAttendanceStatus(idbKey, 'synced');
            }
        } catch (e) {
            // best-effort update; if it fails, still mark as synced
            await offlineDb.updateAttendanceStatus(idbKey, 'synced');
        }
    });

    return { ...record, localId: idbKey };
}

/**
 * Create expense — saves to IndexedDB first, tries server in background.
 */
export async function createExpense(expenseData) {
    const localId = generateLocalId('EXP');
    const record = {
        ...expenseData,
        localId,
        syncStatus: 'pending',
    };

    const idbKey = await offlineDb.saveExpense(record);

    tryServer(async () => {
        await api.post('expenses', expenseData);
        await offlineDb.updateExpenseStatus(idbKey, 'synced');
    });

    return { ...record, localId: idbKey };
}

/**
 * Create a customer — saves to IndexedDB first, tries server in background.
 * Returns the local customer record immediately.
 */
export async function createCustomer(customerData) {
    const normalizedMobile = normalizeCustomerMobile(customerData.mobile);
    const allCustomers = await offlineDb.getAll('customers');
    const existingMatch = allCustomers.find((customer) => {
        if (!customer) return false;
        if (customerData.id != null && String(customer.id) === String(customerData.id)) return true;
        if (customerData.serverId != null && String(customer.serverId ?? customer.id) === String(customerData.serverId)) return true;
        return normalizedMobile && normalizeCustomerMobile(customer.mobile) === normalizedMobile;
    });

    const existingServerId = customerData.serverId ?? existingMatch?.serverId ?? (!isTemporaryCustomerId(customerData.id) ? customerData.id : null) ?? (!isTemporaryCustomerId(existingMatch?.id) ? existingMatch?.id : null);
    const localId = existingMatch?.id ?? (customerData.id && isTemporaryCustomerId(customerData.id) ? customerData.id : generateLocalId('CUST'));
    const record = {
        ...existingMatch,
        ...customerData,
        id: localId,
        mobile: normalizedMobile,
        serverId: existingServerId ?? null,
        syncStatus: 'pending',
        cachedAt: Date.now(),
    };

    await offlineDb.putRecord('customers', record);
    await removeDuplicateCustomerCopies(record.id, normalizedMobile, existingServerId);

    tryServer(async () => {
        const payload = {
            mobile: normalizedMobile,
            name: customerData.name,
            type: customerData.type,
            email: customerData.email,
            gst: customerData.gst,
            address: customerData.address
        };

        if (existingServerId != null) {
            await api.put(`customers/${existingServerId}`, payload);
            const updatedRecord = { ...record, ...payload, id: existingServerId, serverId: existingServerId, syncStatus: 'synced' };
            await offlineDb.putRecord('customers', updatedRecord);
            if (String(record.id) !== String(existingServerId)) {
                await offlineDb.delete('customers', record.id);
            }
            await removeDuplicateCustomerCopies(updatedRecord.id, normalizedMobile, existingServerId);
            return;
        }

        const res = await api.post('customers', payload);
        if (res.data?.id) {
            const updatedRecord = { ...record, ...payload, id: res.data.id, serverId: res.data.id, syncStatus: 'synced' };
            await offlineDb.putRecord('customers', updatedRecord);
            if (String(record.id) !== String(res.data.id)) {
                await offlineDb.delete('customers', record.id);
            }
            await removeDuplicateCustomerCopies(updatedRecord.id, normalizedMobile, res.data.id);
        }
    });

    return record;
}

// ──────────────────── Utility ────────────────────

/**
 * Get last sync timestamp from meta.
 */
export async function getLastSyncTime() {
    return offlineDb.getMeta('lastSyncTime');
}

/**
 * Get all pending counts for the sync status bar.
 */
export async function getPendingCounts() {
    return offlineDb.getAllPendingCounts();
}

/**
 * Check if the local database has any cached data (i.e., first load detection).
 */
export async function hasLocalData() {
    const products = await offlineDb.getCachedProducts();
    return products.length > 0;
}

// Default export with all functions
export default {
    getProducts,
    getProductList,
    getCustomerJobs,
    getFrontOfficeDashboard,
    getStaffWorkHistory,
    getActiveJobs,
    getDueCustomers,
    getOverdueJobs,
    getRecentPayments,
    getDeliveredJobs,
    searchCustomersLocal,
    getVendors,
    saveVendor,
    deleteVendor,
    getVendorLedger,
    getVendorBills,
    createVendorBill,
    getBillsDocuments,
    saveBillDocument,
    deleteBillDocument,
    getPaymentMethods,
    getInventory,
    saveInventoryItem,
    deleteInventoryItem,
    consumeInventory,
    restockInventory,
    getStaffAttendance,
    getExpenseDashboard,
    saveExpensePayment,
    getExpensesByCategory,
    getStaffSalaryCalculation,
    getProductHierarchy,
    getCustomers,
    getCustomerById,
    getBranches,
    getMachines,
    getStaff,
    getPricing,
    getJobs,
    getJobById,
    getCustomerDashboard,
    getJobDetails,
    getPayments,
    getAttendance,
    getExpenses,
    createBill,
    createPayment,
    updateJobStatus,
    markAssignmentStatus,
    logPaperUsage,
    markAttendance,
    createExpense,
    createCustomer,
    getLastSyncTime,
    getPendingCounts,
    hasLocalData,
};
