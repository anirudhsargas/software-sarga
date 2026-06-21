const {
  loginSchema, changePasswordSchema, branchSchema, addCustomerSchema, addJobSchema,
  addPaymentSchema, addVendorSchema, addStaffSchema, addInventorySchema,
  paperInventorySchema, consumablesInventorySchema, attendanceSchema,
  officeExpenseSchema, addPaperTypeSchema,
  addWebsiteInquirySchema, addWebsiteReviewSchema,
} = require('../middleware/validate');

function validate(schema, data) {
  try {
    return { success: true, data: schema.parse(data) };
  } catch (err) {
    return { success: false, errors: err.errors.map(e => ({ path: e.path.join('.'), message: e.message })) };
  }
}

describe('Validation Schemas', () => {
  describe('loginSchema', () => {
    it('accepts valid login', () => {
      const result = validate(loginSchema, { user_id: 'admin', password: 'secret' });
      expect(result.success).toBe(true);
    });

    it('rejects missing user_id', () => {
      const result = validate(loginSchema, { password: 'secret' });
      expect(result.success).toBe(false);
    });

    it('rejects empty password', () => {
      const result = validate(loginSchema, { user_id: 'admin', password: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('changePasswordSchema', () => {
    const validPassword = 'NewPass1@';

    it('accepts valid password', () => {
      const result = validate(changePasswordSchema, { currentPassword: 'old', newPassword: validPassword });
      expect(result.success).toBe(true);
    });

    it('rejects too short password', () => {
      const result = validate(changePasswordSchema, { currentPassword: 'old', newPassword: 'Ab1@' });
      expect(result.success).toBe(false);
    });

    it('rejects password without uppercase', () => {
      const result = validate(changePasswordSchema, { currentPassword: 'old', newPassword: 'newpass1@' });
      expect(result.success).toBe(false);
    });

    it('rejects password without lowercase', () => {
      const result = validate(changePasswordSchema, { currentPassword: 'old', newPassword: 'NEWPASS1@' });
      expect(result.success).toBe(false);
    });

    it('rejects password without number', () => {
      const result = validate(changePasswordSchema, { currentPassword: 'old', newPassword: 'NewPass@' });
      expect(result.success).toBe(false);
    });

    it('rejects password without special char', () => {
      const result = validate(changePasswordSchema, { currentPassword: 'old', newPassword: 'NewPass1' });
      expect(result.success).toBe(false);
    });
  });

  describe('branchSchema', () => {
    it('accepts valid branch', () => {
      const result = validate(branchSchema, { name: 'Main Branch' });
      expect(result.success).toBe(true);
    });

    it('rejects empty name', () => {
      const result = validate(branchSchema, { name: '' });
      expect(result.success).toBe(false);
    });

    it('accepts branch with all fields', () => {
      const result = validate(branchSchema, {
        name: 'Branch 1',
        address: '123 Street',
        phone: '9876543210',
        upi_id: 'branch@upi',
        short_name: 'BR1',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('addCustomerSchema', () => {
    it('accepts valid customer', () => {
      const result = validate(addCustomerSchema, { mobile: '9876543210', name: 'Test Customer' });
      expect(result.success).toBe(true);
    });

    it('rejects invalid mobile', () => {
      const result = validate(addCustomerSchema, { mobile: '123', name: 'Test' });
      expect(result.success).toBe(false);
    });

    it('rejects missing name', () => {
      const result = validate(addCustomerSchema, { mobile: '9876543210', name: '' });
      expect(result.success).toBe(false);
    });

    it('defaults type to Walk-in', () => {
      const result = validate(addCustomerSchema, { mobile: '9876543210', name: 'Test' });
      expect(result.success).toBe(true);
      expect(result.data.type).toBe('Walk-in');
    });

    it('accepts valid GST', () => {
      const result = validate(addCustomerSchema, { mobile: '9876543210', name: 'Test', gst: '32ABCDE1234F1Z5' });
      expect(result.success).toBe(true);
    });

    it('rejects invalid email', () => {
      const result = validate(addCustomerSchema, { mobile: '9876543210', name: 'Test', email: 'notanemail' });
      expect(result.success).toBe(false);
    });
  });

  describe('addJobSchema', () => {
    it('accepts valid job', () => {
      const result = validate(addJobSchema, {
        job_name: 'Test Job',
        quantity: 100,
        total_amount: 500,
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty job name', () => {
      const result = validate(addJobSchema, { job_name: '' });
      expect(result.success).toBe(false);
    });

    it('accepts job with all fields', () => {
      const result = validate(addJobSchema, {
        customer_id: '1',
        product_id: '2',
        branch_id: '1',
        job_name: 'Full Job',
        quantity: 500,
        unit_price: '10.50',
        total_amount: '5250',
        advance_paid: '1000',
        delivery_date: '2026-07-01',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('addPaymentSchema', () => {
    it('accepts valid payment', () => {
      const result = validate(addPaymentSchema, {
        type: 'Vendor',
        payee_name: 'Test Payee',
        amount: '1000',
        payment_date: '2026-06-21',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid type', () => {
      const result = validate(addPaymentSchema, {
        type: 'Invalid',
        payee_name: 'Test',
        amount: '100',
        payment_date: '2026-06-21',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('addVendorSchema', () => {
    it('accepts valid vendor', () => {
      const result = validate(addVendorSchema, { name: 'Test Vendor' });
      expect(result.success).toBe(true);
      expect(result.data.type).toBe('Vendor');
    });
  });

  describe('addStaffSchema', () => {
    it('accepts valid staff', () => {
      const result = validate(addStaffSchema, { mobile: '9876543210', name: 'Staff A', role: 'Admin' });
      expect(result.success).toBe(true);
    });

    it('rejects invalid role', () => {
      const result = validate(addStaffSchema, { mobile: '9876543210', name: 'Staff', role: 'SuperAdmin' });
      expect(result.success).toBe(false);
    });
  });

  describe('addInventorySchema', () => {
    it('accepts valid inventory', () => {
      const result = validate(addInventorySchema, { name: 'Paper A4' });
      expect(result.success).toBe(true);
    });
  });

  describe('paperInventorySchema', () => {
    it('accepts valid paper inventory', () => {
      const result = validate(paperInventorySchema, {
        paper_name: 'Offset Paper',
        branch: 'Perambra',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid branch', () => {
      const result = validate(paperInventorySchema, {
        paper_name: 'Test',
        branch: 'Invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('addPaperTypeSchema', () => {
    it('accepts valid paper type', () => {
      const result = validate(addPaperTypeSchema, {
        category: 'OFFSET',
        size_name: 'A4',
        width_mm: '210',
        height_mm: '297',
        gsm: '80',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('attendanceSchema', () => {
    it('accepts valid attendance', () => {
      const result = validate(attendanceSchema, {
        attendance_date: '2026-06-21',
        status: 'Present',
      });
      expect(result.success).toBe(true);
    });

    it('rejects future date', () => {
      const futureDate = '2099-12-31';
      const result = validate(attendanceSchema, {
        attendance_date: futureDate,
        status: 'Present',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('officeExpenseSchema', () => {
    it('accepts valid expense', () => {
      const result = validate(officeExpenseSchema, {
        expense_type: 'Stationery',
        amount: '500',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('addWebsiteInquirySchema', () => {
    it('accepts valid inquiry', () => {
      const result = validate(addWebsiteInquirySchema, {
        name: 'Visitor',
        email: 'visitor@test.com',
        message: 'I want to order prints',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid email', () => {
      const result = validate(addWebsiteInquirySchema, {
        name: 'Visitor',
        email: 'bad-email',
        message: 'Hello',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('addWebsiteReviewSchema', () => {
    it('accepts valid review', () => {
      const result = validate(addWebsiteReviewSchema, {
        reviewer_name: 'John',
        rating: '5',
      });
      expect(result.success).toBe(true);
    });

    it('rejects rating out of range', () => {
      const result = validate(addWebsiteReviewSchema, {
        reviewer_name: 'John',
        rating: '6',
      });
      expect(result.success).toBe(false);
    });
  });
});
