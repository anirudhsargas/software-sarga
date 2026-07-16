/**
 * Test script: run all the validation that a customer-payments POST goes through,
 * using the exact same schema and checks as the real route.
 */
const { customerPaymentSchema } = require('./schemas/paymentSchemas');

// Simulate the EXACT payload that Billing.jsx + localDb.js sends
const testPayloads = [
  {
    name: 'Basic walk-in, Cash, no discount',
    payload: {
      customer_id: null,
      customer_name: 'Walk-in Customer',
      customer_mobile: null,
      total_amount: 500,
      net_amount: 500,
      sgst_amount: 0,
      cgst_amount: 0,
      discount_percent: null,
      discount_amount: null,
      advance_paid: 500,
      payment_method: 'Cash',
      cash_amount: 500,
      upi_amount: 0,
      cheque_amount: 0,
      account_transfer_amount: 0,
      reference_number: null,
      description: null,
      payment_date: '2026-07-16',
      book_type: 'Laser',
      order_lines: [
        {
          product_id: 42,
          product_name: 'Test Product',
          job_name: null,
          description: '',
          quantity: 1,
          unit_price: 500,
          total_amount: 500,
          applied_extras: [],
          job_id: null,
          category: 'Laser',
          subcategory: 'Visiting Card',
          machine_id: null,
          id: 42,
          book_type: 'Laser',
          calculation_type: 'slab',
          is_double_side: false,
          waste_prints: 0,
          proof_prints: 0,
          colour: '',
          numbering_from: '',
          numbering_to: '',
          special_instructions: '',
          matter_text: '',
          is_inventory_item: false,
          customPaperRate: 0,
        }
      ],
      job_ids: [101],
      auto_deliver: true,
      is_internal: 0,
      internal_department: null,
    }
  },
  {
    name: 'Cash + UPI (Both), partial payment',
    payload: {
      customer_id: 5,
      customer_name: 'John Doe',
      customer_mobile: '9876543210',
      total_amount: 1000,
      net_amount: 1000,
      sgst_amount: 0,
      cgst_amount: 0,
      discount_percent: null,
      discount_amount: null,
      advance_paid: 800,
      payment_method: 'Both',
      cash_amount: 500,
      upi_amount: 300,
      cheque_amount: 0,
      account_transfer_amount: 0,
      reference_number: null,
      description: null,
      payment_date: '2026-07-16',
      book_type: 'Offset',
      order_lines: [],
      job_ids: [],
      auto_deliver: false,
      is_internal: 0,
      internal_department: null,
    }
  },
  {
    name: 'With percentage discount — potential rounding',
    payload: {
      customer_id: null,
      customer_name: 'Walk-in Customer',
      customer_mobile: null,
      total_amount: 127.49,
      net_amount: 127.49,
      sgst_amount: 0,
      cgst_amount: 0,
      discount_percent: 15.01,
      discount_amount: 22.51,
      advance_paid: 127.49,
      payment_method: 'Cash',
      cash_amount: 127.49,
      upi_amount: 0,
      cheque_amount: 0,
      account_transfer_amount: 0,
      reference_number: null,
      description: null,
      payment_date: '2026-07-16',
      book_type: 'Laser',
      order_lines: [
        {
          product_id: null,
          product_name: 'Quick Entry Item',
          job_name: null,
          description: '',
          quantity: 1,
          unit_price: 150,
          total_amount: 150,
          applied_extras: [],
          job_id: null,
          category: '',
          subcategory: '',
          machine_id: null,
        }
      ],
      job_ids: [],
      auto_deliver: true,
      is_internal: 0,
      internal_department: null,
    }
  },
  {
    name: 'Zero payment (balance only)',
    payload: {
      customer_id: 5,
      customer_name: 'John Doe',
      customer_mobile: '9876543210',
      total_amount: 500,
      net_amount: 500,
      sgst_amount: 0,
      cgst_amount: 0,
      discount_percent: null,
      discount_amount: null,
      advance_paid: 0,
      payment_method: 'Cash',
      cash_amount: 0,
      upi_amount: 0,
      cheque_amount: 0,
      account_transfer_amount: 0,
      reference_number: null,
      description: null,
      payment_date: '2026-07-16',
      book_type: 'Laser',
      order_lines: [],
      job_ids: [],
      auto_deliver: false,
      is_internal: 0,
      internal_department: null,
    }
  },
  {
    name: 'Null product_name and job_name in order_lines',
    payload: {
      customer_id: null,
      customer_name: 'Walk-in Customer',
      customer_mobile: null,
      total_amount: 200,
      net_amount: 200,
      sgst_amount: 0,
      cgst_amount: 0,
      discount_percent: null,
      discount_amount: null,
      advance_paid: 200,
      payment_method: 'UPI',
      cash_amount: 0,
      upi_amount: 200,
      cheque_amount: 0,
      account_transfer_amount: 0,
      reference_number: null,
      description: null,
      payment_date: '2026-07-16',
      book_type: 'Laser',
      order_lines: [
        {
          product_id: null,
          product_name: null,
          job_name: null,
          description: null,
          quantity: 1,
          unit_price: 200,
          total_amount: 200,
          applied_extras: [],
          job_id: null,
          category: null,
          subcategory: null,
          machine_id: null,
        }
      ],
      job_ids: [],
      auto_deliver: true,
      is_internal: 0,
      internal_department: null,
    }
  },
  {
    name: 'Empty string description and reference_number',
    payload: {
      customer_id: null,
      customer_name: 'Walk-in Customer',
      customer_mobile: null,
      total_amount: 100,
      net_amount: 100,
      sgst_amount: 0,
      cgst_amount: 0,
      discount_percent: 0,
      discount_amount: 0,
      advance_paid: 100,
      payment_method: 'Cash',
      cash_amount: 100,
      upi_amount: 0,
      cheque_amount: 0,
      account_transfer_amount: 0,
      reference_number: '',
      description: '',
      payment_date: '2026-07-16',
      book_type: 'Other',
      order_lines: [],
      job_ids: [],
      auto_deliver: false,
      is_internal: 0,
      internal_department: null,
    }
  },
  {
    name: 'discount_percent as 0 (not null)',
    payload: {
      customer_id: null,
      customer_name: 'Walk-in Customer',
      customer_mobile: null,
      total_amount: 100,
      net_amount: 100,
      sgst_amount: 0,
      cgst_amount: 0,
      discount_percent: 0,
      discount_amount: 0,
      advance_paid: 100,
      payment_method: 'Cash',
      cash_amount: 100,
      upi_amount: 0,
      cheque_amount: 0,
      account_transfer_amount: 0,
      reference_number: null,
      description: null,
      payment_date: '2026-07-16',
      book_type: 'Laser',
      order_lines: [],
      job_ids: [],
      auto_deliver: true,
      is_internal: 0,
      internal_department: null,
    }
  },
  {
    name: 'order_lines with extra passthrough fields like id, book_type, colour, etc.',
    payload: {
      customer_id: null,
      customer_name: 'Walk-in Customer',
      customer_mobile: null,
      total_amount: 500,
      net_amount: 500,
      sgst_amount: 0,
      cgst_amount: 0,
      discount_percent: null,
      discount_amount: null,
      advance_paid: 500,
      payment_method: 'Cash',
      cash_amount: 500,
      upi_amount: 0,
      cheque_amount: 0,
      account_transfer_amount: 0,
      reference_number: '',
      description: '',
      payment_date: '2026-07-16',
      book_type: 'Laser',
      order_lines: [
        {
          id: 42,
          product_id: 42,
          product_name: 'Visiting Card',
          job_name: null,
          description: '',
          quantity: 500,
          unit_price: 1,
          total_amount: 500,
          applied_extras: [],
          job_id: null,
          category: 'Laser',
          subcategory: 'Cards',
          machine_id: 3,
          book_type: 'Laser',
          calculation_type: 'slab',
          is_double_side: false,
          waste_prints: 0,
          proof_prints: 0,
          colour: 'Full Colour',
          numbering_from: '',
          numbering_to: '',
          special_instructions: 'Glossy finish',
          matter_text: '',
          is_inventory_item: false,
          customPaperRate: 0,
          paper_size: 'A4',
          paper_type: 'Art Card 300gsm',
        }
      ],
      job_ids: [201],
      auto_deliver: true,
      is_internal: 0,
      internal_department: null,
    }
  },
];

console.log('=== Testing customerPaymentSchema against typical payloads ===\n');

let failures = 0;
for (const test of testPayloads) {
  try {
    const result = customerPaymentSchema.parse(test.payload);
    console.log(`✅ PASS: ${test.name}`);
  } catch (err) {
    failures++;
    console.log(`❌ FAIL: ${test.name}`);
    if (err.errors) {
      err.errors.forEach(e => {
        console.log(`   Field: [${e.path.join('.')}]  Message: ${e.message}  Received: ${JSON.stringify(e.received)}`);
      });
    } else {
      console.log(`   Error: ${err.message}`);
    }
  }
  console.log();
}

console.log(`\n=== Results: ${testPayloads.length - failures}/${testPayloads.length} passed ===`);

if (failures === 0) {
  console.log('\nAll payloads pass Zod. The 400 might come from route-level checks.');
  console.log('Testing route-level checks...\n');
  
  for (const test of testPayloads) {
    const d = test.payload;
    const total = Number(d.total_amount) || 0;
    const advance = Number(d.advance_paid) || 0;
    const cash = Number(d.cash_amount) || 0;
    const upi = Number(d.upi_amount) || 0;
    const cheque = Number(d.cheque_amount) || 0;
    const transfer = Number(d.account_transfer_amount) || 0;
    
    // C-03: negative check
    if (total < 0 || advance < 0 || cash < 0 || upi < 0 || cheque < 0 || transfer < 0) {
      console.log(`❌ ROUTE FAIL [${test.name}]: Amounts cannot be negative`);
      continue;
    }
    // C-03: advance exceeds total
    if (advance > Math.max(total * 1.01, total + 1)) {
      console.log(`❌ ROUTE FAIL [${test.name}]: Advance (${advance}) > total (${total})`);
      continue;
    }
    // C-07: method total != advance
    const methodTotal = cash + upi + cheque + transfer;
    if (Math.abs(methodTotal - advance) > 1) {
      console.log(`❌ ROUTE FAIL [${test.name}]: methodTotal (${methodTotal}) != advance (${advance})`);
      continue;
    }
    // At least one method
    if (advance > 0 && methodTotal <= 0) {
      console.log(`❌ ROUTE FAIL [${test.name}]: advance > 0 but no method has amount`);
      continue;
    }
    console.log(`✅ ROUTE PASS: ${test.name}`);
  }
}
