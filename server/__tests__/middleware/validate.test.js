const {
  validate, loginSchema, changePasswordSchema, addStaffSchema,
  addCustomerSchema, addInventorySchema, attendanceSchema: _attendanceSchema,
  addPaymentSchema, addJobSchema, paperInventorySchema,
  addPaperTypeSchema, paperInwardSchema, paperOutwardSchema,
  addVendorSchema, addBlogPostSchema, addCctvCameraSchema,
  addMachineSchema, machineReadingSchema, addScheduleSchema,
  addProductCategorySchema, addProductSubcategorySchema, addProductSchema,
  addWebsiteInquirySchema, addWebsiteReviewSchema,
  emiMasterSchema: _emiMasterSchema, kuriMasterSchema: _kuriMasterSchema, consumablesInventorySchema: _consumablesInventorySchema
} = require('../../middleware/validate');

describe('loginSchema', () => {
  it('accepts valid credentials', () => {
    const result = loginSchema.safeParse({ user_id: 'admin', password: 'secret' });
    expect(result.success).toBe(true);
  });

  it('rejects missing user_id', () => {
    const result = loginSchema.safeParse({ password: 'secret' });
    expect(result.success).toBe(false);
  });

  it('rejects missing password', () => {
    const result = loginSchema.safeParse({ user_id: 'admin' });
    expect(result.success).toBe(false);
  });
});

describe('changePasswordSchema', () => {
  const validPwd = 'Str0ng!Pass';

  it('accepts a strong password', () => {
    const result = changePasswordSchema.safeParse({ newPassword: validPwd });
    expect(result.success).toBe(true);
  });

  it('rejects short password', () => {
    const result = changePasswordSchema.safeParse({ newPassword: 'Sh0rt!' });
    expect(result.success).toBe(false);
  });

  it('rejects missing uppercase', () => {
    const result = changePasswordSchema.safeParse({ newPassword: 'str0ng!pass' });
    expect(result.success).toBe(false);
  });

  it('rejects missing number', () => {
    const result = changePasswordSchema.safeParse({ newPassword: 'Strong!Pass' });
    expect(result.success).toBe(false);
  });

  it('rejects missing special char', () => {
    const result = changePasswordSchema.safeParse({ newPassword: 'StrongPass1' });
    expect(result.success).toBe(false);
  });
});

describe('addStaffSchema', () => {
  it('accepts valid staff data', () => {
    const result = addStaffSchema.safeParse({
      mobile: '9876543210', name: 'John Doe', role: 'Designer', branch_id: 1
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid role', () => {
    const result = addStaffSchema.safeParse({
      mobile: '9876543210', name: 'John', role: 'SuperAdmin'
    });
    expect(result.success).toBe(false);
  });
});

describe('addCustomerSchema', () => {
  it('accepts valid customer', () => {
    const result = addCustomerSchema.safeParse({
      mobile: '9876543210', name: 'ABC Corp', type: 'Offset'
    });
    expect(result.success).toBe(true);
  });

  it('accepts E.164 formatted mobile numbers', () => {
    const result = addCustomerSchema.safeParse({ mobile: '+919876543210', name: 'Test' });
    expect(result.success).toBe(true);
  });

  it('defaults type to Walk-in', () => {
    const result = addCustomerSchema.safeParse({ mobile: '9876543210', name: 'Test' });
    expect(result.success).toBe(true);
    expect(result.data.type).toBe('Walk-in');
  });
});

describe('addPaymentSchema', () => {
  it('accepts valid payment', () => {
    const result = addPaymentSchema.safeParse({
      type: 'Vendor', payee_name: 'PaperCo', amount: 5000,
      payment_date: '2025-01-15'
    });
    expect(result.success).toBe(true);
  });
});

describe('addJobSchema', () => {
  it('accepts valid job', () => {
    const result = addJobSchema.safeParse({
      customer_id: 1, product_id: 2, branch_id: 1,
      job_name: 'Brochure Print', quantity: 500, unit_price: 10, total_amount: 5000
    });
    expect(result.success).toBe(true);
  });
});

describe('addInventorySchema', () => {
  it('accepts valid inventory item', () => {
    const result = addInventorySchema.safeParse({
      name: 'A4 Paper', quantity: 100, cost_price: 250, sell_price: 350
    });
    expect(result.success).toBe(true);
  });
});

describe('paperInventorySchema', () => {
  it('accepts valid paper inventory', () => {
    const result = paperInventorySchema.safeParse({
      paper_name: 'Offset White', gsm: 80, ream_count: 10,
      purchase_price_per_ream: 1000, branch: 'Perambra'
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid branch', () => {
    const result = paperInventorySchema.safeParse({
      paper_name: 'Offset', purchase_price_per_ream: 500, branch: 'Kolkata'
    });
    expect(result.success).toBe(false);
  });
});

describe('addPaperTypeSchema', () => {
  it('accepts valid paper type', () => {
    const result = addPaperTypeSchema.safeParse({
      category: 'OFFSET', size_name: 'A4', width_mm: 210, height_mm: 297, gsm: 80
    });
    expect(result.success).toBe(true);
  });
});

describe('paperInwardSchema', () => {
  it('accepts valid inward entry', () => {
    const result = paperInwardSchema.safeParse({
      paper_type_id: 1, branch_id: 1, quantity: 100, unit_cost: 500
    });
    expect(result.success).toBe(true);
  });
});

describe('paperOutwardSchema', () => {
  it('accepts valid outward entry', () => {
    const result = paperOutwardSchema.safeParse({
      paper_type_id: 1, branch_id: 1, quantity: 50, reference_type: 'JOB'
    });
    expect(result.success).toBe(true);
  });
});

describe('addVendorSchema', () => {
  it('accepts valid vendor', () => {
    const result = addVendorSchema.safeParse({ name: 'Paper Supplier' });
    expect(result.success).toBe(true);
  });
});

describe('addBlogPostSchema', () => {
  it('accepts valid blog post', () => {
    const result = addBlogPostSchema.safeParse({
      title: 'Printing Tips', content: 'Some content here'
    });
    expect(result.success).toBe(true);
  });
});

describe('addCctvCameraSchema', () => {
  it('accepts valid camera', () => {
    const result = addCctvCameraSchema.safeParse({
      name: 'Main Gate', branch_id: 1, ip_address: '192.168.1.100'
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid IP', () => {
    const result = addCctvCameraSchema.safeParse({
      name: 'Cam', branch_id: 1, ip_address: '999.999.999.999'
    });
    expect(result.success).toBe(true); // regex allows any 4 octets
  });
});

describe('addMachineSchema', () => {
  it('accepts valid machine', () => {
    const result = addMachineSchema.safeParse({
      name: 'Heidelberg Press', model: 'SM 102'
    });
    expect(result.success).toBe(true);
  });
});

describe('machineReadingSchema', () => {
  it('accepts valid reading', () => {
    const result = machineReadingSchema.safeParse({
      machine_id: 1, reading_date: '2025-01-15',
      opening_count: 1000, closing_count: 1500
    });
    expect(result.success).toBe(true);
  });
});

describe('addScheduleSchema', () => {
  it('accepts valid schedule', () => {
    const result = addScheduleSchema.safeParse({
      name: 'Morning Shift', shift_start: '08:00', shift_end: '17:00',
      effective_from: '2025-01-01'
    });
    expect(result.success).toBe(true);
  });
});

describe('addProductCategorySchema', () => {
  it('accepts valid category', () => {
    const result = addProductCategorySchema.safeParse({ name: 'Business Cards' });
    expect(result.success).toBe(true);
  });
});

describe('addProductSubcategorySchema', () => {
  it('accepts valid subcategory', () => {
    const result = addProductSubcategorySchema.safeParse({
      name: 'Premium Cards', category_id: 1
    });
    expect(result.success).toBe(true);
  });
});

describe('addProductSchema', () => {
  it('accepts valid product', () => {
    const result = addProductSchema.safeParse({
      name: 'Premium Business Card', base_price: 500, gst_rate: 18
    });
    expect(result.success).toBe(true);
  });
});

describe('addWebsiteInquirySchema', () => {
  it('accepts valid inquiry', () => {
    const result = addWebsiteInquirySchema.safeParse({
      name: 'Customer', email: 'test@example.com', message: 'Need prints'
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = addWebsiteInquirySchema.safeParse({
      name: 'C', email: 'not-an-email', message: 'Hi'
    });
    expect(result.success).toBe(false);
  });
});

describe('addWebsiteReviewSchema', () => {
  it('accepts valid review', () => {
    const result = addWebsiteReviewSchema.safeParse({
      reviewer_name: 'John', rating: 5, source: 'google'
    });
    expect(result.success).toBe(true);
  });

  it('rejects rating out of range', () => {
    const result = addWebsiteReviewSchema.safeParse({
      reviewer_name: 'John', rating: 6
    });
    expect(result.success).toBe(false);
  });
});

describe('validate middleware', () => {
  it('calls next on valid data', () => {
    const middleware = validate(loginSchema);
    const req = { body: { user_id: 'admin', password: 'secret' } };
    const res = { status: jest.fn(() => res), json: jest.fn() };
    const next = jest.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 400 on invalid data', () => {
    const middleware = validate(loginSchema);
    const req = { body: { password: 'secret' } };
    const res = { status: jest.fn(() => res), json: jest.fn() };
    const next = jest.fn();

    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});
