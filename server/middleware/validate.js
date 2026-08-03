const { z } = require('zod');

// ---- Reusable primitives ----
const mobile10 = z.string().regex(/^\d{10}$/, 'Must be exactly 10 digits'); // eslint-disable-line no-unused-vars
const positiveDecimal = z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : Number(v)), z.number().min(0, 'Amount cannot be negative').optional());
const requiredPositiveNumber = z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : Number(v)), z.number().min(0, 'Amount cannot be negative'));
const requiredString = (label) => z.string().min(1, `${label} is required`).trim();
const optionalPositiveInt = z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)), z.number().int().min(0).nullable());

// ---- Auth ----
const loginSchema = z.object({
    user_id: z.string().min(1, 'User ID is required'),
    password: z.string().min(1, 'Password is required')
});

// Password validation regex - min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
// eslint-disable-next-line no-useless-escape
const passwordRegex = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&^#()_+\-=\[\]{};':",./<>?\|`~])[A-Za-z\d@$!%*?&^#()_+\-=\[\]{};':",./<>?\|`~]{8,}$/;

const changePasswordSchema = z.object({
    currentPassword: z.string().min(0, 'Current password is required for password change').optional().nullable(),
    newPassword: z.string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter (A-Z)')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter (a-z)')
        .regex(/[0-9]/, 'Password must contain at least one number (0-9)')
        // eslint-disable-next-line no-useless-escape
        .regex(/[@$!%*?&^#()_+\-=\[\]{};':",./<>?\|`~]/, 'Password must contain at least one special character (@$!%*?&^#()_+-=[]{};\'":.;<>,...)')
        .refine(pwd => passwordRegex.test(pwd), {
            message: 'Password does not meet complexity requirements'
        })
});

// ---- Staff ----
const addStaffSchema = z.object({
    mobile: z.string().min(1, 'Mobile is required').regex(/^\d{10}$/, 'Mobile must be exactly 10 digits'),
    name: requiredString('Name'),
    role: z.enum(['Admin', 'Front Office', 'Designer', 'Printer', 'Accountant', 'Other Staff']),
    branch_id: z.preprocess(Number, z.number().int().positive()).optional().nullable()
});

// ---- Customers ----
const addCustomerSchema = z.object({
    mobile: z.string().min(1, 'Mobile is required').regex(/^\+?\d{10,15}$/, 'Mobile must be between 10 and 15 digits'),
    name: z.string().min(1, 'Name is required').max(100, 'Name too long').trim(),
    type: z.enum(['Walk-in', 'Retail', 'Offset']).optional().default('Walk-in'),
    email: z.string().email('Invalid email format').optional().nullable().or(z.literal('')),
    gst: z.string().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/, 'Invalid GST format').optional().nullable().or(z.literal('')),
    address: z.string().max(500, 'Address too long').optional().nullable().or(z.literal(''))
});

// ---- Payments ----
const addPaymentSchema = z.object({
    branch_id: optionalPositiveInt,
    type: z.enum(['Vendor', 'Utility', 'Salary', 'Rent', 'Other']),
    payee_name: requiredString('Payee name'),
    amount: requiredPositiveNumber,
    payment_method: z.enum(['Cash', 'UPI', 'Cheque', 'Both', 'Account Transfer', 'Bank Transfer', 'Other']).optional().default('Cash'),
    reference_number: z.string().optional().nullable().or(z.literal('')),
    description: z.string().optional().nullable().or(z.literal('')),
    payment_date: z.string().min(1, 'Payment date is required'),
    vendor_id: optionalPositiveInt,
    staff_id: optionalPositiveInt,
    period_start: z.string().optional().nullable().or(z.literal('')),
    period_end: z.string().optional().nullable().or(z.literal('')),
    cash_amount: positiveDecimal,
    upi_amount: positiveDecimal,
    bill_total_amount: positiveDecimal,
    is_partial_payment: z.preprocess((v) => v === true || v === 'true' || v === 1, z.boolean().optional().default(false))
});

// ---- Branches ----
const branchSchema = z.object({
    name: requiredString('Branch name'),
    address: z.string().optional().nullable().or(z.literal('')),
    phone: z.string().optional().nullable().or(z.literal('')),
    upi_id: z.string().optional().nullable().or(z.literal('')),
    short_name: z.string().max(10, 'Short name too long').optional().nullable().or(z.literal(''))
});

// ---- Vendors ----
const addVendorSchema = z.object({
    name: requiredString('Vendor name'),
    type: z.enum(['Vendor', 'Utility', 'Salary', 'Rent', 'Other']).optional().default('Vendor'),
    contact_person: z.string().optional().nullable(),
    phone: z.string().regex(/^\d{10}$/, 'Phone must be exactly 10 digits').optional().nullable().or(z.literal('')),
    email: z.string().email('Invalid email format').optional().nullable().or(z.literal('')),
    gst_number: z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GST number format').optional().nullable().or(z.literal('')),
    address: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    category: z.enum(['offset_supplies', 'chemicals', 'paper', 'ink', 'equipment', 'frame', 'memento', 'id_card', 'other']).optional().default('other'),
    vendor_type: z.enum(['paper', 'ink', 'plate', 'service', 'other']).optional().default('other'),
    credit_days: z.preprocess((v) => (v === undefined || v === '' || v === null ? 0 : Number(v)), z.number().int().min(0).optional().default(0)),
    credit_limit: z.preprocess((v) => (v === undefined || v === '' || v === null ? 0 : Number(v)), z.number().min(0).optional().default(0)),
    opening_balance: z.preprocess((v) => (v === undefined || v === '' || v === null ? 0 : Number(v)), z.number().min(0).optional().default(0)),
    current_balance: z.preprocess((v) => (v === undefined || v === '' || v === null ? 0 : Number(v)), z.number().min(0).optional().default(0)),
    notes: z.string().optional().nullable(),
    vendor_code: z.string().regex(/^[A-Z]{3}$/, 'Vendor code must be exactly 3 uppercase letters').optional().nullable().or(z.literal('')),
    branch_id: z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)), z.number().int().positive().nullable().optional()),
    order_link: z.string().optional().nullable()
});

// ---- Jobs ----
const addJobSchema = z.object({
    customer_id: z.preprocess(Number, z.number().int().positive()).optional().nullable(),
    product_id: z.preprocess(Number, z.number().int().positive()).optional().nullable(),
    branch_id: z.preprocess(Number, z.number().int().positive()).optional().nullable(),
    job_name: requiredString('Job name'),
    description: z.string().optional().nullable(),
    quantity: z.preprocess(Number, z.number().min(1, 'Quantity must be at least 1')).optional().default(1),
    unit_price: positiveDecimal,
    total_amount: positiveDecimal,
    advance_paid: positiveDecimal,
    applied_extras: z.array(z.object({
        purpose: z.string(),
        amount: z.preprocess(Number, z.number().min(0))
    })).optional().default([]),
    delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().nullable().or(z.literal(''))
});

// ---- Inventory ----
const addInventorySchema = z.object({
    name: requiredString('Item name'),
    sku: z.string().optional().nullable().or(z.literal('')),
    category: z.string().optional().nullable().or(z.literal('')),
    unit: z.string().optional().default('pcs'),
    quantity: z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : Number(v)), z.number().int().min(0).optional()).default(0),
    reorder_level: z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : Number(v)), z.number().int().min(0).optional()).default(0),
    cost_price: positiveDecimal,
    sell_price: positiveDecimal,
    hsn: z.string().optional().nullable().or(z.literal('')),
    discount: positiveDecimal,
    gst_rate: positiveDecimal,
    product_id: z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : Number(v)), z.number().int().positive().optional()),
    source_code: z.string().optional().nullable().or(z.literal('')),
    model_name: z.string().optional().nullable().or(z.literal('')),
    size_code: z.string().optional().nullable().or(z.literal('')),
    item_type: z.enum(['Retail', 'Consumable']).optional().default('Retail'),
    vendor_name: z.string().optional().nullable().or(z.literal('')),
    vendor_contact: z.string().optional().nullable().or(z.literal('')),
    purchase_link: z.string().optional().nullable().or(z.literal('')),
    branch_stocks: z.array(z.object({
        branch_id: z.preprocess(Number, z.number().int()),
        quantity: z.preprocess(Number, z.number().int().min(0))
    })).optional().nullable()
});

const paperInventorySchema = z.object({
    paper_name: requiredString('Paper name'),
    size: z.string().optional().nullable().or(z.literal('')),
    gsm: z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : Number(v)), z.number().int().min(0).optional()),
    ream_count: z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : Number(v)), z.number().int().min(0).optional().default(0)),
    sheets_per_ream: z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : Number(v)), z.number().int().min(1).optional().default(500)),
    reorder_level_reams: z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : Number(v)), z.number().int().min(0).optional().default(0)),
    supplier_name: z.string().optional().nullable().or(z.literal('')),
    purchase_price_per_ream: positiveDecimal,
    branch: z.enum(['Perambra', 'Meppayur']),
    notes: z.string().optional().nullable().or(z.literal(''))
});

// New Paper Inventory Module Schemas
const addPaperTypeSchema = z.object({
    category: z.enum(['LASER', 'OFFSET', 'BOTH']),
    size_name: requiredString('Size name'),
    width_mm: positiveDecimal,
    height_mm: positiveDecimal,
    gsm: z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)), z.number().int().min(0).nullable()),
    brand: z.string().optional().nullable(),
    is_active: z.boolean().optional().default(true)
});

const paperInwardSchema = z.object({
    paper_type_id: z.preprocess(Number, z.number().int().positive()),
    branch_id: z.preprocess(Number, z.number().int().positive()),
    quantity: z.preprocess(Number, z.number().int().positive()),
    unit: z.enum(['Reams', 'Packets', 'Sheets']).default('Reams'),
    purchase_rate: z.preprocess((v) => (v === '' || v === null ? 0 : Number(v)), z.number().min(0)).default(0),
    supplier_name: z.string().optional().nullable(),
    effective_date: z.string().optional().nullable(),
    notes: z.string().optional().nullable()
});

const paperRateSchema = z.object({
    paper_type_id: z.preprocess(Number, z.number().int().positive()),
    rate: z.preprocess(Number, z.number().positive()),
    effective_date: z.string().optional().nullable(),
    unit_type: z.enum(['Sheets', 'Reams', 'Packets']).default('Reams'),
    supplier_name: z.string().optional().nullable(),
    supplier_id: z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)), z.number().int().positive().nullable()),
    purchase_order_ref: z.string().optional().nullable(),
    notes: z.string().optional().nullable()
});

const paperOutwardSchema = z.object({
    paper_type_id: z.preprocess(Number, z.number().int().positive()),
    branch_id: z.preprocess(Number, z.number().int().positive()),
    quantity: z.preprocess(Number, z.number().int().positive()),
    unit: z.enum(['Reams', 'Packets', 'Sheets']).default('Reams'),
    job_id: z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)), z.number().int().positive().nullable()),
    reference_id: z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)), z.number().int().positive().nullable()),
    reference_type: z.enum(['JOB', 'WASTE', 'SAMPLE', 'DEMO']).default('JOB'),
    notes: z.string().optional().nullable()
});

const paperAdjustmentSchema = z.object({
    paper_type_id: z.preprocess(Number, z.number().int().positive()),
    branch_id: z.preprocess(Number, z.number().int().positive()),
    quantity: z.preprocess(Number, z.number().int()), // can be negative for deduction
    notes: requiredString('Reason/Notes')
});

const paperTransferSchema = z.object({
    paper_type_id: z.preprocess(Number, z.number().int().positive()),
    from_branch_id: z.preprocess(Number, z.number().int().positive()),
    to_branch_id: z.preprocess(Number, z.number().int().positive()),
    quantity: z.preprocess(Number, z.number().int().positive()),
    notes: z.string().optional().nullable()
});

const consumablesInventorySchema = z.object({
    name: requiredString('Name'),
    category: z.enum(['ink', 'chemical', 'plate', 'spare_part', 'other', 'paper', 'binding', 'packaging']).default('other'),
    unit: z.enum(['litre', 'kg', 'piece', 'box', 'set', 'sheet', 'roll', 'meter', 'pair', 'pack']).default('piece'),
    gsm: z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : Number(v)), z.number().int().positive().optional()),
    size_name: z.string().optional().nullable().or(z.literal('')),
    brand: z.string().optional().nullable().or(z.literal('')),
    finish: z.string().optional().nullable().or(z.literal('')),
    color: z.string().optional().nullable().or(z.literal('')),
    quantity_in_stock: z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : Number(v)), z.number().min(0).default(0)),
    reorder_level: z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : Number(v)), z.number().min(0).default(0)),
    min_stock_level: z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : Number(v)), z.number().min(0).optional()),
    max_stock_level: z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : Number(v)), z.number().min(0).optional()),
    location: z.string().optional().nullable().or(z.literal('')),
    unit_cost: positiveDecimal,
    supplier_name: z.string().optional().nullable().or(z.literal('')),
    supplier_id: z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : Number(v)), z.number().int().positive().optional()),
    sku: z.string().optional().nullable().or(z.literal('')),
    branch: z.preprocess((v) => {
        if (typeof v !== 'string') return v;
        const lower = v.toLowerCase();
        if (lower === 'perambra') return 'Perambra';
        if (lower === 'meppayur') return 'Meppayur';
        return v;
    }, z.enum(['Perambra', 'Meppayur'])),
    notes: z.string().optional().nullable().or(z.literal(''))
});

// ---- Attendance ----
const attendanceSchema = z.object({
    attendance_date: z.string().min(1, 'Date is required').regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
        .refine((d) => new Date(d) <= new Date(), { message: 'Attendance date cannot be in the future' }),
    status: z.enum(['Present', 'Absent', 'Leave', 'Holiday', 'Half Day']),
    notes: z.string().optional().nullable(),
    time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Time must be HH:MM or HH:MM:SS').optional().nullable().or(z.literal('')).transform(v => v === '' ? null : v),
    gone_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Gone time must be HH:MM or HH:MM:SS').optional().nullable().or(z.literal('')).transform(v => v === '' ? null : v)
});

// ---- Office Expenses ----
const officeExpenseSchema = z.object({
    expense_type: requiredString('Expense type'),
    vendor_name: z.string().optional().nullable(),
    amount: requiredPositiveNumber,
    payment_method: z.string().optional().default('Cash'),
    reference_number: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    expense_date: z.string().optional().nullable(),
    bill_number: z.string().optional().nullable()
});

// ---- Finance (EMI & Kuri) ----
const emiMasterSchema = z.object({
    emi_type: z.enum(['Loan', 'Vehicle', 'Machine', 'Personal', 'Business']),
    institution_name: requiredString('Institution name'),
    loan_amount: positiveDecimal,
    monthly_emi: requiredPositiveNumber,
    start_date: z.string().min(1, 'Start date is required'),
    end_date: z.string().optional().nullable(),
    due_day: z.preprocess(Number, z.number().int().min(1).max(31)).optional().default(5),
    account_number: z.string().optional().nullable(),
    branch_id: optionalPositiveInt,
    description: z.string().optional().nullable(),
    is_active: z.preprocess((v) => v === true || v === 'true' || v === 1, z.boolean().optional().default(true))
});

const emiPaymentSchema = z.object({
    emi_id: optionalPositiveInt.refine(v => v !== null, { message: "EMI ID is required" }),
    payment_date: z.string().optional().nullable(),
    amount: requiredPositiveNumber,
    payment_method: z.string().optional().nullable(),
    reference_number: z.string().optional().nullable(),
    notes: z.string().optional().nullable()
});

const kuriMasterSchema = z.object({
    kuri_name: requiredString('Kuri name'),
    organizer_name: z.string().optional().nullable(),
    organizer_phone: z.string().optional().nullable(),
    total_amount: positiveDecimal,
    monthly_installment: requiredPositiveNumber,
    start_date: z.string().min(1, 'Start date is required'),
    end_date: z.string().optional().nullable(),
    due_day: z.preprocess(Number, z.number().int().min(1).max(31)).optional().default(5),
    prize_taken: z.preprocess((v) => v === true || v === 'true' || v === 1, z.boolean().optional().default(false)),
    prize_amount: positiveDecimal,
    prize_date: z.string().optional().nullable(),
    branch_id: optionalPositiveInt,
    description: z.string().optional().nullable(),
    is_active: z.preprocess((v) => v === true || v === 'true' || v === 1, z.boolean().optional().default(true))
});

const kuriPaymentSchema = z.object({
    kuri_id: optionalPositiveInt.refine(v => v !== null, { message: "Kuri ID is required" }),
    payment_date: z.string().optional().nullable(),
    amount: requiredPositiveNumber,
    payment_method: z.string().optional().nullable(),
    reference_number: z.string().optional().nullable(),
    notes: z.string().optional().nullable()
});

const staffSalaryUpdateSchema = z.object({
    name: z.string().min(1, 'Name is required').optional(),
    mobile: z.string().optional(),
    role: z.string().optional(),
    branch_id: z.union([z.number(), z.string()]).optional(),
    email: z.string().optional(),
    address: z.string().optional(),
    salary_type: z.enum(['Monthly', 'Daily']).optional(),
    base_salary: positiveDecimal.nullable(),
    daily_rate: positiveDecimal.nullable(),
    settings: z.any().optional()
}).passthrough();

// ---- Vendor Invoice & Payment Schemas ----
const addInvoiceSchema = z.object({
    vendor_id: z.preprocess(Number, z.number().int().positive()),
    invoice_number: z.string().optional().nullable(),
    invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
    amount: z.preprocess(
      (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
      z.number().min(0, 'Amount cannot be negative')
    ),
    branch: z.enum(['perambra', 'meppayur', 'common']).default('common'),
    status: z.enum(['draft', 'pending']).optional().default('pending'),
    notes: z.string().optional().nullable()
});

const addVendorPaymentSchema = z.object({
    vendor_invoice_id: z.preprocess(Number, z.number().int().positive()),
    amount: requiredPositiveNumber,
    payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
    payment_mode: z.enum(['cash', 'bank', 'upi', 'cheque', 'neft', 'rtgs']).default('cash'),
    reference_number: z.string().optional().nullable().or(z.literal('')),
    notes: z.string().optional().nullable()
}).refine(data => {
    if (data.payment_mode === 'cheque' && (!data.reference_number || data.reference_number.trim() === '')) {
        return false;
    }
    return true;
}, {
    message: 'Reference number is required for cheque payments',
    path: ['reference_number']
});

// ---- Blog ----
const addBlogPostSchema = z.object({
    title: requiredString('Title'),
    slug: z.string().optional().nullable(),
    content: z.string().optional().nullable(),
    excerpt: z.string().max(500, 'Excerpt too long').optional().nullable(),
    category: z.string().optional().nullable(),
    author_id: z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)), z.number().int().positive().nullable()),
    status: z.enum(['draft', 'published', 'archived']).optional().default('draft'),
    featured_image_url: z.string().optional().nullable().or(z.literal('')),
    meta_title: z.string().max(200, 'Meta title too long').optional().nullable(),
    meta_description: z.string().max(500, 'Meta description too long').optional().nullable()
});

const addBlogAuthorSchema = z.object({
    name: requiredString('Author name'),
    email: z.string().email('Invalid email format').optional().nullable().or(z.literal('')),
    bio: z.string().max(1000, 'Bio too long').optional().nullable(),
    avatar_url: z.string().optional().nullable().or(z.literal('')),
    role: z.string().optional().default('author')
});

// ---- CCTV ----
const addCctvCameraSchema = z.object({
    name: requiredString('Camera name'),
    branch_id: z.preprocess(Number, z.number().int().positive()),
    ip_address: z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, 'Invalid IP address'),
    port: z.preprocess(Number, z.number().int().min(1).max(65535)).default(554),
    rtsp_path: z.string().optional().nullable(),
    username: z.string().optional().nullable(),
    password: z.string().optional().nullable(),
    is_active: z.boolean().optional().default(true)
});

// ---- Machine ----
const addMachineSchema = z.object({
    name: requiredString('Machine name'),
    model: z.string().optional().nullable(),
    brand: z.string().optional().nullable(),
    serial_number: z.string().optional().nullable(),
    branch_id: z.preprocess(Number, z.number().int().positive()).optional().nullable(),
    requires_login: z.boolean().optional().default(false),
    is_active: z.boolean().optional().default(true)
});

const machineReadingSchema = z.object({
    machine_id: z.preprocess(Number, z.number().int().positive()),
    reading_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
    opening_count: z.preprocess(Number, z.number().int().min(0)),
    closing_count: z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)), z.number().int().min(0).nullable()),
    error_threshold: z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : Number(v)), z.number().min(0).default(100)),
    warning_threshold: z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : Number(v)), z.number().min(0).default(80))
});

// ---- Schedule ----
const addScheduleSchema = z.object({
    name: requiredString('Schedule name'),
    shift_start: z.string().regex(/^\d{2}:\d{2}$/, 'Start time must be HH:MM'),
    shift_end: z.string().regex(/^\d{2}:\d{2}$/, 'End time must be HH:MM'),
    break_minutes: z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : Number(v)), z.number().int().min(0).max(120).default(0)),
    effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
    effective_to: z.string().optional().nullable().or(z.literal('')),
    branch_id: z.preprocess(Number, z.number().int().positive()).optional().nullable()
});

// ---- Products ----
const addProductCategorySchema = z.object({
    name: requiredString('Category name'),
    description: z.string().optional().nullable(),
    is_active: z.boolean().optional().default(true)
});

const addProductSubcategorySchema = z.object({
    name: requiredString('Subcategory name'),
    category_id: z.preprocess(Number, z.number().int().positive()),
    description: z.string().optional().nullable(),
    is_active: z.boolean().optional().default(true)
});

const addProductSchema = z.object({
    name: requiredString('Product name'),
    category_id: z.preprocess(Number, z.number().int().positive()).optional().nullable(),
    subcategory_id: z.preprocess(Number, z.number().int().positive()).optional().nullable(),
    description: z.string().optional().nullable(),
    base_price: positiveDecimal,
    hsn_code: z.string().optional().nullable().or(z.literal('')),
    gst_rate: positiveDecimal,
    is_active: z.boolean().optional().default(true)
});

// ---- Website ----
const addWebsiteInquirySchema = z.object({
    name: requiredString('Name'),
    email: z.string().email('Invalid email format'),
    phone: z.string().optional().nullable().or(z.literal('')),
    message: requiredString('Message'),
    subject: z.string().optional().nullable(),
    source: z.string().optional().default('website')
});

const addWebsiteReviewSchema = z.object({
    reviewer_name: requiredString('Reviewer name'),
    rating: z.preprocess(Number, z.number().int().min(1).max(5)),
    review_text: z.string().optional().nullable(),
    source: z.enum(['google', 'website', 'other']).optional().default('google'),
    google_review_id: z.string().optional().nullable()
});

// ---- Middleware factory ----
const validate = (schema, property = 'body') => (req, res, next) => {
    try {
        const validatedData = schema.parse(req[property]);
        req[property] = validatedData; // use cleaned/coerced data (includes defaults/transforms)
        next();
    } catch (error) {
        if (error instanceof z.ZodError) {
            const details = error.errors.map((e) => `[${e.path.join('.')}] ${e.message} (got: ${JSON.stringify(e.received ?? req[property]?.[e.path[0]])})`).join(' | ');
            console.error(`[validate] Zod 400 on ${req.method} ${req.path}:`, details);
            
            if (!global.recentValidationErrors) global.recentValidationErrors = [];
            global.recentValidationErrors.push({
                timestamp: new Date().toISOString(),
                method: req.method,
                path: req.path,
                body: req[property],
                errors: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
            });
            if (global.recentValidationErrors.length > 50) global.recentValidationErrors.shift();

            const messages = error.errors.map((e) => e.message).join(', ');
            return res.status(400).json({ message: messages, errors: error.errors.map(e => ({ field: e.path.join('.'), message: e.message })) });
        }
        next(error);
    }
};

// ---- Cutting & Transfer ----
const cuttingJobSchema = z.object({
    branch_id: z.preprocess(Number, z.number().int().positive()),
    paper_type_id: z.preprocess(Number, z.number().int().positive()),
    source_size_id: z.preprocess(Number, z.number().int().positive()),
    source_qty_sheets: z.preprocess(Number, z.number().positive('Source qty must be positive')),
    wastage_qty_sheets: z.preprocess((v) => (v === '' || v === null || v === undefined ? 0 : Number(v)), z.number().min(0)).default(0),
    outputs: z.array(z.object({
        output_size_id: z.preprocess(Number, z.number().int().positive()),
        output_qty_sheets: z.preprocess(Number, z.number().positive('Output qty must be positive'))
    })).min(1, 'At least one output is required'),
    notes: z.string().max(255).optional().nullable()
});

const stockTransferSchema = z.object({
    from_branch_id: z.preprocess(Number, z.number().int().positive()),
    to_branch_id: z.preprocess(Number, z.number().int().positive()),
    paper_type_id: z.preprocess(Number, z.number().int().positive()),
    size_id: z.preprocess(Number, z.number().int().positive()),
    qty_dispatched: z.preprocess(Number, z.number().positive('Quantity must be positive'))
});

const stockTransferReceiveSchema = z.object({
    qty_received: z.preprocess(Number, z.number().positive('Received quantity must be positive'))
});

module.exports = {
    validate,
    branchSchema,
    loginSchema,
    changePasswordSchema,
    addStaffSchema,
    addCustomerSchema,
    addInventorySchema,
    attendanceSchema,
    officeExpenseSchema,
    emiMasterSchema,
    emiPaymentSchema,
    kuriMasterSchema,
    kuriPaymentSchema,
    staffSalaryUpdateSchema,
    addJobSchema,
    addPaymentSchema,
    paperInventorySchema,
    consumablesInventorySchema,
    addPaperTypeSchema,
    paperInwardSchema,
    paperOutwardSchema,
    paperRateSchema,
    paperAdjustmentSchema,
    paperTransferSchema,
    addVendorSchema,
    addInvoiceSchema,
    addVendorPaymentSchema,
    addBlogPostSchema,
    addBlogAuthorSchema,
    addCctvCameraSchema,
    addMachineSchema,
    machineReadingSchema,
    addScheduleSchema,
    addProductCategorySchema,
    addProductSubcategorySchema,
    addProductSchema,
    addWebsiteInquirySchema,
    addWebsiteReviewSchema,
    cuttingJobSchema,
    stockTransferSchema,
    stockTransferReceiveSchema
};
