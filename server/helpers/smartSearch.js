/**
 * AI Smart Search Helper
 * Keyword-based natural language search across customers, jobs, and payments.
 * Parses date references, customer names, product types, and order numbers.
 */
const { pool } = require('../database');

// ─── Natural Language Date Parser ──────────────────────────────

function parseDateReference(query) {
    const now = new Date();
    const lower = query.toLowerCase();
    let startDate = null;
    let endDate = null;

    if (lower.includes('today')) {
        startDate = endDate = now.toISOString().split('T')[0];
    } else if (lower.includes('yesterday')) {
        const d = new Date(now);
        d.setDate(d.getDate() - 1);
        startDate = endDate = d.toISOString().split('T')[0];
    } else if (lower.includes('last week')) {
        const end = new Date(now);
        const start = new Date(now);
        start.setDate(start.getDate() - 7);
        startDate = start.toISOString().split('T')[0];
        endDate = end.toISOString().split('T')[0];
    } else if (lower.includes('last month')) {
        const d = new Date(now);
        d.setMonth(d.getMonth() - 1);
        startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        endDate = lastDay.toISOString().split('T')[0];
    } else if (lower.includes('this month')) {
        startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        endDate = now.toISOString().split('T')[0];
    } else if (lower.includes('this week')) {
        const dayOfWeek = now.getDay();
        const start = new Date(now);
        start.setDate(start.getDate() - dayOfWeek);
        startDate = start.toISOString().split('T')[0];
        endDate = now.toISOString().split('T')[0];
    }

    // Detect explicit dates like "12 Feb", "Feb 12", "2024-02-12"
    const datePatterns = [
        /(\d{4})-(\d{2})-(\d{2})/,                    // 2024-02-12
        /(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*/i,  // 12 Feb
        /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s*(\d{1,2})/i,  // Feb 12
    ];

    const monthMap = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

    if (!startDate) {
        for (const pattern of datePatterns) {
            const match = lower.match(pattern);
            if (match) {
                let d;
                if (match[0].includes('-')) {
                    d = new Date(match[0]);
                } else if (/^\d/.test(match[1])) {
                    const month = monthMap[match[2].substring(0, 3).toLowerCase()];
                    d = new Date(now.getFullYear(), month, parseInt(match[1]));
                } else {
                    const month = monthMap[match[1].substring(0, 3).toLowerCase()];
                    d = new Date(now.getFullYear(), month, parseInt(match[2]));
                }
                if (d && !isNaN(d.getTime())) {
                    startDate = endDate = d.toISOString().split('T')[0];
                }
                break;
            }
        }
    }

    return { startDate, endDate };
}

// ─── Query Parser ──────────────────────────────────────────────

function parseNaturalQuery(query) {
    const result = {
        rawQuery: query,
        keywords: [],
        dates: parseDateReference(query),
        orderNumber: null,
        jobNumber: null,
        amount: null,
        status: null
    };

    // Extract order/job number
    const orderMatch = query.match(/#?(\d{4,})/);
    if (orderMatch) {
        result.orderNumber = orderMatch[1];
        result.jobNumber = orderMatch[1];
    }

    // Extract amount
    const amountMatch = query.match(/₹?\s*(\d+[,\d]*\.?\d*)/);
    if (amountMatch && !result.orderNumber) {
        result.amount = parseFloat(amountMatch[1].replace(/,/g, ''));
    }

    // Extract status keywords
    const statusMap = {
        'pending': 'Pending', 'processing': 'Processing', 'completed': 'Completed',
        'delivered': 'Delivered', 'cancelled': 'Cancelled',
        'unpaid': 'Unpaid', 'paid': 'Paid', 'partial': 'Partial',
        'not delivered': 'Pending', 'delayed': 'Pending', 'overdue': 'Pending'
    };

    for (const [keyword, status] of Object.entries(statusMap)) {
        if (query.toLowerCase().includes(keyword)) {
            result.status = status;
            break;
        }
    }

    // Extract meaningful keywords (remove stop words, dates, numbers)
    const stopWords = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
        'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
        'could', 'should', 'may', 'might', 'shall', 'can', 'need',
        'order', 'job', 'customer', 'bill', 'invoice', 'payment',
        'show', 'find', 'search', 'get', 'list', 'display',
        'me', 'my', 'i', 'we', 'our', 'all', 'any',
        'last', 'this', 'next', 'today', 'yesterday', 'month', 'week',
        'not', 'no', 'rs', 'rupee', 'rupees'
    ]);

    const words = query
        .replace(/[#₹,.\-\/]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 1 && !stopWords.has(w.toLowerCase()) && !/^\d+$/.test(w));

    result.keywords = words;

    return result;
}

// ─── Search Functions ──────────────────────────────────────────

async function searchCustomers(parsed) {
    if (!parsed.keywords.length && !parsed.orderNumber) return [];

    const conditions = [];
    const params = [];

    for (const kw of parsed.keywords) {
        conditions.push('(c.name LIKE ? OR c.mobile LIKE ? OR c.email LIKE ?)');
        params.push(`%${kw}%`, `%${kw}%`, `%${kw}%`);
    }

    if (!conditions.length) return [];

    const [rows] = await pool.query(
        `SELECT c.id, c.name, c.mobile, c.email, c.type, c.address,
                'customer' AS result_type,
                (${conditions.map(() => '1').join(' + ')}) AS relevance
         FROM sarga_customers c
         WHERE ${conditions.join(' OR ')}
         ORDER BY relevance DESC
         LIMIT 10`,
        params
    );

    return rows;
}

async function searchJobs(parsed) {
    const conditions = [];
    const params = [];

    for (const kw of parsed.keywords) {
        conditions.push('(j.job_name LIKE ? OR j.description LIKE ? OR c.name LIKE ? OR j.job_number LIKE ?)');
        params.push(`%${kw}%`, `%${kw}%`, `%${kw}%`, `%${kw}%`);
    }

    if (parsed.jobNumber) {
        conditions.push('(j.job_number LIKE ? OR j.id = ?)');
        params.push(`%${parsed.jobNumber}%`, parsed.jobNumber);
    }

    if (parsed.status) {
        conditions.push('(j.status = ? OR j.payment_status = ?)');
        params.push(parsed.status, parsed.status);
    }

    if (parsed.dates.startDate) {
        conditions.push('j.created_at >= ?');
        params.push(parsed.dates.startDate);
    }
    if (parsed.dates.endDate) {
        conditions.push('j.created_at <= ?');
        params.push(parsed.dates.endDate + ' 23:59:59');
    }

    if (!conditions.length) return [];

    const [rows] = await pool.query(
        `SELECT j.id, j.job_number, j.job_name, j.description, j.quantity,
                j.total_amount, j.status, j.payment_status, j.delivery_date,
                j.created_at, c.name AS customer_name, c.mobile AS customer_mobile,
                'job' AS result_type
         FROM sarga_jobs j
         LEFT JOIN sarga_customers c ON j.customer_id = c.id
         WHERE ${conditions.join(' AND ')}
         ORDER BY j.created_at DESC
         LIMIT 15`,
        params
    );

    return rows;
}

async function searchPayments(parsed) {
    const conditions = [];
    const params = [];

    for (const kw of parsed.keywords) {
        conditions.push('(cp.customer_name LIKE ? OR cp.description LIKE ? OR cp.reference_number LIKE ?)');
        params.push(`%${kw}%`, `%${kw}%`, `%${kw}%`);
    }

    if (parsed.amount) {
        const tolerance = parsed.amount * 0.1; // 10% tolerance
        conditions.push('cp.total_amount BETWEEN ? AND ?');
        params.push(parsed.amount - tolerance, parsed.amount + tolerance);
    }

    if (parsed.dates.startDate) {
        conditions.push('cp.payment_date >= ?');
        params.push(parsed.dates.startDate);
    }
    if (parsed.dates.endDate) {
        conditions.push('cp.payment_date <= ?');
        params.push(parsed.dates.endDate);
    }

    if (!conditions.length) return [];

    const [rows] = await pool.query(
        `SELECT cp.id, cp.customer_name, cp.customer_mobile, cp.total_amount,
                cp.payment_method, cp.payment_date, cp.description,
                cp.balance_amount, cp.reference_number,
                'payment' AS result_type
         FROM sarga_customer_payments cp
         WHERE ${conditions.join(' AND ')}
         ORDER BY cp.payment_date DESC
         LIMIT 15`,
        params
    );

    return rows;
}

// ─── Unified Search ────────────────────────────────────────────

async function unifiedSearch(query) {
    const parsed = parseNaturalQuery(query);

    const [customers, jobs, payments] = await Promise.all([
        searchCustomers(parsed),
        searchJobs(parsed),
        searchPayments(parsed)
    ]);

    return {
        query: parsed,
        results: {
            customers,
            jobs,
            payments
        },
        total: customers.length + jobs.length + payments.length
    };
}

// ─── Autocomplete Suggestions ──────────────────────────────────

async function autocomplete(partial) {
    if (!partial || partial.length < 2) return [];

    const [customers] = await pool.query(
        `SELECT name AS label, 'Customer' AS type FROM sarga_customers
         WHERE name LIKE ? LIMIT 5`,
        [`%${partial}%`]
    );

    const [jobs] = await pool.query(
        `SELECT CONCAT(job_number, ' - ', job_name) AS label, 'Job' AS type
         FROM sarga_jobs WHERE job_name LIKE ? OR job_number LIKE ? LIMIT 5`,
        [`%${partial}%`, `%${partial}%`]
    );

    const [products] = await pool.query(
        `SELECT name AS label, 'Product' AS type FROM sarga_products
         WHERE name LIKE ? LIMIT 5`,
        [`%${partial}%`]
    );

    return [...customers, ...jobs, ...products];
}

module.exports = {
    parseNaturalQuery,
    parseDateReference,
    searchCustomers,
    searchJobs,
    searchPayments,
    unifiedSearch,
    autocomplete
};
