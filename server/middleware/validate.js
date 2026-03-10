const { z } = require('zod');

// ---- Reusable primitives ----
const mobile10 = z.string().regex(/^\d{10}$/, 'Must be exactly 10 digits');
const positiveDecimal = z.preprocess((v) => (v === '' || v === null ? undefined : Number(v)), z.number().min(0).optional());
const requiredString = (label) => z.string().min(1, `${label} is required`).trim();
const optionalPositiveInt = z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)), z.number().int().positive().nullable());

// ---- Auth ----
const loginSchema = z.object({
    user_id: z.string().min(1, 'User ID is required'),
    password: z.string().min(1, 'Password is required')
});

const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number')
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
    mobile: z.string().min(1, 'Mobile is required').regex(/^\d{10}$/, 'Mobile must be exactly 10 digits'),
    name: z.string().min(1, 'Name is required').max(100, 'Name too long').trim(),
    type: z.enum(['Walk-in', 'Retail', 'Association', 'Offset']).optional().default('Walk-in'),
    email: z.string().email('Invalid email format').optional().nullable().or(z.literal('')),
    gst: z.string().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/, 'Invalid GST format').optional().nullable().or(z.literal('')),
    address: z.string().max(500, 'Address too long').optional().nullable().or(z.literal(''))
});

// ---- Payments ----
const addPaymentSchema = z.object({
    branch_id: optionalPositiveInt,
    type: z.enum(['Vendor', 'Utility', 'Salary', 'Rent', 'Other']),
    payee_name: requiredString('Payee name'),
    amount: z.preprocess(Number, z.number().positive('Amount must be greater than 0')),
    payment_method: z.enum(['Cash', 'UPI', 'Cheque', 'Both', 'Account Transfer']).optional().default('Cash'),
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
    upi_id: z.string().optional().nullable().or(z.literal(''))
});

// ---- Vendors ----
const addVendorSchema = z.object({
    name: requiredString('Vendor name'),
    type: z.enum(['Vendor', 'Utility', 'Salary', 'Rent', 'Other']).optional().default('Vendor'),
    contact_person: z.string().optional().nullable(),
    phone: z.string().regex(/^\d{10}$/, 'Phone must be exactly 10 digits').optional().nullable().or(z.literal('')),
    address: z.string().optional().nullable(),
    branch_id: z.preprocess(Number, z.number().int().positive()).optional().nullable(),
    order_link: z.string().optional().nullable(),
    gstin: z.string().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/, 'Invalid GSTIN format').optional().nullable().or(z.literal(''))
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
    quantity: z.preprocess(Number, z.number().int().min(0)).optional().default(0),
    reorder_level: z.preprocess(Number, z.number().int().min(0)).optional().default(0),
    cost_price: positiveDecimal,
    sell_price: positiveDecimal,
    hsn: z.string().optional().nullable().or(z.literal('')),
    discount: positiveDecimal,
    gst_rate: positiveDecimal,
    product_id: z.preprocess((v) => (v === '' || v === null ? undefined : Number(v)), z.number().int().positive().optional()),
    source_code: z.string().optional().nullable().or(z.literal('')),
    model_name: z.string().optional().nullable().or(z.literal('')),
    size_code: z.string().optional().nullable().or(z.literal('')),
    item_type: z.enum(['Retail', 'Consumable']).optional().default('Retail'),
    vendor_name: z.string().optional().nullable().or(z.literal('')),
    vendor_contact: z.string().optional().nullable().or(z.literal('')),
    purchase_link: z.string().optional().nullable().or(z.literal(''))
});

// ---- Attendance ----
const attendanceSchema = z.object({
    attendance_date: z.string().min(1, 'Date is required').regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
        .refine((d) => new Date(d) <= new Date(), { message: 'Attendance date cannot be in the future' }),
    status: z.enum(['Present', 'Absent', 'Leave', 'Holiday'])
});

// ---- Middleware factory ----
const validate = (schema, property = 'body') => (req, res, next) => {
    try {
        const validatedData = schema.parse(req[property]);
        req[property] = validatedData; // use cleaned/coerced data (includes defaults/transforms)
        next();
    } catch (error) {
        if (error instanceof z.ZodError) {
            const messages = error.errors.map((e) => e.message).join(', ');
            return res.status(400).json({ message: messages });
        }
        next(error);
    }
};

module.exports = {
    validate,
    loginSchema,
    changePasswordSchema,
    addStaffSchema,
    addCustomerSchema,
    addPaymentSchema,
    branchSchema,
    addVendorSchema,
    addJobSchema,
    addInventorySchema,
    attendanceSchema
};
