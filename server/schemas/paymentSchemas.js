const { z } = require('zod');

const customerPaymentSchema = z.object({
    customer_id: z.number().nullable().optional(),
    customer_name: z.string().min(1, "Customer name is required").max(100),
    customer_mobile: z.string().optional().nullable(),
    total_amount: z.number().min(0).max(10000000),
    net_amount: z.number().optional().default(0),
    sgst_amount: z.number().optional().default(0),
    cgst_amount: z.number().optional().default(0),
    advance_paid: z.number().min(0),
    payment_method: z.enum(['Cash', 'UPI', 'Cheque', 'Account Transfer', 'Both']),
    cash_amount: z.number().optional().default(0),
    upi_amount: z.number().optional().default(0),
    reference_number: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    payment_date: z.string().min(1, "Payment date is required"),
    order_lines: z.array(z.object({
        product_id: z.number().optional().nullable(),
        product_name: z.string().optional(),
        job_name: z.string().optional(),
        description: z.string().optional().nullable(),
        quantity: z.number().default(1),
        unit_price: z.number().default(0),
        total_amount: z.number().default(0),
        applied_extras: z.array(z.any()).optional().default([])
    })).optional().default([]),
    job_ids: z.array(z.number()).optional().default([])
}).refine(data => {
    if (data.advance_paid > data.total_amount * 1.01) return false;
    return true;
}, {
    message: "Advance paid cannot significantly exceed total amount",
    path: ["advance_paid"]
}).refine(data => {
    if (data.payment_method === 'Both') {
        return Math.abs((data.cash_amount || 0) + (data.upi_amount || 0) - data.advance_paid) < 0.01;
    }
    return true;
}, {
    message: "Cash + UPI must equal advance paid",
    path: ["payment_method"]
});

module.exports = { customerPaymentSchema };
