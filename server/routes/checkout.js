const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const logger = require('../helpers/logger');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { invalidateDashboardCache, invalidateAnalyticsCache } = require('../services/cacheService');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function generateOrderNumber() {
  const prefix = 'SARGA';
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${ts}${rand}`;
}

function getCustomerId(req) {
  try {
    const jwt = require('jsonwebtoken');
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.split(' ')[1] : null;
    if (!token) return null;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.id || null;
  } catch { return null; }
}

// ─── CART API ───

// POST /api/checkout/cart - Create/get cart session
router.post('/checkout/cart', asyncHandler(async (req, res) => {
  const customerId = getCustomerId(req);
  const sessionId = req.headers['x-sarga-uuid'] || uuidv4();

  // Check for existing active cart
  let [carts] = await pool.query(
    'SELECT id, customer_id, session_id, status, created_at, updated_at FROM sarga_carts WHERE (customer_id = ? OR session_id = ?) AND status = "active" ORDER BY created_at DESC LIMIT 1',
    [customerId || 0, sessionId]
  );

  let cart;
  if (carts.length > 0) {
    cart = carts[0];
    // Update customer_id if now logged in
    if (customerId && !cart.customer_id) {
      await pool.query('UPDATE sarga_carts SET customer_id = ? WHERE id = ?', [customerId, cart.id]);
      cart.customer_id = customerId;
    }
  } else {
    const [result] = await pool.query(
      'INSERT INTO sarga_carts (customer_id, session_id) VALUES (?, ?)',
      [customerId, sessionId]
    );
    cart = { id: result.insertId, customer_id: customerId, session_id: sessionId, items: [] };
  }

  // Get items
  const [items] = await pool.query(
    'SELECT ci.*, p.image_url FROM sarga_cart_items ci LEFT JOIN sarga_products p ON ci.product_id = p.id WHERE ci.cart_id = ?',
    [cart.id]
  );

  res.json({ cart: { ...cart, items } });
}));

// POST /api/checkout/cart/items - Add item to cart
router.post('/checkout/cart/items', asyncHandler(async (req, res) => {
  const customerId = getCustomerId(req);
  const sessionId = req.headers['x-sarga-uuid'] || uuidv4();
  const {
    product_id, product_name, quantity, unit_price, setup_fee,
    size, gsm, paper_type, color_count, finishes, design_file_url,
    design_notes, branch_id
  } = req.body;

  if (!product_id || !quantity) {
    return res.status(400).json({ error: 'product_id and quantity required' });
  }

  // Get or create cart
  let [carts] = await pool.query(
    'SELECT id, customer_id, session_id, status, created_at, updated_at FROM sarga_carts WHERE (customer_id = ? OR session_id = ?) AND status = "active" ORDER BY created_at DESC LIMIT 1',
    [customerId || 0, sessionId]
  );
  let cartId;
  if (carts.length > 0) {
    cartId = carts[0].id;
    if (customerId && !carts[0].customer_id) {
      await pool.query('UPDATE sarga_carts SET customer_id = ?, branch_id = COALESCE(?, branch_id) WHERE id = ?', [customerId, branch_id || null, cartId]);
    }
  } else {
    const [result] = await pool.query(
      'INSERT INTO sarga_carts (customer_id, session_id, branch_id) VALUES (?, ?, ?)',
      [customerId, sessionId, branch_id || null]
    );
    cartId = result.insertId;
  }

  const qty = Number(quantity) || 1;
  const price = Number(unit_price) || 0;
  const setup = Number(setup_fee) || 0;
  const lineTotal = (qty * price) + setup;

  const [result] = await pool.query(
    `INSERT INTO sarga_cart_items 
     (cart_id, product_id, product_name, quantity, unit_price, setup_fee, 
      size, gsm, paper_type, color_count, finishes, design_file_url, design_notes, line_total)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [cartId, product_id, product_name || null, qty, price, setup,
     size || null, gsm || null, paper_type || null, color_count || null,
     finishes ? JSON.stringify(finishes) : null, design_file_url || null,
     design_notes || null, lineTotal]
  );

  // Update cart totals
  await recalcCart(cartId);

  res.status(201).json({ id: result.insertId, cart_id: cartId, message: 'Item added to cart' });
}));

// GET /api/checkout/cart/items - Get cart items
router.get('/checkout/cart/items', asyncHandler(async (req, res) => {
  const customerId = getCustomerId(req);
  const sessionId = req.headers['x-sarga-uuid'] || uuidv4();

  let [carts] = await pool.query(
    'SELECT id, customer_id, session_id, status, created_at, updated_at FROM sarga_carts WHERE (customer_id = ? OR session_id = ?) AND status = "active" ORDER BY created_at DESC LIMIT 1',
    [customerId || 0, sessionId]
  );
  if (carts.length === 0) return res.json({ items: [], cart: null });

  const cart = carts[0];
  const [items] = await pool.query(
    `SELECT ci.*, p.image_url, p.name AS product_display_name
     FROM sarga_cart_items ci
     LEFT JOIN sarga_products p ON ci.product_id = p.id
     WHERE ci.cart_id = ?`,
    [cart.id]
  );

  res.json({ items, cart: { id: cart.id, subtotal: cart.subtotal, gst_amount: cart.gst_amount, total: cart.total } });
}));

// PUT /api/checkout/cart/items/:id - Update item quantity
router.put('/checkout/cart/items/:id', asyncHandler(async (req, res) => {
  const { quantity, finishes } = req.body;
  const [[item]] = await pool.query('SELECT * FROM sarga_cart_items WHERE id = ?', [req.params.id]);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const qty = quantity !== undefined ? Number(quantity) : item.quantity;
  const price = Number(item.unit_price);
  const setup = Number(item.setup_fee);
  const lineTotal = (qty * price) + setup;

  await pool.query(
    'UPDATE sarga_cart_items SET quantity = ?, line_total = ?, finishes = ? WHERE id = ?',
    [qty, lineTotal, finishes ? JSON.stringify(finishes) : item.finishes, req.params.id]
  );

  await recalcCart(item.cart_id);
  res.json({ message: 'Item updated' });
}));

// DELETE /api/checkout/cart/items/:id - Remove item
router.delete('/checkout/cart/items/:id', asyncHandler(async (req, res) => {
  const [[item]] = await pool.query('SELECT cart_id FROM sarga_cart_items WHERE id = ?', [req.params.id]);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  await pool.query('DELETE FROM sarga_cart_items WHERE id = ?', [req.params.id]);
  await recalcCart(item.cart_id);
  res.json({ message: 'Item removed' });
}));

async function recalcCart(cartId) {
  const [items] = await pool.query('SELECT line_total, setup_fee FROM sarga_cart_items WHERE cart_id = ?', [cartId]);
  let subtotal = 0;
  items.forEach(i => { subtotal += Number(i.line_total); });
  const gstAmount = subtotal * 0.18;
  const total = subtotal + gstAmount;
  await pool.query(
    'UPDATE sarga_carts SET subtotal = ?, gst_amount = ?, total = ? WHERE id = ?',
    [subtotal, gstAmount, total, cartId]
  );
}

// ─── COUPON / DISCOUNT ───

// POST /api/checkout/coupon/apply
router.post('/checkout/coupon/apply', asyncHandler(async (req, res) => {
  const { code, cart_id } = req.body;
  if (!code) return res.status(400).json({ error: 'Coupon code required' });

  const [[coupon]] = await pool.query(
    'SELECT id, code, discount_type, discount_value, max_discount_amount, max_uses, used_count, min_order_amount, expiry_date, is_active FROM sarga_coupons WHERE code = ? AND is_active = 1 AND expiry_date >= CURDATE() AND (max_uses IS NULL OR used_count < max_uses) LIMIT 1',
    [code]
  );
  if (!coupon) return res.status(400).json({ error: 'Invalid or expired coupon' });

  const [[cart]] = await pool.query('SELECT id, customer_id, session_id, status, subtotal, gst_amount, total, created_at, updated_at FROM sarga_carts WHERE id = ?', [cart_id]);
  if (!cart) return res.status(404).json({ error: 'Cart not found' });

  let discount = 0;
  if (coupon.discount_type === 'percent') {
    discount = Number(cart.subtotal) * (Number(coupon.discount_value) / 100);
    if (coupon.max_discount_amount) discount = Math.min(discount, Number(coupon.max_discount_amount));
  } else {
    discount = Number(coupon.discount_value);
  }

  const newTotal = Number(cart.total) - discount;
  await pool.query(
    'UPDATE sarga_carts SET coupon_code = ?, discount_amount = ?, total = ? WHERE id = ?',
    [code, discount, Math.max(0, newTotal), cart_id]
  );

  res.json({ discount, new_total: Math.max(0, newTotal), message: 'Coupon applied' });
}));

// ─── CHECKOUT & PAYMENT ───

// POST /api/checkout/create-order - Create order from cart (before payment)
router.post('/checkout/create-order', asyncHandler(async (req, res) => {
  const customerId = getCustomerId(req);
  const _sessionId = req.headers['x-sarga-uuid'] || uuidv4();
  const { cart_id, payment_method, delivery_method, pickup_slot_id, gst_number, billing_address, delivery_address, customer_name, customer_phone, customer_email, notes } = req.body;

  if (!cart_id) return res.status(400).json({ error: 'cart_id required' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[cart]] = await conn.query('SELECT * FROM sarga_carts WHERE id = ? AND status = "active"', [cart_id]);
    if (!cart) {
      await conn.rollback();
      return res.status(404).json({ error: 'Cart not found or already converted' });
    }

    const [items] = await conn.query('SELECT * FROM sarga_cart_items WHERE cart_id = ?', [cart_id]);
    if (items.length === 0) {
      await conn.rollback();
      return res.status(400).json({ error: 'Cart is empty' });
    }

    // Get customer info
    let name = customer_name;
    let phone = customer_phone;
    let email = customer_email;
    if (!name && customerId) {
      const [[cust]] = await conn.query('SELECT name, mobile, email FROM sarga_customers WHERE id = ?', [customerId]);
      if (cust) { name = name || cust.name; phone = phone || cust.mobile; email = email || cust.email; }
    }

    if (!name || !phone) {
      await conn.rollback();
      return res.status(400).json({ error: 'Customer name and phone required' });
    }

    const orderNumber = generateOrderNumber();
    const paymentType = payment_method === 'partial' ? 'partial' : 'full';
    const advancePercent = paymentType === 'partial' ? 0.5 : 1;
    const advanceAmount = Number(cart.total) * advancePercent;

    const [result] = await conn.query(
      `INSERT INTO sarga_orders 
       (order_number, customer_id, customer_name, customer_phone, customer_email, branch_id, cart_id,
        items, subtotal, gst_amount, discount_amount, total, advance_paid, balance_amount,
        payment_method, gst_number, billing_address, delivery_address, delivery_method, pickup_slot_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [orderNumber, customerId, name, phone, email, cart.branch_id || 1, cart_id,
       JSON.stringify(items), cart.subtotal, cart.gst_amount, cart.discount_amount, cart.total,
       paymentType === 'full' ? cart.total : advanceAmount,
       paymentType === 'full' ? 0 : Number(cart.total) - advanceAmount,
       paymentType, gst_number || null, billing_address || null,
       delivery_address || null, delivery_method || 'pickup', pickup_slot_id || null, notes || null]
    );

    const orderId = result.insertId;

    // Mark cart as converted
    await conn.query('UPDATE sarga_carts SET status = "converted" WHERE id = ?', [cart_id]);

    // Create job entries for each cart item
    for (const item of items) {
      try {
        const [[product]] = await conn.query(
          'SELECT id, name, subcategory_id FROM sarga_products WHERE id = ?', [item.product_id]
        );
        if (product) {
          await conn.query(
            `INSERT INTO sarga_jobs (customer_id, product_id, branch_id, job_number, job_name, quantity, unit_price, total_amount, advance_paid, balance_amount, status, payment_status, description, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', ?, NOW())`,
            [customerId, product.id, cart.branch_id || 1,
             `WEB-${orderNumber}-${item.id}`, item.product_name || product.name,
             item.quantity, item.unit_price, item.line_total,
             paymentType === 'full' ? item.line_total : item.line_total * 0.5,
             paymentType === 'full' ? 0 : item.line_total * 0.5,
             `Web order ${orderNumber}: ${item.design_notes || ''}`
            ]
          );
        }
      } catch (err) {
        logger.error('[Checkout] Job creation error:', err.message);
      }
    }

    await conn.commit();

    res.status(201).json({
      order_id: orderId,
      order_number: orderNumber,
      amount: cart.total,
      advance_amount: advanceAmount,
      payment_type: paymentType,
      message: 'Order created successfully'
    });
  } catch (err) {
    await conn.rollback();
    logger.error('[Checkout] create-order transaction failed:', err);
    res.status(500).json({ error: 'Checkout failed, no changes were saved.' });
  } finally {
    conn.release();
  }
}));

// POST /api/checkout/verify-payment - Verify Razorpay payment
router.post('/checkout/verify-payment', asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment verification fields' });
  }

  // Verify signature
  const body = razorpay_order_id + '|' + razorpay_payment_id;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    logger.error('[Checkout] Razorpay key secret missing during payment verification');
    return res.status(500).json({ error: 'Payment verification unavailable' });
  }
  const expectedSig = crypto
    .createHmac('sha256', keySecret)
    .update(body)
    .digest('hex');

  const verified = expectedSig === razorpay_signature;

  await pool.query(
    `UPDATE sarga_payment_transactions 
     SET razorpay_payment_id = ?, razorpay_signature = ?, status = ?, method = ?
     WHERE razorpay_order_id = ?`,
    [razorpay_payment_id, razorpay_signature, verified ? 'captured' : 'failed',
     req.body.method || 'unknown', razorpay_order_id]
  );

  if (verified) {
    const [[txn]] = await pool.query(
      'SELECT * FROM sarga_payment_transactions WHERE razorpay_order_id = ?', [razorpay_order_id]
    );
    if (txn && txn.order_id) {
      await pool.query(
        'UPDATE sarga_orders SET payment_status = "completed", status = "confirmed", razorpay_payment_id = ? WHERE id = ?',
        [razorpay_payment_id, txn.order_id]
      );

      // Also update the related jobs
      const [[order]] = await pool.query('SELECT * FROM sarga_orders WHERE id = ?', [txn.order_id]);
      if (order) {
        // Update job payment statuses
        const jobRef = `WEB-${order.order_number}%`;
        await pool.query(
          "UPDATE sarga_jobs SET payment_status = 'completed', advance_paid = total_amount, balance_amount = 0, status = 'confirmed' WHERE description LIKE ?",
          [jobRef]
        );
        // Log to customer payments
        await pool.query(
          `INSERT INTO sarga_customer_payments (customer_id, customer_name, customer_mobile, total_amount, advance_paid, balance_amount, payment_method, reference_number, description, branch_id, payment_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE())`,
          [order.customer_id, order.customer_name, order.customer_phone,
           order.total, order.total, 0, 'Online', order.order_number,
           'Web checkout payment via Razorpay', order.branch_id || 1]
        );
      }
    }

    logger.info(`[Checkout] Payment verified for order ${razorpay_order_id}`);
    res.json({ verified: true, message: 'Payment verified successfully' });
    invalidateDashboardCache().catch(() => {});
    invalidateAnalyticsCache().catch(() => {});
  } else {
    logger.warn(`[Checkout] Payment verification FAILED for ${razorpay_order_id}`);
    res.status(400).json({ verified: false, message: 'Payment verification failed' });
  }
}));

// GET /api/checkout/order/:orderNumber - Get order details
router.get('/checkout/order/:orderNumber', asyncHandler(async (req, res) => {
  const [[order]] = await pool.query(
    `SELECT o.*, b.name AS branch_name
     FROM sarga_orders o
     LEFT JOIN sarga_branches b ON o.branch_id = b.id
     WHERE o.order_number = ?`,
    [req.params.orderNumber]
  );
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const [transactions] = await pool.query(
    'SELECT * FROM sarga_payment_transactions WHERE order_id = ? ORDER BY created_at DESC',
    [order.id]
  );

  res.json({ order, transactions });
}));

// GET /api/checkout/orders - List customer orders
router.get('/checkout/orders', asyncHandler(async (req, res) => {
  const customerId = getCustomerId(req);
  const _sessionId = req.headers['x-sarga-uuid'] || uuidv4();

  let where = 'o.customer_id = ?';
  let params = [customerId];
  if (!customerId) {
    where = 'o.customer_phone = (SELECT mobile FROM sarga_customers WHERE id = ?)';
    params = [0];
  }

  const [orders] = await pool.query(
    `SELECT o.id, o.order_number, o.total, o.status, o.payment_status, o.created_at,
            b.name AS branch_name
     FROM sarga_orders o
     LEFT JOIN sarga_branches b ON o.branch_id = b.id
     WHERE ${where}
     ORDER BY o.created_at DESC
     LIMIT 20`,
    params
  );

  res.json({ orders });
}));

// ─── GST INVOICE ───

// GET /api/checkout/order/:orderNumber/invoice - Generate GST invoice PDF
router.get('/checkout/order/:orderNumber/invoice', asyncHandler(async (req, res) => {
  const [[order]] = await pool.query(
    `SELECT o.*, b.name AS branch_name, b.address AS branch_address, b.phone AS branch_phone, b.email AS branch_email
     FROM sarga_orders o
     LEFT JOIN sarga_branches b ON o.branch_id = b.id
     WHERE o.order_number = ?`,
    [req.params.orderNumber]
  );
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []);

  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="invoice-${order.order_number}.pdf"`);
  doc.pipe(res);

  // Header
  doc.fontSize(20).font('Helvetica-Bold').text('Sarga Printing', { align: 'center' });
  doc.fontSize(10).font('Helvetica').text(order.branch_name || 'Perambra', { align: 'center' });
  if (order.branch_address) doc.text(order.branch_address, { align: 'center' });
  if (order.branch_phone) doc.text(`Phone: ${order.branch_phone}`, { align: 'center' });
  doc.moveDown();

  // Invoice title
  doc.fontSize(14).font('Helvetica-Bold').text('GST INVOICE', { align: 'center' });
  doc.moveDown(0.5);

  // Details
  const leftX = 50;
  const rightX = 350;
  doc.fontSize(9).font('Helvetica');
  doc.text(`Invoice No: INV-${order.order_number}`, leftX);
  doc.text(`Date: ${new Date(order.created_at).toLocaleDateString('en-IN')}`, leftX);
  doc.text(`Order No: ${order.order_number}`, leftX);
  doc.moveDown();
  doc.text(`Customer: ${order.customer_name || ''}`, leftX);
  doc.text(`Phone: ${order.customer_phone || ''}`, leftX);
  if (order.gst_number) doc.text(`GST: ${order.gst_number}`, leftX);
  if (order.billing_address) doc.text(`Address: ${order.billing_address}`, leftX);
  doc.moveDown();

  // Table header
  const tableTop = doc.y;
  const col1 = 50, col2 = 180, col3 = 300, col4 = 370, col5 = 440, _col6 = 510;
  doc.fontSize(9).font('Helvetica-Bold');
  doc.text('Item', col1, tableTop);
  doc.text('Qty', col2, tableTop);
  doc.text('Rate', col3, tableTop);
  doc.text('Setup', col4, tableTop);
  doc.text('Amount', col5, tableTop);
  doc.moveDown(0.3);
  doc.moveTo(50, doc.y).lineTo(560, doc.y).stroke();
  doc.moveDown(0.2);

  doc.font('Helvetica').fontSize(8);
  let y = doc.y;
  (items || []).forEach(item => {
    const name = item.product_name || 'Item';
    doc.text(String(name).substring(0, 25), col1, y);
    doc.text(String(item.quantity || 1), col2, y);
    doc.text(`₹${Number(item.unit_price).toFixed(2)}`, col3, y);
    doc.text(`₹${Number(item.setup_fee).toFixed(2)}`, col4, y);
    doc.text(`₹${Number(item.line_total).toFixed(2)}`, col5, y);
    y += 16;
  });

  doc.moveDown();
  doc.moveTo(50, y).lineTo(560, y).stroke();
  doc.moveDown();
  y = doc.y;

  // Totals
  doc.fontSize(10).font('Helvetica-Bold');
  doc.text(`Subtotal: ₹${Number(order.subtotal).toFixed(2)}`, rightX, y);
  y += 18;
  doc.text(`GST (18%): ₹${Number(order.gst_amount).toFixed(2)}`, rightX, y);
  y += 18;
  if (Number(order.discount_amount) > 0) {
    doc.text(`Discount: -₹${Number(order.discount_amount).toFixed(2)}`, rightX, y);
    y += 18;
  }
  doc.fontSize(12);
  doc.text(`Total: ₹${Number(order.total).toFixed(2)}`, rightX, y);
  y += 24;

  doc.fontSize(8).font('Helvetica').text('Thank you for your business!', 50, y + 20, { align: 'center' });
  doc.end();
}));

module.exports = router;
