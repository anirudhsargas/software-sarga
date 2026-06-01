const express = require('express');
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../helpers/logger');

module.exports = () => {
  const router = express.Router();

  // Helper function to convert time string (HH:MM or HH:MM:SS) to minutes from midnight
  const timeToMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    const hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;
    return hours * 60 + minutes;
  };

  // Helper function to format minutes from midnight to HH:MM string
  const minutesToTimeStr = (totalMinutes) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  };

  // -------------------------------------------------------------
  // ─── PUBLIC ENDPOINTS (Website) ───
  // -------------------------------------------------------------

  // 1. Get all active print samples for catalog browsing
  router.get('/website/samples', async (req, res) => {
    try {
      const [rows] = await pool.query(
        'SELECT id, name, category, description, stock_quantity, is_active FROM sarga_print_samples WHERE is_active = 1 ORDER BY category, name'
      );
      res.json({ samples: rows });
    } catch (err) {
      logger.error('[PremiumFeatures] Error fetching samples:', err.message);
      res.status(500).json({ message: 'Unable to load print samples.' });
    }
  });

  // 2. Submit a new physical print sample request (Builder)
  router.post('/website/samples/request', async (req, res) => {
    const {
      customer_name,
      customer_phone,
      customer_email,
      delivery_method,
      branch_id,
      address_line1,
      address_line2,
      city,
      state,
      pincode,
      notes,
      sample_ids // Array of integers
    } = req.body;

    // Validations
    if (!customer_name || !customer_phone) {
      return res.status(400).json({ message: 'Customer name and phone number are required.' });
    }
    if (!sample_ids || !Array.isArray(sample_ids) || sample_ids.length === 0) {
      return res.status(400).json({ message: 'You must select at least one sample.' });
    }
    if (sample_ids.length > 5) {
      return res.status(400).json({ message: 'Maximum limit of 5 samples exceeded.' });
    }
    if (delivery_method === 'Pickup' && !branch_id) {
      return res.status(400).json({ message: 'Please select a pickup branch.' });
    }
    if (delivery_method === 'Courier') {
      if (!address_line1 || !city || !pincode) {
        return res.status(400).json({ message: 'Please complete all required shipping fields.' });
      }
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Create request entry
      const [result] = await connection.query(
        `INSERT INTO sarga_print_sample_requests 
         (customer_name, customer_phone, customer_email, delivery_method, branch_id, address_line1, address_line2, city, state, pincode, notes, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
        [
          customer_name,
          customer_phone,
          customer_email || null,
          delivery_method || 'Pickup',
          delivery_method === 'Pickup' ? branch_id : null,
          delivery_method === 'Courier' ? address_line1 : null,
          delivery_method === 'Courier' ? address_line2 : null,
          delivery_method === 'Courier' ? city : null,
          delivery_method === 'Courier' ? (state || 'Kerala') : null,
          delivery_method === 'Courier' ? pincode : null,
          notes || null
        ]
      );

      const requestId = result.insertId;

      // Link requested sample items
      for (const sampleId of sample_ids) {
        await connection.query(
          'INSERT INTO sarga_print_sample_request_items (request_id, sample_id) VALUES (?, ?)',
          [requestId, sampleId]
        );
      }

      await connection.commit();

      // Simulated WhatsApp Confirmation Payload
      const waPayload = {
        phone: customer_phone,
        message: `Hello ${customer_name}, Sarga Printing has received your physical print sample request #${requestId}! Selected samples: ${sample_ids.length} items. Delivery option: ${delivery_method}. We will update you shortly.`
      };

      res.status(201).json({
        message: 'Your sample request has been submitted successfully!',
        request_id: requestId,
        whatsapp_simulated: waPayload
      });
    } catch (err) {
      await connection.rollback();
      logger.error('[PremiumFeatures] Error submitting sample request:', err.message);
      res.status(500).json({ message: 'Unable to submit sample request. Please try again.' });
    } finally {
      connection.release();
    }
  });

  // 3. Get available consultation time slots for a specific date and duration (Calendly engine)
  router.get('/website/consultations/slots', async (req, res) => {
    const { date, duration } = req.query; // YYYY-MM-DD, duration in minutes
    if (!date) {
      return res.status(400).json({ message: 'Date parameter is required.' });
    }

    const meetingDuration = parseInt(duration, 10) || 15;

    try {
      // Fetch existing bookings for this date that are not cancelled
      const [existingBookings] = await pool.query(
        `SELECT start_time, duration 
         FROM sarga_design_consultations 
         WHERE date = ? AND status != 'Cancelled'`,
        [date]
      );

      // Define standard operational hours: 9:00 AM to 5:00 PM (17:00)
      const dayStart = 9 * 60; // 540 min
      const dayEnd = 17 * 60; // 1020 min

      // Generate all candidate slots based on meeting duration intervals (15 or 30 mins)
      const interval = meetingDuration; // E.g., slots every 15 mins or 30 mins
      const candidateSlots = [];
      
      for (let minutes = dayStart; minutes + meetingDuration <= dayEnd; minutes += interval) {
        candidateSlots.push(minutes);
      }

      // Filter out overlapping slots
      // A candidate slot starting at C overlaps with existing booking [S, S + D] if:
      // C < S + D AND C + duration > S
      const availableSlots = candidateSlots.filter((slotMin) => {
        const slotEndMin = slotMin + meetingDuration;
        
        for (const booking of existingBookings) {
          const bookingMin = timeToMinutes(booking.start_time);
          const bookingEndMin = bookingMin + booking.duration;

          if (slotMin < bookingEndMin && slotEndMin > bookingMin) {
            return false; // Clashes with existing booking
          }
        }
        return true;
      });

      // Format minutes to HH:MM time strings
      const formattedSlots = availableSlots.map(min => minutesToTimeStr(min));

      res.json({ slots: formattedSlots });
    } catch (err) {
      logger.error('[PremiumFeatures] Error generating available slots:', err.message);
      res.status(500).json({ message: 'Unable to calculate available slots.' });
    }
  });

  // 4. Book a new design consultation appointment
  router.post('/website/consultations/book', async (req, res) => {
    const {
      customer_name,
      customer_phone,
      customer_email,
      consultation_type,
      meeting_mode,
      preferred_branch_id,
      date,
      start_time,
      duration,
      notes
    } = req.body;

    if (!customer_name || !customer_phone || !consultation_type || !meeting_mode || !date || !start_time) {
      return res.status(400).json({ message: 'Please complete all required fields.' });
    }

    const meetingDuration = parseInt(duration, 10) || 15;

    // Check if slot clashes in database before booking (double prevention)
    try {
      const [existingBookings] = await pool.query(
        `SELECT start_time, duration 
         FROM sarga_design_consultations 
         WHERE date = ? AND status != 'Cancelled'`,
        [date]
      );

      const newStart = timeToMinutes(start_time);
      const newEnd = newStart + meetingDuration;

      const clashing = existingBookings.some((booking) => {
        const bookingStart = timeToMinutes(booking.start_time);
        const bookingEnd = bookingStart + booking.duration;
        return newStart < bookingEnd && newEnd > bookingStart;
      });

      if (clashing) {
        return res.status(400).json({ message: 'This slot is no longer available. Please select another time.' });
      }

      const [result] = await pool.query(
        `INSERT INTO sarga_design_consultations 
         (customer_name, customer_phone, customer_email, consultation_type, meeting_mode, preferred_branch_id, date, start_time, duration, notes, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
        [
          customer_name,
          customer_phone,
          customer_email || null,
          consultation_type,
          meeting_mode,
          meeting_mode === 'In-Person' ? preferred_branch_id : null,
          date,
          start_time,
          meetingDuration,
          notes || null
        ]
      );

      const bookingId = result.insertId;

      // Simulated WhatsApp Confirmation Payload
      const waPayload = {
        phone: customer_phone,
        message: `Hi ${customer_name}, your Sarga Design Consultation is successfully booked! ID: #${bookingId}, Date: ${date}, Time: ${start_time} (${meetingDuration} mins), Mode: ${meeting_mode}. Meeting details will be sent soon.`
      };

      res.status(201).json({
        message: 'Your design consultation slot has been booked successfully!',
        booking_id: bookingId,
        whatsapp_simulated: waPayload
      });
    } catch (err) {
      logger.error('[PremiumFeatures] Error booking consultation:', err.message);
      res.status(500).json({ message: 'Unable to book consultation. Please try again.' });
    }
  });


  // -------------------------------------------------------------
  // ─── ADMIN ENDPOINTS (CMS Panel - Requires auth) ───
  // -------------------------------------------------------------

  // Helper middleware role checker inside our file
  const requireAdminRoles = (req, res, next) => {
    if (!req.user || !['Admin', 'Front Office', 'Designer', 'Accountant'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }
    next();
  };

  // 1. Fetch physical sample requests list (with full items list and joined branch info)
  router.get('/admin/sample-requests', authenticateToken, requireAdminRoles, async (req, res) => {
    try {
      const [requests] = await pool.query(
        `SELECT r.*, b.name AS branch_name
         FROM sarga_print_sample_requests r
         LEFT JOIN sarga_branches b ON r.branch_id = b.id
         ORDER BY r.created_at DESC`
      );

      // Fetch items for all requests
      const [items] = await pool.query(
        `SELECT ri.request_id, s.id AS sample_id, s.name AS sample_name, s.category AS sample_category
         FROM sarga_print_sample_request_items ri
         JOIN sarga_print_samples s ON ri.sample_id = s.id`
      );

      // Group items by request ID
      const itemsByRequest = {};
      items.forEach((item) => {
        if (!itemsByRequest[item.request_id]) {
          itemsByRequest[item.request_id] = [];
        }
        itemsByRequest[item.request_id].push(item);
      });

      // Map items array back into each request object
      const enrichedRequests = requests.map((req) => ({
        ...req,
        samples: itemsByRequest[req.id] || []
      }));

      res.json({ requests: enrichedRequests });
    } catch (err) {
      logger.error('[PremiumFeatures] Admin error fetching sample requests:', err.message);
      res.status(500).json({ message: 'Database error fetching requests.' });
    }
  });

  // 2. Update Sample Request status (handles stock decrement on dispatch/pickup)
  router.put('/admin/sample-requests/:id', authenticateToken, requireAdminRoles, async (req, res) => {
    const requestId = req.params.id;
    const { status, tracking_number, notes } = req.body;

    if (!status) {
      return res.status(400).json({ message: 'Status is required.' });
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // 1. Retrieve the current request status and selected sample IDs
      const [requests] = await connection.query(
        'SELECT status FROM sarga_print_sample_requests WHERE id = ?',
        [requestId]
      );
      
      const currentRequest = requests[0];
      if (!currentRequest) {
        await connection.rollback();
        return res.status(404).json({ message: 'Sample request not found.' });
      }

      const oldStatus = currentRequest.status;
      const newStatus = status;

      // 2. Check if we need to decrement inventory stock:
      // Transitioning from (Pending or Approved) to (Dispatched, Ready for Pickup, or Completed)
      const wasDispatchedOrSimilar = ['Dispatched', 'Ready for Pickup', 'Completed'].includes(oldStatus);
      const isNowDispatchedOrSimilar = ['Dispatched', 'Ready for Pickup', 'Completed'].includes(newStatus);

      if (!wasDispatchedOrSimilar && isNowDispatchedOrSimilar) {
        // Fetch selected samples
        const [requestedItems] = await connection.query(
          'SELECT sample_id FROM sarga_print_sample_request_items WHERE request_id = ?',
          [requestId]
        );

        // Decrement stock by 1 for each item
        for (const item of requestedItems) {
          await connection.query(
            `UPDATE sarga_print_samples 
             SET stock_quantity = GREATEST(0, stock_quantity - 1) 
             WHERE id = ?`,
            [item.sample_id]
          );
        }
      }

      // 3. Update the request details
      await connection.query(
        `UPDATE sarga_print_sample_requests 
         SET status = ?, tracking_number = COALESCE(?, tracking_number), notes = COALESCE(?, notes)
         WHERE id = ?`,
        [newStatus, tracking_number || null, notes || null, requestId]
      );

      await connection.commit();
      res.json({ message: 'Request status updated successfully!', request_id: requestId, oldStatus, newStatus });
    } catch (err) {
      await connection.rollback();
      logger.error('[PremiumFeatures] Admin error updating sample request:', err.message);
      res.status(500).json({ message: 'Database error updating status.' });
    } finally {
      connection.release();
    }
  });

  // 3. Retrieve all master samples list for inventory tracking
  router.get('/admin/samples/inventory', authenticateToken, requireAdminRoles, async (req, res) => {
    try {
      const [rows] = await pool.query(
        'SELECT * FROM sarga_print_samples ORDER BY category, name'
      );
      res.json({ samples: rows });
    } catch (err) {
      logger.error('[PremiumFeatures] Admin error fetching samples inventory:', err.message);
      res.status(500).json({ message: 'Database error loading sample inventory.' });
    }
  });

  // 4. Update an existing sample in catalog (stock / info)
  router.put('/admin/samples/inventory/:id', authenticateToken, requireAdminRoles, async (req, res) => {
    const sampleId = req.params.id;
    const { name, category, description, stock_quantity, is_active } = req.body;

    try {
      await pool.query(
        `UPDATE sarga_print_samples 
         SET name = ?, category = ?, description = ?, stock_quantity = ?, is_active = ?
         WHERE id = ?`,
        [name, category, description || null, parseInt(stock_quantity, 10) || 0, is_active ? 1 : 0, sampleId]
      );
      res.json({ message: 'Sample updated successfully!', sample_id: sampleId });
    } catch (err) {
      logger.error('[PremiumFeatures] Admin error updating sample item:', err.message);
      res.status(500).json({ message: 'Database error saving sample changes.' });
    }
  });

  // 5. Add a new print sample item to the catalog master list
  router.post('/admin/samples/inventory', authenticateToken, requireAdminRoles, async (req, res) => {
    const { name, category, description, stock_quantity } = req.body;
    
    if (!name || !category) {
      return res.status(400).json({ message: 'Name and category are required.' });
    }

    try {
      const [result] = await pool.query(
        `INSERT INTO sarga_print_samples (name, category, description, stock_quantity, is_active)
         VALUES (?, ?, ?, ?, 1)`,
        [name, category, description || null, parseInt(stock_quantity, 10) || 50]
      );
      res.status(201).json({ message: 'Material added successfully!', sample_id: result.insertId });
    } catch (err) {
      logger.error('[PremiumFeatures] Admin error creating sample item:', err.message);
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ message: 'A sample material with this name already exists.' });
      }
      res.status(500).json({ message: 'Database error saving new sample.' });
    }
  });

  // 6. Fetch design consultations list (CRM ledger)
  router.get('/admin/consultations', authenticateToken, requireAdminRoles, async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT c.*, b.name AS branch_name, s.name AS staff_name
         FROM sarga_design_consultations c
         LEFT JOIN sarga_branches b ON c.preferred_branch_id = b.id
         LEFT JOIN sarga_staff s ON c.assigned_staff_id = s.id
         ORDER BY c.date DESC, c.start_time DESC`
      );
      res.json({ consultations: rows });
    } catch (err) {
      logger.error('[PremiumFeatures] Admin error fetching consultations:', err.message);
      res.status(500).json({ message: 'Database error loading consultations.' });
    }
  });

  // 7. Update a design consultation status / assigned staff / follow-up quotes (CRM tracking)
  router.put('/admin/consultations/:id', authenticateToken, requireAdminRoles, async (req, res) => {
    const bookingId = req.params.id;
    const { status, assigned_staff_id, notes, quote_issued, quote_amount } = req.body;

    try {
      await pool.query(
        `UPDATE sarga_design_consultations 
         SET status = COALESCE(?, status), 
             assigned_staff_id = ?, 
             notes = COALESCE(?, notes), 
             quote_issued = ?, 
             quote_amount = ?
         WHERE id = ?`,
        [
          status || null,
          assigned_staff_id || null,
          notes || null,
          quote_issued ? 1 : 0,
          quote_amount ? parseFloat(quote_amount) : null,
          bookingId
        ]
      );
      res.json({ message: 'Consultation updated successfully!', booking_id: bookingId });
    } catch (err) {
      logger.error('[PremiumFeatures] Admin error updating consultation:', err.message);
      res.status(500).json({ message: 'Database error updating consultation.' });
    }
  });

  // 8. Retrieve list of staff members who can be assigned to consultations (Designer/Admin)
  router.get('/admin/designers', authenticateToken, requireAdminRoles, async (req, res) => {
    try {
      const [rows] = await pool.query(
        "SELECT id, name, role FROM sarga_staff WHERE role IN ('Designer', 'Admin') ORDER BY name"
      );
      res.json({ designers: rows });
    } catch (err) {
      logger.error('[PremiumFeatures] Admin error fetching designers:', err.message);
      res.status(500).json({ message: 'Database error loading designers list.' });
    }
  });

  return router;
};
