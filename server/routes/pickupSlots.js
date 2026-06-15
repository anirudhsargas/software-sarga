const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const crypto = require('crypto');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ─── ADMIN: Generate slots for a date range ───
router.post('/pickup/slots/generate', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
  const { branch_id, start_date, end_date } = req.body;
  if (!branch_id || !start_date) return res.status(400).json({ error: 'branch_id and start_date required' });
  const start = new Date(start_date);
  const end = end_date ? new Date(end_date) : new Date(start.getTime() + 13 * 86400000);
  const slots = [];
  const current = new Date(start);

  while (current <= end) {
    if (current.getDay() !== 0) { // Skip Sundays
      const dateStr = current.toISOString().slice(0, 10);
      // Generate 30-min slots from 9 AM to 6 PM
      for (let h = 9; h < 18; h++) {
        for (let m = 0; m < 60; m += 30) {
          const startTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
          const endMin = m + 30;
          const endH = endMin >= 60 ? h + 1 : h;
          const endM = endMin >= 60 ? endMin - 60 : endMin;
          const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`;
          slots.push([branch_id, dateStr, startTime, endTime, 2, 0, 1]);
        }
      }
    }
    current.setDate(current.getDate() + 1);
  }

  if (slots.length > 0) {
    for (const s of slots) {
      try {
        await pool.query(
          'INSERT IGNORE INTO sarga_pickup_slots (branch_id, slot_date, start_time, end_time, capacity, booked, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
          s
        );
      } catch (e) { /* ignore duplicates */ }
    }
  }
  res.json({ message: `Generated ${slots.length} slots`, count: slots.length });
}));

// ─── PUBLIC: Get available slots for a date ───
router.get('/website/pickup/slots', asyncHandler(async (req, res) => {
  const { branch_id, date } = req.query;
  if (!branch_id || !date) return res.status(400).json({ error: 'branch_id and date required' });

  const [rows] = await pool.query(
    'SELECT id, start_time, end_time, capacity, booked FROM sarga_pickup_slots WHERE branch_id = ? AND slot_date = ? AND is_active = 1 AND booked < capacity ORDER BY start_time',
    [branch_id, date]
  );

  const slots = rows.map(s => ({
    ...s,
    available: Math.max(0, s.capacity - s.booked)
  }));

  res.json({ date, branch_id, slots });
}));

// ─── PUBLIC: Book a pickup slot ───
router.post('/website/pickup/book', asyncHandler(async (req, res) => {
  const { slot_id, customer_name, customer_phone, customer_email, customer_id, job_id } = req.body;
  if (!slot_id || !customer_name || !customer_phone) {
    return res.status(400).json({ error: 'slot_id, customer_name, and customer_phone required' });
  }

  const [slots] = await pool.query('SELECT * FROM sarga_pickup_slots WHERE id = ? AND is_active = 1 FOR UPDATE', [slot_id]);
  if (slots.length === 0) return res.status(404).json({ error: 'Slot not found' });
  if (slots[0].booked >= slots[0].capacity) return res.status(400).json({ error: 'Slot is full' });

  const ref = 'PU-' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString('hex').toUpperCase();
  await pool.query(
    'INSERT INTO sarga_pickup_bookings (slot_id, customer_id, customer_name, customer_phone, customer_email, job_id, reference_number) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [slot_id, customer_id || null, customer_name, customer_phone, customer_email || null, job_id || null, ref]
  );
  await pool.query('UPDATE sarga_pickup_slots SET booked = booked + 1 WHERE id = ?', [slot_id]);

  res.status(201).json({ reference_number: ref, message: 'Pickup slot booked' });
}));

// ─── PUBLIC: Check booking ───
router.get('/website/pickup/booking/:ref', asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT pb.*, ps.slot_date, ps.start_time, ps.end_time, b.name AS branch_name
     FROM sarga_pickup_bookings pb
     JOIN sarga_pickup_slots ps ON pb.slot_id = ps.id
     JOIN sarga_branches b ON ps.branch_id = b.id
     WHERE pb.reference_number = ?`,
    [req.params.ref]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Booking not found' });
  res.json({ booking: rows[0] });
}));

// ─── ADMIN: List bookings ───
router.get('/pickup/bookings', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
  const { branch_id, date, status, page = 1, limit = 50 } = req.query;
  const offset = (Math.max(1, Number(page)) - 1) * Number(limit);
  let where = '1=1';
  const params = [];
  if (branch_id) { where += ' AND ps.branch_id = ?'; params.push(branch_id); }
  if (date) { where += ' AND ps.slot_date = ?'; params.push(date); }
  if (status) { where += ' AND pb.status = ?'; params.push(status); }

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) as total FROM sarga_pickup_bookings pb JOIN sarga_pickup_slots ps ON pb.slot_id = ps.id WHERE ${where}`, params
  );
  const [rows] = await pool.query(
    `SELECT pb.*, ps.slot_date, ps.start_time, ps.end_time, b.name AS branch_name
     FROM sarga_pickup_bookings pb
     JOIN sarga_pickup_slots ps ON pb.slot_id = ps.id
     JOIN sarga_branches b ON ps.branch_id = b.id
     WHERE ${where}
     ORDER BY ps.slot_date DESC, ps.start_time ASC
     LIMIT ? OFFSET ?`,
    [...params, Number(limit), offset]
  );

  res.json({ bookings: rows, total, page: Number(page), limit: Number(limit) });
}));

// ─── ADMIN: Update booking status ───
router.put('/pickup/bookings/:id/status', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
  const { status } = req.body;
  const valid = ['confirmed', 'completed', 'cancelled', 'missed'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  await pool.query('UPDATE sarga_pickup_bookings SET status = ? WHERE id = ?', [status, req.params.id]);
  if (status === 'cancelled' || status === 'missed') {
    const [rows] = await pool.query('SELECT slot_id FROM sarga_pickup_bookings WHERE id = ?', [req.params.id]);
    if (rows.length > 0) {
      await pool.query('UPDATE sarga_pickup_slots SET booked = GREATEST(0, booked - 1) WHERE id = ?', [rows[0].slot_id]);
    }
  }
  res.json({ message: 'Booking updated' });
}));

module.exports = router;
