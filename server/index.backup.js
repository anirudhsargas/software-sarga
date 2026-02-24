require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { pool, initDb } = require('./database');
const { authenticateToken, authorizeRoles, JWT_SECRET } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${unique}${ext}`);
    }
});

const fileFilter = (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error('Invalid file type. Only JPG, PNG, WEBP are allowed.'));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

app.use('/uploads', express.static(uploadsDir));

const removeUploadFile = async (imageUrl) => {
    if (!imageUrl || !imageUrl.startsWith('/uploads/')) return;
    const fileName = path.basename(imageUrl);
    const filePath = path.join(uploadsDir, fileName);
    if (!filePath.startsWith(uploadsDir)) return;
    try {
        await fs.promises.unlink(filePath);
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.error('Failed to delete upload:', err);
        }
    }
};

const normalizeMobile = (value) => {
    if (value === null || value === undefined) return '';
    const cleaned = String(value).replace(/\D/g, '');
    return cleaned.slice(-10);
};

// Helper to log actions
const auditLog = async (userId, action, details) => {
    try {
        await pool.query("INSERT INTO sarga_audit_logs (user_id_internal, action, details) VALUES (?, ?, ?)",
            [userId, action, details]);
    } catch (err) {
        console.error("Audit log failed:", err);
    }
};

const getUsageMap = async (userId) => {
    if (!userId) return new Map();
    const [rows] = await pool.query(
        "SELECT entity_type, entity_id, usage_count FROM sarga_product_usage WHERE user_id_internal = ?",
        [userId]
    );
    const map = new Map();
    rows.forEach((row) => {
        map.set(`${row.entity_type}:${row.entity_id}`, Number(row.usage_count) || 0);
    });
    return map;
};

const sortByPositionThenName = (a, b) => {
    const posA = Number(a.position) || 0;
    const posB = Number(b.position) || 0;
    if (posA !== posB) return posA - posB;
    return String(a.name || '').localeCompare(String(b.name || ''));
};

const sortByUsageThenPosition = (usageMap, type) => (a, b) => {
    const usageA = usageMap.get(`${type}:${a.id}`) || 0;
    const usageB = usageMap.get(`${type}:${b.id}`) || 0;
    if (usageA !== usageB) return usageB - usageA;
    return sortByPositionThenName(a, b);
};

const getUserBranchId = async (userId) => {
    if (!userId) return null;
    const [rows] = await pool.query("SELECT branch_id FROM sarga_staff WHERE id = ?", [userId]);
    return rows[0]?.branch_id || null;
};

const hasPendingCustomerBalance = async (customerId) => {
    if (!customerId) return false;
    const [rows] = await pool.query(
        "SELECT COUNT(*) AS pending_count FROM sarga_customer_payments WHERE customer_id = ? AND balance_amount > 0",
        [customerId]
    );
    return Number(rows[0]?.pending_count) > 0;
};

const bumpUsageForUser = async (userId, productId) => {
    if (!userId || !productId) return;
    const [rows] = await pool.query(
        `SELECT p.id AS product_id, p.subcategory_id, s.category_id
         FROM sarga_products p
         JOIN sarga_product_subcategories s ON p.subcategory_id = s.id
         WHERE p.id = ?`,
        [productId]
    );
    if (!rows[0]) return;
    const { subcategory_id, category_id } = rows[0];
    const entries = [
        { entity_type: 'product', entity_id: productId },
        { entity_type: 'subcategory', entity_id: subcategory_id },
        { entity_type: 'category', entity_id: category_id }
    ];

    for (const entry of entries) {
        await pool.query(
            `INSERT INTO sarga_product_usage (user_id_internal, entity_type, entity_id, usage_count)
             VALUES (?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE usage_count = usage_count + 1, last_used_at = CURRENT_TIMESTAMP`,
            [userId, entry.entity_type, entry.entity_id]
        );
    }
};

// --- AUTH ROUTES ---

// Login
app.post('/api/auth/login', async (req, res) => {
    const { user_id, password } = req.body;
    const normalizedUserId = normalizeMobile(user_id);

    if (normalizedUserId.length !== 10) {
        return res.status(400).json({ message: 'Invalid user ID format' });
    }

    try {
        const [users] = await pool.query("SELECT * FROM sarga_staff WHERE RIGHT(user_id, 10) = ?", [normalizedUserId]);
        const user = users[0];

        if (!user) return res.status(401).json({ message: 'Invalid credentials' });

        let validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword && user.is_first_login) {
            const normalizedPassword = normalizeMobile(password);
            if (normalizedPassword.length === 10) {
                validPassword = await bcrypt.compare(normalizedPassword, user.password);
            }

            if (!validPassword && /^\d{10}$/.test(password)) {
                const candidates = [`+91${password}`, `91${password}`];
                for (const candidate of candidates) {
                    if (await bcrypt.compare(candidate, user.password)) {
                        validPassword = true;
                        break;
                    }
                }
            }
        }
        if (!validPassword) return res.status(401).json({ message: 'Invalid credentials' });

        const token = jwt.sign(
            { id: user.id, user_id: user.user_id, role: user.role, branch_id: user.branch_id },
            JWT_SECRET,
            { expiresIn: '8h' }
        );

        auditLog(user.id, 'LOGIN', `User ${user.user_id} logged in`);

        res.json({
            token,
            user: {
                id: user.id,
                user_id: user.user_id,
                role: user.role,
                name: user.name,
                image_url: user.image_url || null,
                is_first_login: !!user.is_first_login
            }
        });
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Change Password
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
    const { newPassword } = req.body;
    const userId = req.user.id;

    try {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.query("UPDATE sarga_staff SET password = ?, is_first_login = 0 WHERE id = ?", [hashedPassword, userId]);

        auditLog(userId, 'PASSWORD_CHANGE', 'User changed their password');
        res.json({ message: 'Password updated successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error updating password' });
    }
});

// Get Current Staff Profile
app.get('/api/staff/me', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT id, user_id, name, role, branch_id, image_url FROM sarga_staff WHERE id = ?",
            [req.user.id]
        );
        if (!rows[0]) return res.status(404).json({ message: 'User not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Update Current Staff Profile
app.put('/api/staff/me', authenticateToken, upload.single('image'), async (req, res) => {
    const { name } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    if (name !== undefined && !String(name).trim()) {
        return res.status(400).json({ message: 'Name is required' });
    }

    try {
        if (imageUrl && name !== undefined) {
            await pool.query(
                "UPDATE sarga_staff SET name = ?, image_url = ? WHERE id = ?",
                [String(name).trim(), imageUrl, req.user.id]
            );
        } else if (imageUrl) {
            await pool.query(
                "UPDATE sarga_staff SET image_url = ? WHERE id = ?",
                [imageUrl, req.user.id]
            );
        } else if (name !== undefined) {
            await pool.query(
                "UPDATE sarga_staff SET name = ? WHERE id = ?",
                [String(name).trim(), req.user.id]
            );
        } else {
            return res.status(400).json({ message: 'No changes provided' });
        }

        const [rows] = await pool.query(
            "SELECT id, user_id, name, role, branch_id, image_url FROM sarga_staff WHERE id = ?",
            [req.user.id]
        );
        auditLog(req.user.id, 'PROFILE_UPDATE', 'Updated profile details');
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// --- BRANCH ROUTES (Admin Only) ---

// List Branches
app.get('/api/branches', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            const branchId = await getUserBranchId(req.user.id);
            const [rows] = await pool.query("SELECT * FROM sarga_branches WHERE id = ?", [branchId]);
            return res.json(rows);
        }
        const [rows] = await pool.query("SELECT * FROM sarga_branches ORDER BY name ASC");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Add Branch
app.post('/api/branches', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const { name, address, phone } = req.body;
    try {
        const [result] = await pool.query(
            "INSERT INTO sarga_branches (name, address, phone) VALUES (?, ?, ?)",
            [name, address, phone]
        );
        res.status(201).json({ id: result.insertId, message: 'Branch added successfully' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Branch name already exists' });
        res.status(500).json({ message: 'Database error' });
    }
});

// Update Branch
app.put('/api/branches/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const { id } = req.params;
    const { name, address, phone } = req.body;
    try {
        await pool.query(
            "UPDATE sarga_branches SET name = ?, address = ?, phone = ? WHERE id = ?",
            [name, address, phone, id]
        );
        res.json({ message: 'Branch updated successfully' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Branch name already exists' });
        res.status(500).json({ message: 'Database error' });
    }
});

// Delete Branch
app.delete('/api/branches/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query("DELETE FROM sarga_branches WHERE id = ?", [id]);
        res.json({ message: 'Branch deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// --- PAYMENT ROUTES ---

// List Payments
app.get('/api/payments', authenticateToken, async (req, res) => {
    const { branch_id, type, startDate, endDate } = req.query;
    try {
        let query = `
            SELECT p.*, b.name as branch_name, v.name as vendor_name
            FROM sarga_payments p
            JOIN sarga_branches b ON p.branch_id = b.id
            LEFT JOIN sarga_vendors v ON p.vendor_id = v.id
            WHERE 1=1
        `;
        const params = [];
        if (req.user.role !== 'Admin') {
            const branchId = await getUserBranchId(req.user.id);
            query += " AND p.branch_id = ?";
            params.push(branchId);
        } else if (branch_id) {
            query += " AND p.branch_id = ?";
            params.push(branch_id);
        }
        if (type) {
            query += " AND p.type = ?";
            params.push(type);
        }
        if (startDate) {
            query += " AND p.payment_date >= ?";
            params.push(startDate);
        }
        if (endDate) {
            query += " AND p.payment_date <= ?";
            params.push(endDate);
        }

        query += " ORDER BY p.payment_date DESC, p.created_at DESC";
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Add Payment
app.post('/api/payments', authenticateToken, async (req, res) => {
    const { branch_id, type, payee_name, amount, payment_method, cash_amount, upi_amount, reference_number, description, payment_date, vendor_id, period_start, period_end } = req.body;

    // Validate "Both" payment method
    if (payment_method === 'Both') {
        const cash = Number(cash_amount) || 0;
        const upi = Number(upi_amount) || 0;
        const total = Number(amount) || 0;

        if (Math.abs(cash + upi - total) > 0.01) {
            return res.status(400).json({ message: 'Cash + UPI must equal total amount' });
        }
    }

    try {
        const finalBranchId = req.user.role === 'Admin' ? branch_id : await getUserBranchId(req.user.id);

        // Convert datetime-local format (YYYY-MM-DDTHH:MM) to MySQL DATETIME format (YYYY-MM-DD HH:MM:SS)
        let mysqlDateTime = payment_date;
        if (payment_date && payment_date.includes('T')) {
            mysqlDateTime = payment_date.replace('T', ' ') + ':00';
        }

        const [result] = await pool.query(
            `INSERT INTO sarga_payments 
            (branch_id, type, payee_name, amount, payment_method, cash_amount, upi_amount, reference_number, description, payment_date, vendor_id, period_start, period_end, staff_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            , [
                finalBranchId,
                type,
                payee_name,
                amount,
                payment_method,
                Number(cash_amount) || 0,
                Number(upi_amount) || 0,
                reference_number,
                description,
                mysqlDateTime,
                vendor_id || null,
                period_start || null,
                period_end || null,
                req.body.staff_id || null
            ]
        );

        // Sync with Staff Salary Payments if applicable
        if (type === 'Salary' && req.body.staff_id) {
            await pool.query(
                `INSERT INTO sarga_staff_salary_payments 
                (staff_id, payment_date, payment_amount, payment_method, reference_number, notes, created_by) 
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    req.body.staff_id,
                    mysqlDateTime,
                    amount,
                    payment_method,
                    reference_number,
                    description,
                    req.user.id
                ]
            );
        }

        auditLog(req.user.id, 'PAYMENT_ADD', `Added ${type} payment of ${amount} to ${payee_name}`);
        res.status(201).json({ id: result.insertId, message: 'Payment recorded successfully' });
    } catch (err) {
        console.error('Payment creation error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// --- PAYMENT METHOD ROUTES ---

// List Payment Methods
app.get('/api/payment-methods', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM sarga_payment_methods WHERE is_active = 1 ORDER BY name ASC");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Add Payment Method (Admin Only)
app.post('/api/payment-methods', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const { name } = req.body;
    if (!name || !String(name).trim()) {
        return res.status(400).json({ message: 'Payment method name is required' });
    }
    try {
        const [result] = await pool.query(
            "INSERT INTO sarga_payment_methods (name, is_active) VALUES (?, 1)",
            [String(name).trim()]
        );
        auditLog(req.user.id, 'PAYMENT_METHOD_ADD', `Added payment method: ${name}`);
        res.status(201).json({ id: result.insertId, message: 'Payment method added successfully' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Payment method already exists' });
        res.status(500).json({ message: 'Database error' });
    }
});

// Update Payment Method (Admin Only)
app.put('/api/payment-methods/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    if (!name || !String(name).trim()) {
        return res.status(400).json({ message: 'Payment method name is required' });
    }
    try {
        await pool.query(
            "UPDATE sarga_payment_methods SET name = ? WHERE id = ?",
            [String(name).trim(), id]
        );
        auditLog(req.user.id, 'PAYMENT_METHOD_UPDATE', `Updated payment method ${id} to: ${name}`);
        res.json({ message: 'Payment method updated successfully' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Payment method already exists' });
        res.status(500).json({ message: 'Database error' });
    }
});

// Delete Payment Method (Admin Only - Soft Delete)
app.delete('/api/payment-methods/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query("UPDATE sarga_payment_methods SET is_active = 0 WHERE id = ?", [id]);
        auditLog(req.user.id, 'PAYMENT_METHOD_DELETE', `Deleted payment method ${id}`);
        res.json({ message: 'Payment method deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// --- PAYMENT ROUTES ---

app.delete('/api/payments/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    try {
        await pool.query("DELETE FROM sarga_payments WHERE id = ?", [req.params.id]);
        auditLog(req.user.id, 'PAYMENT_DELETE', `Deleted payment record ${req.params.id}`);
        res.json({ message: 'Payment record deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// --- VENDOR ROUTES ---

// List Vendors / Payees
app.get('/api/vendors', authenticateToken, async (req, res) => {
    const { type } = req.query;
    const { role, branch_id } = req.user;
    try {
        let query = "SELECT * FROM sarga_vendors";
        const params = [];
        const conditions = [];

        if (type) {
            conditions.push("type = ?");
            params.push(type);
        }

        // Branch-wise visibility
        if (role !== 'Admin') {
            conditions.push("(branch_id IS NULL OR branch_id = ?)");
            params.push(branch_id);
        }

        if (conditions.length > 0) {
            query += " WHERE " + conditions.join(" AND ");
        }

        query += " ORDER BY name ASC";
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Add Vendor / Payee
app.post('/api/vendors', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    const { name, type, contact_person, phone, address, branch_id, order_link, gstin } = req.body;
    // For non-admins, ensure they can only add to their own branch
    const finalBranchId = (req.user.role === 'Admin' ? branch_id : req.user.branch_id) || null;

    try {
        const [result] = await pool.query(
            "INSERT INTO sarga_vendors (name, type, contact_person, phone, address, branch_id, order_link, gstin) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [name, type || 'Vendor', contact_person, phone, address, finalBranchId, order_link, gstin]
        );
        res.json({ id: result.insertId, message: 'Payee added successfully' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Payee name already exists' });
        res.status(500).json({ message: 'Database error' });
    }
});

// Update Vendor / Payee
app.put('/api/vendors/:id', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    const { id } = req.params;
    const { name, type, contact_person, phone, address, branch_id, order_link, gstin } = req.body;

    try {
        // Enforce branch constraint for updates if not admin
        if (req.user.role !== 'Admin') {
            const [existing] = await pool.query("SELECT branch_id FROM sarga_vendors WHERE id = ?", [id]);
            if (existing[0] && existing[0].branch_id !== null && existing[0].branch_id !== req.user.branch_id) {
                return res.status(403).json({ message: 'Access denied to this payee' });
            }
        }

        const finalBranchId = (req.user.role === 'Admin' ? branch_id : req.user.branch_id) || null;

        await pool.query(
            "UPDATE sarga_vendors SET name = ?, type = ?, contact_person = ?, phone = ?, address = ?, branch_id = ?, order_link = ?, gstin = ? WHERE id = ?",
            [name, type, contact_person, phone, address, finalBranchId, order_link, gstin, id]
        );
        res.json({ message: 'Payee updated successfully' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Payee name already exists' });
        res.status(500).json({ message: 'Database error' });
    }
});

// --- VENDOR BILL ROUTES ---

// List Vendor Bills
app.get('/api/vendor-bills', authenticateToken, async (req, res) => {
    const { vendor_id, branch_id } = req.query;
    try {
        let query = `
            SELECT b.*, v.name as vendor_name, br.name as branch_name
            FROM sarga_vendor_bills b
            JOIN sarga_vendors v ON b.vendor_id = v.id
            JOIN sarga_branches br ON b.branch_id = br.id
            WHERE 1=1
        `;
        const params = [];
        if (vendor_id) {
            query += " AND b.vendor_id = ?";
            params.push(vendor_id);
        }
        if (req.user.role !== 'Admin') {
            query += " AND b.branch_id = ?";
            params.push(req.user.branch_id);
        } else if (branch_id) {
            query += " AND b.branch_id = ?";
            params.push(branch_id);
        }
        query += " ORDER BY b.bill_date DESC, b.created_at DESC";
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Add Vendor Bill
app.post('/api/vendor-bills', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    const { vendor_id, bill_number, bill_date, items, branch_id } = req.body;
    const finalBranchId = req.user.role === 'Admin' ? branch_id : req.user.branch_id;

    if (!items || !items.length) return res.status(400).json({ message: 'No items in bill' });

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
        const total_amount = items.reduce((sum, item) => sum + (Number(item.total_cost) || 0), 0);

        const [billResult] = await connection.query(
            "INSERT INTO sarga_vendor_bills (vendor_id, branch_id, bill_number, bill_date, total_amount) VALUES (?, ?, ?, ?, ?)",
            [vendor_id, finalBranchId, bill_number, bill_date, total_amount]
        );

        const billId = billResult.insertId;

        for (const item of items) {
            await connection.query(
                "INSERT INTO sarga_vendor_bill_items (bill_id, inventory_item_id, quantity, unit_cost, total_cost) VALUES (?, ?, ?, ?, ?)",
                [billId, item.inventory_item_id, item.quantity, item.unit_cost, item.total_cost]
            );

            // SYNC WITH INVENTORY: Increase stock
            await connection.query(
                "UPDATE sarga_inventory SET quantity = quantity + ? WHERE id = ?",
                [item.quantity, item.inventory_item_id]
            );
        }

        await connection.commit();
        auditLog(req.user.id, 'VENDOR_BILL_ADD', `Added bill ${bill_number} for vendor ${vendor_id}, total ${total_amount}`);
        res.status(201).json({ id: billId, message: 'Bill recorded and inventory updated' });
    } catch (err) {
        await connection.rollback();
        console.error('Vendor bill error:', err);
        res.status(500).json({ message: 'Database error and rollback' });
    } finally {
        connection.release();
    }
});

// Payee Statement (Transaction History)
app.get('/api/vendors/:id/statement', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const [payments] = await pool.query(`
            SELECT p.*, b.name as branch_name, 'Payment' as entry_type
            FROM sarga_payments p
            JOIN sarga_branches b ON p.branch_id = b.id
            WHERE p.vendor_id = ?
            ORDER BY p.payment_date DESC, p.created_at DESC
        `, [id]);

        const [bills] = await pool.query(`
            SELECT b.*, br.name as branch_name, 'Purchase' as entry_type
            FROM sarga_vendor_bills b
            JOIN sarga_branches br ON b.branch_id = br.id
            WHERE b.vendor_id = ?
            ORDER BY b.bill_date DESC, b.created_at DESC
        `, [id]);

        const [payee] = await pool.query("SELECT * FROM sarga_vendors WHERE id = ?", [id]);

        // Combine and sort by date
        const transactions = [...payments, ...bills].sort((a, b) => {
            const dateA = new Date(a.payment_date || a.bill_date);
            const dateB = new Date(b.payment_date || b.bill_date);
            return dateB - dateA;
        });

        res.json({
            payee: payee[0],
            transactions: transactions
        });
    } catch (err) {
        console.error('Statement error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// --- CUSTOMER PAYMENT ROUTES ---

// List Customer Payments
app.get('/api/customer-payments', authenticateToken, async (req, res) => {
    const { customer_id } = req.query;
    try {
        if (req.user.role !== 'Admin') {
            const branchId = await getUserBranchId(req.user.id);
            try {
                let query = "SELECT * FROM sarga_customer_payments WHERE branch_id = ?";
                const params = [branchId];
                if (customer_id) {
                    query += " AND customer_id = ?";
                    params.push(customer_id);
                }
                query += " ORDER BY payment_date DESC, created_at DESC";
                const [rows] = await pool.query(query, params);
                return res.json(rows);
            } catch (err) {
                if (err.code === 'ER_BAD_FIELD_ERROR') {
                    let query = "SELECT * FROM sarga_customer_payments";
                    const params = [];
                    if (customer_id) {
                        query += " WHERE customer_id = ?";
                        params.push(customer_id);
                    }
                    query += " ORDER BY payment_date DESC, created_at DESC";
                    const [rows] = await pool.query(query, params);
                    return res.json(rows);
                }
                throw err;
            }
        }
        let query = "SELECT * FROM sarga_customer_payments";
        const params = [];
        if (customer_id) {
            query += " WHERE customer_id = ?";
            params.push(customer_id);
        }
        query += " ORDER BY payment_date DESC, created_at DESC";
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Add Customer Payment
app.post('/api/customer-payments', authenticateToken, async (req, res) => {
    const {
        customer_id,
        customer_name,
        customer_mobile,
        total_amount,
        net_amount,
        sgst_amount,
        cgst_amount,
        advance_paid,
        payment_method,
        cash_amount,
        upi_amount,
        reference_number,
        description,
        payment_date,
        order_lines,
        job_ids
    } = req.body;

    if (!customer_name || !String(customer_name).trim()) {
        return res.status(400).json({ message: 'Customer name is required' });
    }

    const total = Number(total_amount) || 0;
    const advance = Number(advance_paid) || 0;
    const cash = Number(cash_amount) || 0;
    const upi = Number(upi_amount) || 0;
    const balance = total - advance;

    if (payment_method === 'Both' && cash + upi !== advance) {
        return res.status(400).json({ message: 'Cash + UPI must equal advance paid' });
    }

    try {
        const branchId = req.user.role === 'Admin' ? null : await getUserBranchId(req.user.id);
        let resolvedCustomerId = customer_id || null;

        if (!resolvedCustomerId && customer_mobile) {
            const normalizedMobile = normalizeMobile(customer_mobile);
            if (normalizedMobile.length === 10) {
                if (req.user.role !== 'Admin' && branchId) {
                    const [rows] = await pool.query(
                        "SELECT id FROM sarga_customers WHERE mobile = ? AND branch_id = ?",
                        [normalizedMobile, branchId]
                    );
                    resolvedCustomerId = rows[0]?.id || null;
                } else {
                    const [rows] = await pool.query(
                        "SELECT id FROM sarga_customers WHERE mobile = ?",
                        [normalizedMobile]
                    );
                    resolvedCustomerId = rows[0]?.id || null;
                }
            }
        }
        let result;
        try {
            [result] = await pool.query(
                `INSERT INTO sarga_customer_payments
                (customer_id, customer_name, customer_mobile, total_amount, net_amount, sgst_amount, cgst_amount, advance_paid, balance_amount, payment_method, cash_amount, upi_amount, reference_number, description, payment_date, order_lines, branch_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    resolvedCustomerId,
                    String(customer_name).trim(),
                    customer_mobile || null,
                    total,
                    Number(net_amount) || 0,
                    Number(sgst_amount) || 0,
                    Number(cgst_amount) || 0,
                    advance,
                    balance,
                    payment_method || 'Cash',
                    cash,
                    upi,
                    reference_number || null,
                    description || null,
                    payment_date,
                    JSON.stringify(order_lines || []),
                    branchId
                ]
            );
        } catch (err) {
            if (err.code === 'ER_BAD_FIELD_ERROR') {
                [result] = await pool.query(
                    `INSERT INTO sarga_customer_payments
                    (customer_id, customer_name, customer_mobile, total_amount, net_amount, sgst_amount, cgst_amount, advance_paid, balance_amount, payment_method, cash_amount, upi_amount, reference_number, description, payment_date, order_lines)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        resolvedCustomerId,
                        String(customer_name).trim(),
                        customer_mobile || null,
                        total,
                        Number(net_amount) || 0,
                        Number(sgst_amount) || 0,
                        Number(cgst_amount) || 0,
                        advance,
                        balance,
                        payment_method || 'Cash',
                        cash,
                        upi,
                        reference_number || null,
                        description || null,
                        payment_date,
                        JSON.stringify(order_lines || [])
                    ]
                );
            } else {
                throw err;
            }
        }
        if (resolvedCustomerId && Array.isArray(order_lines) && order_lines.length > 0 && (!Array.isArray(job_ids) || job_ids.length === 0)) {
            const totalLineAmount = order_lines.reduce((sum, line) => sum + (Number(line.total_amount) || 0), 0);
            let allocatedAdvance = 0;

            for (let i = 0; i < order_lines.length; i += 1) {
                const line = order_lines[i] || {};
                const lineTotal = Number(line.total_amount) || 0;
                let lineAdvance = 0;

                if (totalLineAmount > 0) {
                    if (i === order_lines.length - 1) {
                        lineAdvance = Math.max(advance - allocatedAdvance, 0);
                    } else {
                        lineAdvance = (advance * (lineTotal / totalLineAmount));
                        lineAdvance = Math.round(lineAdvance * 100) / 100;
                        allocatedAdvance += lineAdvance;
                    }
                }

                const lineBalance = lineTotal - lineAdvance;
                const paymentStatus = lineAdvance >= lineTotal ? 'Paid' : (lineAdvance > 0 ? 'Partial' : 'Unpaid');
                const jobNumber = `J-${Date.now().toString().slice(-8)}-${i + 1}`;

                await pool.query(
                    `INSERT INTO sarga_jobs
                    (customer_id, product_id, branch_id, job_number, job_name, description, quantity, unit_price, total_amount, advance_paid, balance_amount, payment_status, delivery_date, applied_extras)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                    , [
                        resolvedCustomerId,
                        line.product_id || null,
                        branchId,
                        jobNumber,
                        line.product_name || line.job_name || 'Job',
                        line.description || null,
                        Number(line.quantity) || 1,
                        Number(line.unit_price) || 0,
                        lineTotal,
                        lineAdvance,
                        lineBalance,
                        paymentStatus,
                        null,
                        JSON.stringify(line.applied_extras || [])
                    ]
                );
            }
        }

        const jobIdsFromLines = Array.isArray(order_lines)
            ? order_lines.map((line) => line?.job_id).filter(Boolean)
            : [];
        const jobIds = Array.from(new Set([...(Array.isArray(job_ids) ? job_ids : []), ...jobIdsFromLines]));

        if (jobIds.length > 0) {
            const [jobs] = await pool.query(
                `SELECT id, total_amount, advance_paid
                 FROM sarga_jobs
                 WHERE id IN (${jobIds.map(() => '?').join(',')})`,
                jobIds
            );

            const totalJobAmount = jobs.reduce((sum, job) => sum + (Number(job.total_amount) || 0), 0);
            let allocated = 0;

            for (let i = 0; i < jobs.length; i += 1) {
                const job = jobs[i];
                const jobTotal = Number(job.total_amount) || 0;
                let jobAdvance = 0;

                if (totalJobAmount > 0) {
                    if (i === jobs.length - 1) {
                        jobAdvance = Math.max(advance - allocated, 0);
                    } else {
                        jobAdvance = (advance * (jobTotal / totalJobAmount));
                        jobAdvance = Math.round(jobAdvance * 100) / 100;
                        allocated += jobAdvance;
                    }
                }

                const currentAdvance = Number(job.advance_paid) || 0;
                const nextAdvance = Math.min(jobTotal, currentAdvance + jobAdvance);
                const nextBalance = jobTotal - nextAdvance;
                const nextStatus = nextAdvance >= jobTotal ? 'Paid' : (nextAdvance > 0 ? 'Partial' : 'Unpaid');

                await pool.query(
                    "UPDATE sarga_jobs SET advance_paid = ?, balance_amount = ?, payment_status = ? WHERE id = ?",
                    [nextAdvance, nextBalance, nextStatus, job.id]
                );
            }
        }

        auditLog(req.user.id, 'CUSTOMER_PAYMENT_ADD', `Added customer payment ${result.insertId} for ${customer_name}`);
        res.status(201).json({ id: result.insertId, balance_amount: balance, message: 'Customer payment recorded' });
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// --- DASHBOARD STATS ---
app.get('/api/stats/dashboard', authenticateToken, async (req, res) => {
    const { branch_id, startDate, endDate } = req.query;
    try {
        let baseWhere = " WHERE 1=1";
        const params = [];

        if (req.user.role !== 'Admin') {
            const branchId = await getUserBranchId(req.user.id);
            baseWhere += " AND branch_id = ?";
            params.push(branchId);
        } else if (branch_id) {
            baseWhere += " AND branch_id = ?";
            params.push(branch_id);
        }

        if (startDate) {
            baseWhere += " AND created_at >= ?";
            params.push(startDate);
        }
        if (endDate) {
            baseWhere += " AND created_at <= ?";
            params.push(endDate);
        }

        // 1. Overall Job Stats
        const jobQuery = `SELECT COUNT(*) as total_jobs, SUM(total_amount) as total_sales, SUM(advance_paid) as total_collected, SUM(balance_amount) as total_balance FROM sarga_jobs ${baseWhere}`;

        // 2. Payment Stats (Needs separate params for payment_date filter if needed, but here we likely want same date range logic)
        // Note: Payments table uses 'payment_date', Jobs uses 'created_at'.
        // To be simpler, we'll re-construct the payment params for the payment query
        let payWhere = " WHERE 1=1";
        const payParams = [];
        if (req.user.role !== 'Admin') {
            const branchId = await getUserBranchId(req.user.id);
            payWhere += " AND branch_id = ?";
            payParams.push(branchId);
        } else if (branch_id) {
            payWhere += " AND branch_id = ?";
            payParams.push(branch_id);
        }
        if (startDate) {
            payWhere += " AND payment_date >= ?";
            payParams.push(startDate);
        }
        if (endDate) {
            payWhere += " AND payment_date <= ?";
            payParams.push(endDate);
        }
        const payQuery = `SELECT SUM(amount) as total_payments FROM sarga_payments ${payWhere}`;

        // 3. Recent Jobs
        const recentJobsQuery = `
            SELECT j.id, j.job_number, j.job_name, j.total_amount, j.status, j.payment_status, j.created_at,
                   COALESCE(c.name, 'Walk-in') as customer_name
            FROM sarga_jobs j
            LEFT JOIN sarga_customers c ON j.customer_id = c.id
            ${baseWhere}
            ORDER BY j.created_at DESC
            LIMIT 5
        `;

        // 4. Counts by Job Status
        const statusQuery = `SELECT status, COUNT(*) as count FROM sarga_jobs ${baseWhere} GROUP BY status`;

        // 5. Counts by Payment Status
        const paymentStatusQuery = `SELECT payment_status, COUNT(*) as count FROM sarga_jobs ${baseWhere} GROUP BY payment_status`;

        const [[jobStats]] = await pool.query(jobQuery, params);
        const [[payStats]] = await pool.query(payQuery, payParams);
        const [recentJobs] = await pool.query(recentJobsQuery, params);
        const [statusCounts] = await pool.query(statusQuery, params);
        const [paymentCounts] = await pool.query(paymentStatusQuery, params);

        // Transform counts into objects
        const statusMap = {};
        statusCounts.forEach(r => statusMap[r.status] = r.count);

        const paymentMap = {};
        paymentCounts.forEach(r => paymentMap[r.payment_status] = r.count);

        res.json({
            jobs: {
                total_count: jobStats.total_jobs || 0,
                total_sales: Number(jobStats.total_sales) || 0,
                total_collected: Number(jobStats.total_collected) || 0,
                total_balance: Number(jobStats.total_balance) || 0
            },
            payments: {
                total_amount: Number(payStats.total_payments) || 0
            },
            net_profit: (Number(jobStats.total_collected) || 0) - (Number(payStats.total_payments) || 0),
            recent_jobs: recentJobs,
            status_counts: statusMap,
            payment_counts: paymentMap
        });
    } catch (err) {
        console.error("Dashboard stats error:", err);
        res.status(500).json({ message: 'Database error' });
    }
});

// --- STAFF ROUTES (Admin Only) ---

// Add Staff
app.post('/api/staff', authenticateToken, authorizeRoles('Admin'), upload.single('image'), async (req, res) => {
    const { mobile, name, role, branch_id } = req.body;
    const normalizedMobile = normalizeMobile(mobile);
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    if (normalizedMobile.length !== 10) {
        return res.status(400).json({ message: 'Mobile number must be 10 digits' });
    }

    try {
        const hashedPassword = await bcrypt.hash(normalizedMobile, 10);
        const [result] = await pool.query(
            "INSERT INTO sarga_staff (user_id, password, role, name, is_first_login, branch_id, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [normalizedMobile, hashedPassword, role, name, 1, branch_id || null, imageUrl]
        );

        auditLog(req.user.id, 'STAFF_ADD', `Added staff ${mobile} as ${role} for branch ${branch_id}`);
        res.status(201).json({ id: result.insertId, message: 'Staff added successfully' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'User ID already exists' });
        res.status(500).json({ message: 'Database error' });
    }
});

// List Staff
app.get('/api/staff', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            const branchId = await getUserBranchId(req.user.id);
            const [rows] = await pool.query(`
                SELECT s.id, s.user_id, s.name, s.role, s.is_first_login, s.created_at, s.branch_id, s.image_url, s.salary_type, s.base_salary, s.daily_rate, b.name as branch_name 
                FROM sarga_staff s 
                LEFT JOIN sarga_branches b ON s.branch_id = b.id 
                WHERE s.role != 'Admin' AND s.branch_id = ?
                ORDER BY s.created_at DESC
            `, [branchId]);
            return res.json(rows);
        }
        const [rows] = await pool.query(`
            SELECT s.id, s.user_id, s.name, s.role, s.is_first_login, s.created_at, s.branch_id, s.image_url, s.salary_type, s.base_salary, s.daily_rate, b.name as branch_name 
            FROM sarga_staff s 
            LEFT JOIN sarga_branches b ON s.branch_id = b.id 
            WHERE s.role != 'Admin' 
            ORDER BY s.created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Update Staff
app.put('/api/staff/:id', authenticateToken, upload.single('image'), async (req, res) => {
    let { id } = req.params;
    if (id === 'me') id = req.user.id;

    // Authorization: Admin or Self (for profile updates only)
    if (req.user.role !== 'Admin' && req.user.id != id) {
        return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }

    const { mobile, name, role, branch_id, salary_type, base_salary, daily_rate } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    // Non-Admin users can ONLY update their own name and image (profile updates)
    // They CANNOT change mobile, role, or branch_id
    if (req.user.role !== 'Admin') {
        if (mobile || role || branch_id) {
            return res.status(403).json({ message: 'Only Admin can modify user ID, role, or branch assignment.' });
        }

        // Profile update only (name and/or image)
        if (!name && !imageUrl) {
            return res.status(400).json({ message: 'No changes provided' });
        }

        try {
            if (name && imageUrl) {
                await pool.query("UPDATE sarga_staff SET name = ?, image_url = ? WHERE id = ?", [name, imageUrl, id]);
            } else if (name) {
                await pool.query("UPDATE sarga_staff SET name = ? WHERE id = ?", [name, id]);
            } else if (imageUrl) {
                await pool.query("UPDATE sarga_staff SET image_url = ? WHERE id = ?", [imageUrl, id]);
            }
            // Return updated info
            const [rows] = await pool.query("SELECT id, user_id, name, role, branch_id, image_url FROM sarga_staff WHERE id = ?", [id]);
            return res.json(rows[0]);
        } catch (err) {
            return res.status(500).json({ message: 'Database error' });
        }
    }

    // Admin can update everything
    // If mobile is NOT provided, it's a partial update (name/image/role/branch/salary only)
    if (!mobile) {
        if (!name && !imageUrl && !role && !branch_id && !salary_type) {
            return res.status(400).json({ message: 'No changes provided' });
        }
        try {
            const updates = [];
            const values = [];

            if (name) {
                updates.push("name = ?");
                values.push(name);
            }
            if (imageUrl) {
                updates.push("image_url = ?");
                values.push(imageUrl);
            }
            if (role) {
                updates.push("role = ?");
                values.push(role);
            }
            if (branch_id !== undefined) {
                updates.push("branch_id = ?");
                values.push(branch_id || null);
            }
            if (salary_type) {
                updates.push("salary_type = ?");
                values.push(salary_type);
            }
            if (salary_type === 'Monthly' && base_salary !== undefined) {
                updates.push("base_salary = ?");
                values.push(base_salary || 0);
                // Clear daily_rate when switching to monthly or updating monthly
                updates.push("daily_rate = NULL");
            }
            if (salary_type === 'Daily' && daily_rate !== undefined) {
                updates.push("daily_rate = ?");
                values.push(daily_rate || 0);
                // Clear base_salary when switching to daily or updating daily
                updates.push("base_salary = NULL");
            }

            values.push(id);
            await pool.query(`UPDATE sarga_staff SET ${updates.join(', ')} WHERE id = ?`, values);

            const [rows] = await pool.query("SELECT id, user_id, name, role, branch_id, image_url, salary_type, base_salary, daily_rate FROM sarga_staff WHERE id = ?", [id]);
            return res.json(rows[0]);
        } catch (err) {
            return res.status(500).json({ message: 'Database error' });
        }
    }

    // Full update with mobile (user_id change)
    const normalizedMobile = normalizeMobile(mobile);

    if (normalizedMobile.length !== 10) {
        return res.status(400).json({ message: 'Mobile number must be 10 digits' });
    }

    try {
        let query, params;

        if (imageUrl) {
            query = "UPDATE sarga_staff SET user_id = ?, name = ?, role = ?, branch_id = ?, image_url = ?";
            params = [normalizedMobile, name, role, branch_id || null, imageUrl];
        } else {
            query = "UPDATE sarga_staff SET user_id = ?, name = ?, role = ?, branch_id = ?";
            params = [normalizedMobile, name, role, branch_id || null];
        }

        // Add salary fields if provided
        if (salary_type) {
            query += ", salary_type = ?";
            params.push(salary_type);
        }
        if (salary_type === 'Monthly' && base_salary !== undefined) {
            query += ", base_salary = ?, daily_rate = NULL";
            params.push(base_salary || 0);
        }
        if (salary_type === 'Daily' && daily_rate !== undefined) {
            query += ", daily_rate = ?, base_salary = NULL";
            params.push(daily_rate || 0);
        }

        query += " WHERE id = ?";
        params.push(id);

        await pool.query(query, params);
        auditLog(req.user.id, 'STAFF_UPDATE', `Updated staff member ${id}: ${name} (${role})`);
        res.json({ message: 'Staff member updated successfully' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'User ID already exists' });
        res.status(500).json({ message: 'Database error' });
    }
});

// Delete Staff
app.delete('/api/staff/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const { id } = req.params;

    try {
        await pool.query("DELETE FROM sarga_staff WHERE id = ?", [id]);
        auditLog(req.user.id, 'STAFF_DELETE', `Deleted staff member ID: ${id}`);
        res.json({ message: 'Staff member deleted successfully' });
    } catch (err) {
        console.error("Delete staff error:", err);
        res.status(500).json({ message: 'Database error' });
    }
});

// Delete Staff Image
app.delete('/api/staff/:id/image', authenticateToken, async (req, res) => {
    let { id } = req.params;
    if (id === 'me') id = req.user.id;

    if (req.user.role !== 'Admin' && req.user.id != id) {
        return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }

    try {
        const [rows] = await pool.query("SELECT image_url FROM sarga_staff WHERE id = ?", [id]);
        if (!rows[0]) return res.status(404).json({ message: 'Staff member not found' });

        const imageUrl = rows[0].image_url;
        if (imageUrl) await removeUploadFile(imageUrl);

        await pool.query("UPDATE sarga_staff SET image_url = NULL WHERE id = ?", [id]);
        res.json({ message: 'Staff image removed', image_url: null });
    } catch (err) {
        console.error('Remove staff image error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// Reset Staff Password (to their mobile/user_id)
app.put('/api/staff/:id/reset-password', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const { id } = req.params;

    try {
        const [users] = await pool.query("SELECT user_id FROM sarga_staff WHERE id = ?", [id]);
        if (!users[0]) return res.status(404).json({ message: 'Staff member not found' });

        const normalizedMobile = normalizeMobile(users[0].user_id);
        const newHashedPassword = await bcrypt.hash(normalizedMobile, 10);
        await pool.query("UPDATE sarga_staff SET password = ?, is_first_login = 1 WHERE id = ?", [newHashedPassword, id]);

        auditLog(req.user.id, 'STAFF_PASSWORD_RESET', `Reset password for staff member ${id}`);
        res.json({ message: 'Password reset to mobile number successfully' });
    } catch (err) {
        console.error("Reset password error:", err);
        res.status(500).json({ message: 'Database error' });
    }
});

// --- USER ID CHANGE REQUESTS ---

// Request Change
app.post('/api/requests/id-change', authenticateToken, async (req, res) => {
    const { new_user_id } = req.body;
    const userId = req.user.id;
    const oldUserId = req.user.user_id;

    try {
        await pool.query("INSERT INTO sarga_id_requests (user_id_internal, old_user_id, new_user_id) VALUES (?, ?, ?)",
            [userId, oldUserId, new_user_id]);
        auditLog(userId, 'ID_CHANGE_REQUEST', `Requested change to ${new_user_id}`);
        res.json({ message: 'Request submitted for admin approval' });
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Admin Review Requests
app.get('/api/requests/id-change', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    try {
        const [rows] = await pool.query(`SELECT r.*, u.name FROM sarga_id_requests r 
                                     JOIN sarga_staff u ON r.user_id_internal = u.id 
                                     WHERE r.status = 'PENDING'`);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Approve/Reject ID Change
app.post('/api/requests/id-change/:id/review', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const { action } = req.body;
    const requestId = req.params.id;

    try {
        const [requests] = await pool.query("SELECT * FROM sarga_id_requests WHERE id = ?", [requestId]);
        const request = requests[0];

        if (!request) return res.status(404).json({ message: 'Request not found' });

        if (action === 'APPROVE') {
            await pool.query("UPDATE sarga_staff SET user_id = ? WHERE id = ?", [request.new_user_id, request.user_id_internal]);
            await pool.query("UPDATE sarga_id_requests SET status = 'APPROVED', resolved_at = CURRENT_TIMESTAMP WHERE id = ?", [requestId]);
            auditLog(req.user.id, 'ID_CHANGE_APPROVE', `Approved ID change for user ${request.user_id_internal} to ${request.new_user_id}`);
            res.json({ message: 'Request approved and ID updated' });
        } else {
            await pool.query("UPDATE sarga_id_requests SET status = 'REJECTED', resolved_at = CURRENT_TIMESTAMP WHERE id = ?", [requestId]);
            auditLog(req.user.id, 'ID_CHANGE_REJECT', `Rejected ID change for user ${request.user_id_internal}`);
            res.json({ message: 'Request rejected' });
        }
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// --- CUSTOMER CHANGE REQUESTS ---

// Request customer edit/delete
app.post('/api/requests/customer-change', authenticateToken, async (req, res) => {
    const { customer_id, action, payload, note } = req.body;

    if (!customer_id || !action) {
        return res.status(400).json({ message: 'Customer and action are required' });
    }

    if (!['EDIT', 'DELETE'].includes(String(action).toUpperCase())) {
        return res.status(400).json({ message: 'Invalid action' });
    }

    try {
        const [rows] = await pool.query("SELECT id FROM sarga_customers WHERE id = ?", [customer_id]);
        if (!rows[0]) return res.status(404).json({ message: 'Customer not found' });

        if (String(action).toUpperCase() === 'DELETE' && req.user.role !== 'Admin') {
            const hasPending = await hasPendingCustomerBalance(customer_id);
            if (hasPending) {
                return res.status(400).json({ message: 'Customer has pending balance and cannot be deleted' });
            }
        }

        await pool.query(
            "INSERT INTO sarga_customer_requests (requester_id, customer_id, action, payload, note) VALUES (?, ?, ?, ?, ?)",
            [req.user.id, customer_id, String(action).toUpperCase(), payload ? JSON.stringify(payload) : null, note || null]
        );
        auditLog(req.user.id, 'CUSTOMER_REQUEST', `Requested ${action} for customer ${customer_id}`);
        res.json({ message: 'Request submitted for admin approval' });
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// List customer change requests (Admin)
app.get('/api/requests/customer-change', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT r.*, s.name AS requester_name, c.name AS customer_name
            FROM sarga_customer_requests r
            JOIN sarga_staff s ON r.requester_id = s.id
            JOIN sarga_customers c ON r.customer_id = c.id
            WHERE r.status = 'PENDING'
            ORDER BY r.created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Approve/Reject customer change requests (Admin)
app.post('/api/requests/customer-change/:id/review', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const { action } = req.body;
    const requestId = req.params.id;

    try {
        const [requests] = await pool.query("SELECT * FROM sarga_customer_requests WHERE id = ?", [requestId]);
        const request = requests[0];
        if (!request) return res.status(404).json({ message: 'Request not found' });

        if (action === 'APPROVE') {
            if (request.action === 'DELETE') {
                await pool.query("DELETE FROM sarga_customers WHERE id = ?", [request.customer_id]);
                auditLog(req.user.id, 'CUSTOMER_DELETE_APPROVE', `Approved delete for customer ${request.customer_id}`);
            }

            if (request.action === 'EDIT') {
                const payload = request.payload ? JSON.parse(request.payload) : {};
                const normalizedMobile = payload.mobile ? normalizeMobile(payload.mobile) : null;

                if (normalizedMobile && normalizedMobile.length !== 10) {
                    return res.status(400).json({ message: 'Mobile number must be 10 digits' });
                }

                await pool.query(
                    "UPDATE sarga_customers SET mobile = COALESCE(?, mobile), name = COALESCE(?, name), type = COALESCE(?, type), email = COALESCE(?, email), gst = COALESCE(?, gst), address = COALESCE(?, address) WHERE id = ?",
                    [
                        normalizedMobile,
                        payload.name || null,
                        payload.type || null,
                        payload.email || null,
                        payload.gst || null,
                        payload.address || null,
                        request.customer_id
                    ]
                );
                auditLog(req.user.id, 'CUSTOMER_EDIT_APPROVE', `Approved edit for customer ${request.customer_id}`);
            }

            await pool.query("UPDATE sarga_customer_requests SET status = 'APPROVED', resolved_at = CURRENT_TIMESTAMP WHERE id = ?", [requestId]);
            return res.json({ message: 'Request approved' });
        }

        await pool.query("UPDATE sarga_customer_requests SET status = 'REJECTED', resolved_at = CURRENT_TIMESTAMP WHERE id = ?", [requestId]);
        res.json({ message: 'Request rejected' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Mobile number already exists' });
        res.status(500).json({ message: 'Database error' });
    }
});

// --- CUSTOMER ROUTES ---

// List Customers
app.get('/api/customers', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            const branchId = await getUserBranchId(req.user.id);
            const [rows] = await pool.query("SELECT * FROM sarga_customers WHERE branch_id = ? ORDER BY name ASC", [branchId]);
            return res.json(rows);
        }
        const [rows] = await pool.query("SELECT * FROM sarga_customers ORDER BY name ASC");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Get Customer Details
app.get('/api/customers/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        if (req.user.role !== 'Admin') {
            const branchId = await getUserBranchId(req.user.id);
            const [rows] = await pool.query("SELECT * FROM sarga_customers WHERE id = ? AND branch_id = ?", [id, branchId]);
            if (!rows[0]) return res.status(404).json({ message: 'Customer not found' });
            return res.json(rows[0]);
        }
        const [rows] = await pool.query("SELECT * FROM sarga_customers WHERE id = ?", [id]);
        if (!rows[0]) return res.status(404).json({ message: 'Customer not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Add Customer
app.post('/api/customers', authenticateToken, async (req, res) => {
    const { mobile, name, type, email, gst, address } = req.body;
    const normalizedMobile = normalizeMobile(mobile);

    if (normalizedMobile.length !== 10) {
        return res.status(400).json({ message: 'Mobile number must be 10 digits' });
    }

    try {
        const branchId = req.user.role === 'Admin' ? null : await getUserBranchId(req.user.id);
        const [result] = await pool.query(
            "INSERT INTO sarga_customers (mobile, name, type, email, gst, address, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [normalizedMobile, name, type, email, gst, address, branchId]
        );
        auditLog(req.user.id, 'CUSTOMER_ADD', `Added customer ${name} (${normalizedMobile})`);
        res.status(201).json({ id: result.insertId, message: 'Customer added successfully' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Mobile number already exists' });
        res.status(500).json({ message: 'Database error' });
    }
});

// Update Customer
app.put('/api/customers/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { mobile, name, type, email, gst, address } = req.body;
    const normalizedMobile = normalizeMobile(mobile);

    if (normalizedMobile.length !== 10) {
        return res.status(400).json({ message: 'Mobile number must be 10 digits' });
    }

    try {
        await pool.query(
            "UPDATE sarga_customers SET mobile = ?, name = ?, type = ?, email = ?, gst = ?, address = ? WHERE id = ?",
            [normalizedMobile, name, type, email, gst, address, id]
        );
        auditLog(req.user.id, 'CUSTOMER_UPDATE', `Updated customer ${id} (${name})`);
        res.json({ message: 'Customer details updated' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Mobile number already exists' });
        res.status(500).json({ message: 'Database error' });
    }
});

// Delete Customer
app.delete('/api/customers/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const { id } = req.params;

    try {
        await pool.query("DELETE FROM sarga_customers WHERE id = ?", [id]);
        auditLog(req.user.id, 'CUSTOMER_DELETE', `Deleted customer ${id}`);
        res.json({ message: 'Customer deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// --- JOB ROUTES ---

// List All Jobs (with Customer details)
app.get('/api/jobs', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            const branchId = await getUserBranchId(req.user.id);
            const [rows] = await pool.query(`
                SELECT j.*, 
                       COALESCE(c.name, 'Walk-in') as customer_name, 
                       c.mobile as customer_mobile,
                       b.name as branch_name 
                FROM sarga_jobs j
                LEFT JOIN sarga_customers c ON j.customer_id = c.id
                LEFT JOIN sarga_branches b ON j.branch_id = b.id
                WHERE j.branch_id = ?
                ORDER BY j.created_at DESC
            `, [branchId]);
            return res.json(rows);
        }
        const [rows] = await pool.query(`
            SELECT j.*, 
                   COALESCE(c.name, 'Walk-in') as customer_name, 
                   c.mobile as customer_mobile,
                   b.name as branch_name 
            FROM sarga_jobs j
            LEFT JOIN sarga_customers c ON j.customer_id = c.id
            LEFT JOIN sarga_branches b ON j.branch_id = b.id
            ORDER BY j.created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// List Jobs for a specific Customer
app.get('/api/customers/:id/jobs', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM sarga_jobs WHERE customer_id = ? ORDER BY created_at DESC", [req.params.id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Bulk create jobs for multiple line items
app.post('/api/jobs/bulk', authenticateToken, async (req, res) => {
    const { customer_id, order_lines } = req.body;

    if (!Array.isArray(order_lines) || order_lines.length === 0) {
        return res.status(400).json({ message: 'Order lines are required' });
    }

    try {
        const branchId = req.user.role === 'Admin' ? null : await getUserBranchId(req.user.id);
        const created = [];

        for (let i = 0; i < order_lines.length; i += 1) {
            const line = order_lines[i] || {};
            const jobNumber = `J-${Date.now().toString().slice(-8)}-${i + 1}`;
            const total = Number(line.total_amount) || 0;

            try {
                const [result] = await pool.query(
                    `INSERT INTO sarga_jobs
                    (customer_id, product_id, branch_id, job_number, job_name, description, quantity, unit_price, total_amount, advance_paid, balance_amount, payment_status, delivery_date, applied_extras)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        customer_id || null,
                        line.product_id || null,
                        branchId,
                        jobNumber,
                        line.product_name || line.job_name || 'Job',
                        line.description || null,
                        Number(line.quantity) || 1,
                        Number(line.unit_price) || 0,
                        total,
                        0,
                        total,
                        'Unpaid',
                        null,
                        JSON.stringify(line.applied_extras || [])
                    ]
                );
                created.push({ id: result.insertId, job_number: jobNumber });
            } catch (err) {
                if (err.code === 'ER_BAD_FIELD_ERROR') {
                    const [result] = await pool.query(
                        `INSERT INTO sarga_jobs
                        (customer_id, job_number, job_name, description, quantity, unit_price, total_amount, advance_paid, balance_amount, payment_status, delivery_date)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            customer_id || null,
                            jobNumber,
                            line.product_name || line.job_name || 'Job',
                            line.description || null,
                            Number(line.quantity) || 1,
                            Number(line.unit_price) || 0,
                            total,
                            0,
                            total,
                            'Unpaid',
                            null
                        ]
                    );
                    created.push({ id: result.insertId, job_number: jobNumber });
                } else {
                    throw err;
                }
            }
        }

        res.status(201).json({ jobs: created });
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// --- HELPER: PRICING ENGINE ---
const calculateProductPrice = (product, quantity, slabs) => {
    let result = { unit_price: 0, total: 0 };
    const qty = Number(quantity) || 0;

    if (product.calculation_type === 'Normal') {
        const rate = slabs && slabs.length > 0 ? slabs[0].unit_rate : 0;
        result = { unit_price: rate, total: rate * qty };
    } else if (product.calculation_type === 'Slab') {
        // Linear Interpolation
        if (slabs && slabs.length > 0) {
            const sortedSlabs = [...slabs].sort((a, b) => a.min_qty - b.min_qty);
            const exactMatch = sortedSlabs.find(s => Number(s.min_qty) === qty);

            if (exactMatch) {
                result.total = Number(exactMatch.base_value);
            } else if (qty < sortedSlabs[0].min_qty) {
                result.total = Number(sortedSlabs[0].base_value);
            } else if (qty > sortedSlabs[sortedSlabs.length - 1].min_qty) {
                result.total = Number(sortedSlabs[sortedSlabs.length - 1].base_value);
            } else {
                for (let i = 0; i < sortedSlabs.length - 1; i++) {
                    const s1 = sortedSlabs[i];
                    const s2 = sortedSlabs[i + 1];
                    if (qty > s1.min_qty && qty < s2.min_qty) {
                        const ratio = (qty - s1.min_qty) / (s2.min_qty - s1.min_qty);
                        result.total = Number(s1.base_value) + ratio * (s2.base_value - s1.base_value);
                        break;
                    }
                }
            }
            result.unit_price = qty > 0 ? result.total / qty : 0;
        }
    } else if (product.calculation_type === 'Range') {
        if (slabs && slabs.length > 0) {
            const sortedSlabs = [...slabs].sort((a, b) => a.min_qty - b.min_qty);
            const matched = sortedSlabs.find(s => {
                const maxQty = s.max_qty === null || s.max_qty === undefined || s.max_qty === '' ? Infinity : Number(s.max_qty);
                return qty >= Number(s.min_qty) && qty <= maxQty;
            });
            if (matched) {
                const rate = Number(matched.unit_rate) || 0;
                result = { unit_price: rate, total: rate * qty };
            }
        }
    }

    // Add Paper Rate Add-on if applicable (Slab only)
    if (product.calculation_type === 'Slab' && product.has_paper_rate && product.paper_rate > 0) {
        result.total += (Number(product.paper_rate) * qty);
        result.unit_price = qty > 0 ? result.total / qty : 0;
    }

    return result;
};

// --- UPDATE JOB ROUTE TO USE NEW PRICING ---
app.post('/api/jobs', authenticateToken, async (req, res) => {
    const {
        customer_id, product_id, branch_id, job_name, description, quantity,
        unit_price, total_amount, advance_paid, delivery_date, applied_extras
    } = req.body;

    const balance_amount = (total_amount || 0) - (advance_paid || 0);
    const payment_status = advance_paid >= total_amount ? 'Paid' : (advance_paid > 0 ? 'Partial' : 'Unpaid');
    const job_number = `J-${Date.now().toString().slice(-8)}`;

    try {
        const [result] = await pool.query(
            `INSERT INTO sarga_jobs 
            (customer_id, product_id, branch_id, job_number, job_name, description, quantity, unit_price, total_amount, advance_paid, balance_amount, payment_status, delivery_date, applied_extras) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            , [customer_id || null, product_id || null, branch_id || null, job_number, job_name, description, quantity, unit_price, total_amount, advance_paid, balance_amount, payment_status, delivery_date || null, JSON.stringify(applied_extras || [])]
        );

        if (product_id) {
            await bumpUsageForUser(req.user.id, product_id);
        }

        auditLog(req.user.id, 'JOB_CREATE', `Created job ${job_number} for customer ${customer_id || 'walk-in'} in branch ${branch_id}`);
        res.status(201).json({ id: result.insertId, job_number, message: 'Job created successfully' });
    } catch (err) {
        console.error("Job create error:", err);
        res.status(500).json({ message: 'Database error' });
    }
});

// Fetch Hierarchy Tree
app.get('/api/product-hierarchy', authenticateToken, async (req, res) => {
    try {
        // Always fetch usage map for the current user to personalize sorting
        const usageMap = await getUsageMap(req.user.id);

        const [categories] = await pool.query("SELECT * FROM sarga_product_categories");
        const [subcategories] = await pool.query("SELECT * FROM sarga_product_subcategories");
        const [products] = await pool.query("SELECT * FROM sarga_products");

        // Apply usage-based sorting for everyone
        const categorySorter = sortByUsageThenPosition(usageMap, 'category');
        const subcategorySorter = sortByUsageThenPosition(usageMap, 'subcategory');
        const productSorter = sortByUsageThenPosition(usageMap, 'product');

        const sortedCategories = [...categories].sort(categorySorter);

        const hierarchy = sortedCategories.map(cat => ({
            ...cat,
            subcategories: subcategories
                .filter(sub => sub.category_id === cat.id)
                .sort(subcategorySorter)
                .map(sub => ({
                    ...sub,
                    products: products
                        .filter(p => p.subcategory_id === sub.id)
                        .sort(productSorter)
                }))
        }));

        res.json(hierarchy);
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Update Job Status/Payment
app.put('/api/jobs/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { status, payment_status, advance_paid, total_amount, delivery_date, branch_id } = req.body;

    try {
        let updateQuery = "UPDATE sarga_jobs SET status = ?, payment_status = ?, delivery_date = ?";
        let params = [status, payment_status, delivery_date];

        if (advance_paid !== undefined && total_amount !== undefined) {
            const balance = total_amount - advance_paid;
            updateQuery += ", advance_paid = ?, total_amount = ?, balance_amount = ?";
            params.push(advance_paid, total_amount, balance);
        }

        if (branch_id !== undefined) {
            updateQuery += ", branch_id = ?";
            params.push(branch_id);
        }

        updateQuery += " WHERE id = ?";
        params.push(id);

        await pool.query(updateQuery, params);
        auditLog(req.user.id, 'JOB_UPDATE', `Updated job ${id}`);
        res.json({ message: 'Job updated successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Delete Job
app.delete('/api/jobs/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    try {
        await pool.query("DELETE FROM sarga_jobs WHERE id = ?", [req.params.id]);
        auditLog(req.user.id, 'JOB_DELETE', `Deleted job ${req.params.id}`);
        res.json({ message: 'Job deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// --- PRODUCT HIERARCHY & PRICING ROUTES ---

// List Categories
app.get('/api/product-categories', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM sarga_product_categories ORDER BY name ASC");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Add Category
app.post('/api/product-categories', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const { name } = req.body;
    if (!name || !String(name).trim()) {
        return res.status(400).json({ message: 'Category name is required' });
    }
    try {
        const [rows] = await pool.query("SELECT COALESCE(MAX(position), 0) + 1 AS nextPos FROM sarga_product_categories");
        const nextPos = rows[0]?.nextPos || 1;
        await pool.query(
            "INSERT INTO sarga_product_categories (name, position) VALUES (?, ?)",
            [String(name).trim(), nextPos]
        );
        res.status(201).json({ message: 'Category added' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Category already exists' });
        }
        console.error('Add category error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// Update Category
app.put('/api/product-categories/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const { name } = req.body;
    const { id } = req.params;
    if (!name || !String(name).trim()) return res.status(400).json({ message: 'Name is required' });
    try {
        await pool.query("UPDATE sarga_product_categories SET name = ? WHERE id = ?", [String(name).trim(), id]);
        res.json({ message: 'Category updated' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Name already exists' });
        res.status(500).json({ message: 'Database error' });
    }
});

// Delete Category
app.delete('/api/product-categories/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    try {
        await pool.query("DELETE FROM sarga_product_categories WHERE id = ?", [req.params.id]);
        res.json({ message: 'Category deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// List Subcategories for a Category
app.get('/api/product-categories/:id/subcategories', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM sarga_product_subcategories WHERE category_id = ? ORDER BY name ASC", [req.params.id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Add Subcategory
app.post('/api/product-subcategories', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const { category_id, name } = req.body;
    if (!category_id) {
        return res.status(400).json({ message: 'Category is required' });
    }
    if (!name || !String(name).trim()) {
        return res.status(400).json({ message: 'Subcategory name is required' });
    }
    try {
        const [rows] = await pool.query(
            "SELECT COALESCE(MAX(position), 0) + 1 AS nextPos FROM sarga_product_subcategories WHERE category_id = ?",
            [category_id]
        );
        const nextPos = rows[0]?.nextPos || 1;
        await pool.query(
            "INSERT INTO sarga_product_subcategories (category_id, name, position) VALUES (?, ?, ?)",
            [category_id, String(name).trim(), nextPos]
        );
        res.status(201).json({ message: 'Subcategory added' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Subcategory already exists' });
        }
        console.error('Add subcategory error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// Update Subcategory
app.put('/api/product-subcategories/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const { name, category_id } = req.body;
    const { id } = req.params;
    if (!name || !String(name).trim()) return res.status(400).json({ message: 'Name is required' });
    try {
        await pool.query("UPDATE sarga_product_subcategories SET name = ?, category_id = ? WHERE id = ?", [String(name).trim(), category_id, id]);
        res.json({ message: 'Subcategory updated' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Subcategory already exists' });
        res.status(500).json({ message: 'Database error' });
    }
});

// Delete Subcategory
app.delete('/api/product-subcategories/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    try {
        await pool.query("DELETE FROM sarga_product_subcategories WHERE id = ?", [req.params.id]);
        res.json({ message: 'Subcategory deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// List Products for a Subcategory
app.get('/api/product-subcategories/:id/products', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM sarga_products WHERE subcategory_id = ? ORDER BY name ASC", [req.params.id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Add Product with Slabs and Extras
app.post('/api/products', authenticateToken, authorizeRoles('Admin'), upload.single('image'), async (req, res) => {
    const { subcategory_id, name, product_code, calculation_type, description, inventory_item_id } = req.body;
    const slabs = typeof req.body.slabs === 'string' ? JSON.parse(req.body.slabs) : req.body.slabs;
    const extras = typeof req.body.extras === 'string' ? JSON.parse(req.body.extras) : req.body.extras;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
    const connection = await pool.getConnection();
    try {
        if (!subcategory_id) {
            return res.status(400).json({ message: 'Subcategory is required' });
        }
        if (!name || !String(name).trim()) {
            return res.status(400).json({ message: 'Product name is required' });
        }
        await connection.beginTransaction();

        const [posRows] = await connection.query(
            "SELECT COALESCE(MAX(position), 0) + 1 AS nextPos FROM sarga_products WHERE subcategory_id = ?",
            [subcategory_id]
        );
        const nextPos = posRows[0]?.nextPos || 1;

        const { has_paper_rate, paper_rate } = req.body;
        const [prodResult] = await connection.query(
            "INSERT INTO sarga_products (subcategory_id, name, product_code, calculation_type, description, image_url, has_paper_rate, paper_rate, position, inventory_item_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [subcategory_id, String(name).trim(), product_code || null, calculation_type, description, imageUrl, has_paper_rate === 'true' || has_paper_rate === 1 ? 1 : 0, Number(paper_rate) || 0, nextPos, inventory_item_id || null]
        );
        const productId = prodResult.insertId;

        if (slabs && slabs.length > 0) {
            for (const slab of slabs) {
                const minQty = Number(slab.min_qty) || 0;
                const maxQty = slab.max_qty === '' || slab.max_qty === null || slab.max_qty === undefined
                    ? null
                    : Number(slab.max_qty);
                const baseValue = Number(slab.base_value) || 0;
                const unitRate = Number(slab.unit_rate) || 0;
                const offsetRate = Number(slab.offset_unit_rate) || 0;

                await connection.query(
                    "INSERT INTO sarga_product_slabs (product_id, min_qty, max_qty, base_value, unit_rate, offset_unit_rate) VALUES (?, ?, ?, ?, ?, ?)",
                    [productId, minQty, maxQty, baseValue, unitRate, offsetRate]
                );
            }
        }

        if (extras && extras.length > 0) {
            for (const extra of extras) {
                await connection.query(
                    "INSERT INTO sarga_product_extras_template (product_id, purpose, amount) VALUES (?, ?, ?)",
                    [productId, extra.purpose, extra.amount]
                );
            }
        }

        await connection.commit();
        res.status(201).json({ id: productId, message: 'Product added with slabs and extras' });
    } catch (err) {
        await connection.rollback();
        console.error('Add product error:', err);
        res.status(500).json({ message: 'Database error' });
    } finally {
        connection.release();
    }
});

// Update Product
app.put('/api/products/:id', authenticateToken, authorizeRoles('Admin'), upload.single('image'), async (req, res) => {
    const { id } = req.params;
    const { subcategory_id, name, product_code, calculation_type, description, has_paper_rate, paper_rate, inventory_item_id } = req.body;
    const slabs = typeof req.body.slabs === 'string' ? JSON.parse(req.body.slabs) : req.body.slabs;
    const extras = typeof req.body.extras === 'string' ? JSON.parse(req.body.extras) : req.body.extras;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : req.body.image_url;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        await connection.query(
            "UPDATE sarga_products SET subcategory_id = ?, name = ?, product_code = ?, calculation_type = ?, description = ?, image_url = ?, has_paper_rate = ?, paper_rate = ?, inventory_item_id = ? WHERE id = ?",
            [subcategory_id, String(name).trim(), product_code || null, calculation_type, description, imageUrl, has_paper_rate === 'true' || has_paper_rate === 1 ? 1 : 0, Number(paper_rate) || 0, inventory_item_id || null, id]
        );

        // Update Slabs: DELETE and INSERT is cleaner
        await connection.query("DELETE FROM sarga_product_slabs WHERE product_id = ?", [id]);
        if (slabs && slabs.length > 0) {
            for (const slab of slabs) {
                await connection.query(
                    "INSERT INTO sarga_product_slabs (product_id, min_qty, max_qty, base_value, unit_rate, offset_unit_rate) VALUES (?, ?, ?, ?, ?, ?)",
                    [id, Number(slab.min_qty) || 0, (slab.max_qty === '' || slab.max_qty === null) ? null : Number(slab.max_qty), Number(slab.base_value) || 0, Number(slab.unit_rate) || 0, Number(slab.offset_unit_rate) || 0]
                );
            }
        }

        // Update Extras: DELETE and INSERT
        await connection.query("DELETE FROM sarga_product_extras_template WHERE product_id = ?", [id]);
        if (extras && extras.length > 0) {
            for (const extra of extras) {
                await connection.query(
                    "INSERT INTO sarga_product_extras_template (product_id, purpose, amount) VALUES (?, ?, ?)",
                    [id, extra.purpose, extra.amount]
                );
            }
        }

        await connection.commit();
        res.json({ message: 'Product updated successfully' });
    } catch (err) {
        await connection.rollback();
        console.error('Update product error:', err);
        res.status(500).json({ message: 'Database error' });
    } finally {
        connection.release();
    }
});

// Delete Product
app.delete('/api/products/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    try {
        await pool.query("DELETE FROM sarga_products WHERE id = ?", [req.params.id]);
        res.json({ message: 'Product deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Delete Product Image
app.delete('/api/products/:id/image', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT image_url FROM sarga_products WHERE id = ?", [req.params.id]);
        if (!rows[0]) return res.status(404).json({ message: 'Product not found' });

        const imageUrl = rows[0].image_url;
        if (imageUrl) await removeUploadFile(imageUrl);

        await pool.query("UPDATE sarga_products SET image_url = NULL WHERE id = ?", [req.params.id]);
        res.json({ message: 'Product image removed', image_url: null });
    } catch (err) {
        console.error('Remove product image error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// Update positions for categories/subcategories/products
app.put('/api/product-positions', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const { type, updates } = req.body;
    const tableMap = {
        category: 'sarga_product_categories',
        subcategory: 'sarga_product_subcategories',
        product: 'sarga_products'
    };

    if (!tableMap[type]) {
        return res.status(400).json({ message: 'Invalid type' });
    }
    if (!Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ message: 'Updates are required' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        for (const update of updates) {
            if (!update?.id || update.position === undefined) continue;
            await connection.query(
                `UPDATE ${tableMap[type]} SET position = ? WHERE id = ?`,
                [Number(update.position) || 0, update.id]
            );
        }
        await connection.commit();
        auditLog(req.user.id, 'PRODUCT_POSITION_UPDATE', `Updated ${type} positions`);
        res.json({ message: 'Positions updated' });
    } catch (err) {
        await connection.rollback();
        console.error('Position update error:', err);
        res.status(500).json({ message: 'Database error' });
    } finally {
        connection.release();
    }
});

// Reset usage-based ordering to default
app.post('/api/product-usage/reset', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const { user_id_internal } = req.body || {};
    try {
        if (user_id_internal) {
            await pool.query("DELETE FROM sarga_product_usage WHERE user_id_internal = ?", [user_id_internal]);
            auditLog(req.user.id, 'PRODUCT_USAGE_RESET', `Reset usage for user ${user_id_internal}`);
        } else {
            await pool.query("DELETE FROM sarga_product_usage");
            auditLog(req.user.id, 'PRODUCT_USAGE_RESET', 'Reset usage for all users');
        }
        res.json({ message: 'Usage reset to default' });
    } catch (err) {
        console.error('Usage reset error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// Get Full Product Details (including slabs and extras)
app.get('/api/products/:id', authenticateToken, async (req, res) => {
    try {
        const [products] = await pool.query("SELECT * FROM sarga_products WHERE id = ?", [req.params.id]);
        const product = products[0];
        if (!product) return res.status(404).json({ message: 'Product not found' });

        const [slabs] = await pool.query("SELECT * FROM sarga_product_slabs WHERE product_id = ? ORDER BY min_qty ASC", [product.id]);
        const [extras] = await pool.query("SELECT * FROM sarga_product_extras_template WHERE product_id = ?", [product.id]);

        res.json({ ...product, slabs, extras });
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// --- INVENTORY ROUTES (Admin Only) ---

// List Inventory
app.get('/api/inventory', authenticateToken, authorizeRoles('Admin', 'Front Office', 'Designer', 'Printer', 'Accountant', 'Other Staff'), async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM sarga_inventory ORDER BY created_at DESC");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Add Inventory Item
app.post('/api/inventory', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const { name, sku, category, unit, quantity, reorder_level, cost_price, sell_price } = req.body;

    try {
        const [result] = await pool.query(
            `INSERT INTO sarga_inventory (name, sku, category, unit, quantity, reorder_level, cost_price, sell_price)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            , [
                name,
                sku || null,
                category || null,
                unit || 'pcs',
                Number(quantity) || 0,
                Number(reorder_level) || 0,
                Number(cost_price) || 0,
                Number(sell_price) || 0
            ]
        );

        auditLog(req.user.id, 'INVENTORY_ADD', `Added item ${name} (${sku || 'no-sku'})`);
        res.status(201).json({ id: result.insertId, message: 'Inventory item added' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'SKU already exists' });
        res.status(500).json({ message: 'Database error' });
    }
});

// Update Inventory Item
app.put('/api/inventory/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const { id } = req.params;
    const { name, sku, category, unit, quantity, reorder_level, cost_price, sell_price } = req.body;

    try {
        await pool.query(
            `UPDATE sarga_inventory
             SET name = ?, sku = ?, category = ?, unit = ?, quantity = ?, reorder_level = ?, cost_price = ?, sell_price = ?
             WHERE id = ?`
            , [
                name,
                sku || null,
                category || null,
                unit || 'pcs',
                Number(quantity) || 0,
                Number(reorder_level) || 0,
                Number(cost_price) || 0,
                Number(sell_price) || 0,
                id
            ]
        );

        auditLog(req.user.id, 'INVENTORY_UPDATE', `Updated item ${id} (${name})`);
        res.json({ message: 'Inventory item updated' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'SKU already exists' });
        res.status(500).json({ message: 'Database error' });
    }
});

// Delete Inventory Item
app.delete('/api/inventory/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const { id } = req.params;

    try {
        await pool.query("DELETE FROM sarga_inventory WHERE id = ?", [id]);
        auditLog(req.user.id, 'INVENTORY_DELETE', `Deleted item ${id}`);
        res.json({ message: 'Inventory item deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// ========== STAFF DASHBOARD ENDPOINTS ==========

// Get staff work history (jobs assigned to them)
app.get('/api/staff/:id/work-history', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        // First try to get jobs from assignments
        const [jobs] = await pool.query(`
            SELECT 
                j.id,
                j.job_number,
                j.job_name,
                j.quantity,
                j.unit_price,
                j.total_amount,
                j.status,
                j.payment_status,
                j.delivery_date,
                c.name as customer_name,
                c.mobile as customer_mobile,
                jsa.role as assignment_role,
                jsa.assigned_date,
                jsa.completed_date,
                jsa.status as assignment_status
            FROM sarga_job_staff_assignments jsa
            INNER JOIN sarga_jobs j ON j.id = jsa.job_id
            LEFT JOIN sarga_customers c ON j.customer_id = c.id
            WHERE jsa.staff_id = ?
            ORDER BY j.created_at DESC
        `, [id]);

        res.json(jobs);
    } catch (err) {
        console.error('Work history error:', err);
        // Return empty array instead of error to handle tables that don't exist yet
        res.json([]);
    }
});

// Get staff salary information
app.get('/api/staff/:id/salary-info', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        console.log('Fetching salary info for staff ID:', id);

        // Get staff details and salary settings
        const [staff] = await pool.query(`
            SELECT id, name, role, user_id, salary_type, base_salary, daily_rate
            FROM sarga_staff WHERE id = ?
        `, [id]);

        console.log('Staff query result:', staff);

        if (staff.length === 0) {
            return res.status(404).json({ message: 'Staff not found' });
        }

        // Get salary records
        const [salaryRecords] = await pool.query(`
            SELECT 
                id,
                base_salary,
                net_salary,
                payment_month,
                bonus,
                deduction,
                paid_date,
                payment_method,
                reference_number,
                notes,
                status,
                created_at
            FROM sarga_staff_salary
            WHERE staff_id = ?
            ORDER BY payment_month DESC
            LIMIT 12
        `, [id]);

        // Calculate current month salary
        const now = new Date();
        const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const [currentSalary] = await pool.query(`
            SELECT * FROM sarga_staff_salary
            WHERE staff_id = ? AND payment_month = ?
        `, [id, currentMonth.toISOString().split('T')[0]]);

        // Recent salary payment transactions
        const [payments] = await pool.query(`
            SELECT id, payment_date, payment_amount, payment_method, reference_number, notes, created_by
            FROM sarga_staff_salary_payments
            WHERE staff_id = ?
            ORDER BY payment_date DESC
            LIMIT 20
        `, [id]);

        res.json({
            staff: staff[0],
            salaryRecords,
            currentMonthSalary: currentSalary.length > 0 ? currentSalary[0] : null,
            totalWorkDays: 26, // Standard working days
            recentPayments: payments
        });
    } catch (err) {
        console.error('Salary info error:', err);
        res.status(500).json({ message: 'Failed to fetch salary information' });
    }
});

// Pay salary
app.post('/api/staff/:id/pay-salary', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { id } = req.params;
        const { base_salary, bonus, deduction, payment_month, payment_method, reference_number, notes, payment_amount, payment_date } = req.body;

        const net_salary = base_salary + (bonus || 0) - (deduction || 0);
        const paid_date = new Date();
        const paidAmount = Number(payment_amount || 0);
        const effectiveDate = payment_date ? new Date(payment_date) : paid_date;

        // Check if salary record exists for this month
        const [existing] = await pool.query(`
            SELECT id FROM sarga_staff_salary 
            WHERE staff_id = ? AND payment_month = ?
        `, [id, payment_month]);

        let result;
        if (existing.length > 0) {
            // Update existing
            const [sumRows] = await pool.query(`
                SELECT COALESCE(SUM(payment_amount), 0) AS paid_total
                FROM sarga_staff_salary_payments
                WHERE staff_id = ? AND payment_date >= ? AND payment_date < DATE_ADD(?, INTERVAL 1 MONTH)
            `, [id, payment_month, payment_month]);

            const paidTotal = Number(sumRows[0]?.paid_total || 0) + paidAmount;
            const status = paidTotal >= net_salary ? 'Paid' : 'Partial';

            result = await pool.query(`
                UPDATE sarga_staff_salary 
                SET net_salary = ?, bonus = ?, deduction = ?, 
                    paid_date = ?, payment_method = ?, reference_number = ?, 
                    notes = ?, status = ?
                WHERE id = ?
            `, [net_salary, bonus || 0, deduction || 0, paid_date, payment_method, reference_number, notes, status, existing[0].id]);
        } else {
            // Create new
            const status = paidAmount >= net_salary ? 'Paid' : 'Partial';
            result = await pool.query(`
                INSERT INTO sarga_staff_salary 
                (staff_id, base_salary, net_salary, payment_month, bonus, deduction, 
                 paid_date, payment_method, reference_number, notes, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [id, base_salary, net_salary, payment_month, bonus || 0, deduction || 0, paid_date, payment_method, reference_number, notes, status]);
        }

        if (paidAmount > 0) {
            await pool.query(`
                INSERT INTO sarga_staff_salary_payments
                (staff_id, payment_date, payment_amount, payment_method, reference_number, notes, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [id, effectiveDate, paidAmount, payment_method, reference_number, notes, req.user.id]);
        }

        auditLog(req.user.id, 'SALARY_PAYMENT', `Paid salary to staff ${id} for ${payment_month}`);
        res.json({ message: 'Salary payment recorded successfully', salaryId: result[0].insertId || existing[0].id });
    } catch (err) {
        console.error('Salary payment error:', err);
        res.status(500).json({ message: 'Failed to record salary payment' });
    }
});

// Record Attendance for Staff
app.post('/api/staff/:id/attendance', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { attendance_date, status, notes } = req.body;

    // Authorization
    if (req.user.role !== 'Admin' && req.user.role !== 'Accountant') {
        return res.status(403).json({ message: 'Only Admin/Accountant can record attendance' });
    }

    if (!attendance_date || !status) {
        return res.status(400).json({ message: 'Attendance date and status required' });
    }

    const validStatus = ['Present', 'Absent', 'Leave', 'Holiday'];
    if (!validStatus.includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
    }

    try {
        // Check if date is Sunday (holiday)
        const date = new Date(attendance_date);
        const isSunday = date.getDay() === 0;

        const finalStatus = isSunday ? 'Holiday' : status;

        // Insert or update attendance
        await pool.query(`
            INSERT INTO sarga_staff_attendance 
            (staff_id, attendance_date, status, notes, created_by)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
            status = VALUES(status), 
            notes = VALUES(notes)
        `, [id, attendance_date, finalStatus, notes, req.user.id]);

        auditLog(req.user.id, 'ATTENDANCE_RECORD', `Recorded attendance for staff ${id} on ${attendance_date}: ${finalStatus}`);
        res.json({ message: 'Attendance recorded successfully' });
    } catch (err) {
        console.error('Attendance error:', err);
        res.status(500).json({ message: 'Failed to record attendance' });
    }
});

// Get Monthly Attendance for Staff
app.get('/api/staff/:id/attendance/:year_month', authenticateToken, async (req, res) => {
    const { id, year_month } = req.params;

    try {
        // Validate year_month format (YYYY-MM)
        if (!/^\d{4}-\d{2}$/.test(year_month)) {
            return res.status(400).json({ message: 'Invalid year-month format. Use YYYY-MM' });
        }

        const [rows] = await pool.query(`
            SELECT * FROM sarga_staff_attendance
            WHERE staff_id = ? 
            AND DATE_FORMAT(attendance_date, '%Y-%m') = ?
            ORDER BY attendance_date ASC
        `, [id, year_month]);

        // Calculate summary
        const present = rows.filter(r => r.status === 'Present').length;
        const absent = rows.filter(r => r.status === 'Absent').length;
        const leave = rows.filter(r => r.status === 'Leave').length;
        const holiday = rows.filter(r => r.status === 'Holiday').length;
        const workingDays = present + absent + leave;

        res.json({
            attendance: rows,
            summary: {
                present,
                absent,
                leave,
                holiday,
                workingDays,
                totalDays: rows.length
            }
        });
    } catch (err) {
        console.error('Get attendance error:', err);
        res.status(500).json({ message: 'Failed to fetch attendance' });
    }
});

// Record Leaves (bulk for month)
app.post('/api/staff/:id/leaves', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { year_month, paid_leaves, unpaid_leaves, notes } = req.body;

    // Authorization
    if (req.user.role !== 'Admin') {
        return res.status(403).json({ message: 'Only Admin can record leaves' });
    }

    if (!year_month || paid_leaves === undefined || unpaid_leaves === undefined) {
        return res.status(400).json({ message: 'Year-month and leave counts required' });
    }

    try {
        // Update or insert leave balance
        await pool.query(`
            INSERT INTO sarga_staff_leave_balance 
            (staff_id, \`year_month\`, paid_leaves_used, unpaid_leaves_used, noted)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
            paid_leaves_used = ?, 
            unpaid_leaves_used = ?,
            noted = ?
        `, [id, year_month, paid_leaves, unpaid_leaves, notes, paid_leaves, unpaid_leaves, notes]);

        auditLog(req.user.id, 'LEAVE_RECORD', `Recorded leaves for staff ${id}: ${paid_leaves} paid, ${unpaid_leaves} unpaid`);
        res.json({ message: 'Leave balance updated successfully' });
    } catch (err) {
        console.error('Leave record error:', err);
        res.status(500).json({ message: 'Failed to record leaves' });
    }
});

// Calculate Salary with Attendance and Leaves
app.get('/api/staff/:id/salary-calculation/:year_month', authenticateToken, async (req, res) => {
    const { id, year_month } = req.params;

    try {
        // Get staff info
        const [staffRows] = await pool.query(
            `SELECT salary_type, base_salary, daily_rate FROM sarga_staff WHERE id = ?`,
            [id]
        );

        if (staffRows.length === 0) {
            return res.status(404).json({ message: 'Staff member not found' });
        }

        const staff = staffRows[0];

        // Get attendance for the month
        const [attendance] = await pool.query(`
            SELECT * FROM sarga_staff_attendance
            WHERE staff_id = ? 
            AND DATE_FORMAT(attendance_date, '%Y-%m') = ?
        `, [id, year_month]);

        // Get leave balance
        const [leaveBalance] = await pool.query(`
            SELECT * FROM sarga_staff_leave_balance
            WHERE staff_id = ? AND \`year_month\` = ?
        `, [id, year_month]);

        const leaves = leaveBalance[0] || { paid_leaves_used: 0, unpaid_leaves_used: 0 };

        // Calculate salary
        let calculatedSalary = 0;
        let details = {};

        if (staff.salary_type === 'Monthly') {
            // Monthly staff calculation
            // Assuming 26 working days per month (excluding Sundays and holidays)
            const totalHolidays = attendance.filter(a => a.status === 'Holiday').length;
            const monthDays = 30; // Average
            const workingDaysInMonth = monthDays - Math.ceil(monthDays / 7); // Rough calculation of Sundays

            const paid_leave = leaves.paid_leaves_used || 0;
            const unpaid_leave = leaves.unpaid_leaves_used || 0;

            const perDayRate = staff.base_salary / 26;
            const daysWorked = Math.max(0, 26 - unpaid_leave);

            calculatedSalary = perDayRate * daysWorked;

            details = {
                baseMonthly: staff.base_salary,
                perDayRate: parseFloat(perDayRate.toFixed(2)),
                totalWorkingDays: 26,
                paidLeaves: paid_leave,
                unpaidLeaves: unpaid_leave,
                daysDeducted: unpaid_leave,
                daysWorked: daysWorked,
                calculatedSalary: parseFloat(calculatedSalary.toFixed(2))
            };
        } else {
            // Daily staff calculation
            const presentDays = attendance.filter(a => a.status === 'Present').length;
            calculatedSalary = presentDays * staff.daily_rate;

            details = {
                dailyRate: staff.daily_rate,
                presentDays: presentDays,
                totalDays: attendance.length,
                calculatedSalary: parseFloat(calculatedSalary.toFixed(2))
            };
        }

        res.json({
            staffType: staff.salary_type,
            attendance: {
                total: attendance.length,
                present: attendance.filter(a => a.status === 'Present').length,
                absent: attendance.filter(a => a.status === 'Absent').length,
                leave: attendance.filter(a => a.status === 'Leave').length,
                holiday: attendance.filter(a => a.status === 'Holiday').length
            },
            leaves: leaves,
            calculation: details
        });
    } catch (err) {
        console.error('Salary calculation error:', err);
        res.status(500).json({ message: 'Failed to calculate salary' });
    }
});

// Multer Error Handling Middleware (must be AFTER all routes in Express 5)
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: 'File too large. Max limit is 5MB.' });
        }
        return res.status(400).json({ message: err.message });
    } else if (err) {
        return res.status(400).json({ message: err.message });
    }
    next();
});

// Start Server - Listen on 0.0.0.0 for Network Access
initDb().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on port ${PORT} (Network Accessible)`);
    });
}).catch(err => {
    console.error("Initialization failed:", err);
});

