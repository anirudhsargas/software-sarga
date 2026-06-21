const validate = (schema, property = 'body') => (req, res, next) => {
  try {
    const validatedData = schema.parse(req[property]);
    req[property] = validatedData;
    next();
  } catch (error) {
    if (error instanceof (require('zod').ZodError)) {
      const messages = error.errors.map((e) => e.message).join(', ');
      return res.status(400).json({ message: messages });
    }
    next(error);
  }
};

module.exports = {
  validate,
  loginSchema: require('zod').z.object({
    user_id: require('zod').z.string().min(1),
    password: require('zod').z.string().min(1),
  }),
  addVendorSchema: require('zod').z.object({
    name: require('zod').z.string().min(1),
    type: require('zod').z.string().optional(),
    phone: require('zod').z.string().optional().nullable(),
    email: require('zod').z.string().optional().nullable(),
    category: require('zod').z.string().optional(),
    credit_days: require('zod').z.number().optional(),
  }),
  addCustomerSchema: require('zod').z.object({
    mobile: require('zod').z.string().min(10),
    name: require('zod').z.string().min(1),
    type: require('zod').z.string().optional(),
    email: require('zod').z.string().optional().nullable(),
    gst: require('zod').z.string().optional().nullable(),
    address: require('zod').z.string().optional().nullable(),
  }),
  addJobSchema: require('zod').z.object({
    job_name: require('zod').z.string().min(1),
    quantity: require('zod').z.number().optional(),
    total_amount: require('zod').z.number().optional(),
    advance_paid: require('zod').z.number().optional(),
    customer_id: require('zod').z.number().optional().nullable(),
    product_id: require('zod').z.number().optional().nullable(),
    branch_id: require('zod').z.number().optional().nullable(),
    unit_price: require('zod').z.number().optional(),
    delivery_date: require('zod').z.string().optional().nullable(),
    description: require('zod').z.string().optional().nullable(),
    applied_extras: require('zod').z.array(require('zod').z.any()).optional(),
  }),
  addPaymentSchema: require('zod').z.object({
    branch_id: require('zod').z.number().optional().nullable(),
    type: require('zod').z.string(),
    payee_name: require('zod').z.string().min(1),
    amount: require('zod').z.number().min(0),
    payment_method: require('zod').z.string().optional(),
    payment_date: require('zod').z.string().min(1),
    cash_amount: require('zod').z.number().optional(),
    upi_amount: require('zod').z.number().optional(),
  }),
  addInvoiceSchema: require('zod').z.object({
    vendor_id: require('zod').z.number(),
    invoice_date: require('zod').z.string(),
    amount: require('zod').z.number(),
    branch: require('zod').z.string().optional(),
  }),
  addVendorPaymentSchema: require('zod').z.object({
    vendor_invoice_id: require('zod').z.number(),
    amount: require('zod').z.number().min(0),
    payment_date: require('zod').z.string(),
    payment_mode: require('zod').z.string().optional(),
  }),
  changePasswordSchema: require('zod').z.object({
    currentPassword: require('zod').z.string().optional(),
    newPassword: require('zod').z.string().min(8),
  }),
};
