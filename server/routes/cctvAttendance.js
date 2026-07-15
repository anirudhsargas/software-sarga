const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { getTodayDate } = require('../helpers');

// Branch value whitelist
const VALID_BRANCHES = ['perambra', 'meppayur_main', 'meppayur_room'];
const VALID_EVENT_TYPES = ['entry', 'exit', 'manual'];
const VALID_SOURCES = ['face_recognition', 'manual'];

// ─── POST /attendance — receive event from script or manual entry ─────────
router.post('/attendance', authenticateToken, async (req, res) => {
  const { staff_id, branch, event_type, source, timestamp } = req.body;

  // Validate required fields
  if (!staff_id || !branch || !event_type) {
    return res.status(400).json({ message: 'staff_id, branch, and event_type are required' });
  }
  if (!VALID_BRANCHES.includes(branch)) {
    return res.status(400).json({ message: `Invalid branch. Must be one of: ${VALID_BRANCHES.join(', ')}` });
  }
  if (!VALID_EVENT_TYPES.includes(event_type)) {
    return res.status(400).json({ message: `Invalid event_type. Must be one of: ${VALID_EVENT_TYPES.join(', ')}` });
  }
  const recordSource = source || 'manual';
  if (!VALID_SOURCES.includes(recordSource)) {
    return res.status(400).json({ message: `Invalid source. Must be one of: ${VALID_SOURCES.join(', ')}` });
  }

  try {
    // Verify staff exists
    const [staff] = await pool.query('SELECT id FROM sarga_staff WHERE id = ?', [staff_id]);
    if (staff.length === 0) {
      return res.status(404).json({ message: 'Staff member not found' });
    }

    const eventTimestamp = timestamp || (getTodayDate() + ' ' + new Date().toTimeString().slice(0, 8));
    const eventDate = eventTimestamp.slice(0, 10);
    const today = getTodayDate();

    if (eventDate > today) {
      return res.status(400).json({ message: 'Attendance cannot be recorded for future dates' });
    }

    // Duplicate prevention: check min gap (60 min) for same staff on same day
    const [recent] = await pool.query(
      `SELECT id, timestamp FROM sarga_cctv_attendance 
       WHERE staff_id = ? AND date = ? 
       ORDER BY timestamp DESC LIMIT 1`,
      [staff_id, eventDate]
    );

    if (recent.length > 0) {
      const lastTime = new Date(recent[0].timestamp);
      const newTime = new Date(eventTimestamp);
      const diffMinutes = (newTime - lastTime) / (1000 * 60);
      if (diffMinutes < 60 && diffMinutes >= 0 && recordSource === 'face_recognition') {
        return res.status(200).json({ message: 'Duplicate prevented — event within 60 minute gap', skipped: true });
      }
    }

    const notedBy = recordSource === 'manual' ? req.user.id : null;

    const [result] = await pool.query(
      `INSERT INTO sarga_cctv_attendance (staff_id, branch, event_type, source, timestamp, noted_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [staff_id, branch, event_type, recordSource, eventTimestamp, notedBy]
    );

    res.status(201).json({ id: result.insertId, message: 'Attendance recorded' });
  } catch (err) {
    console.error('CCTV attendance POST error:', err);
    res.status(500).json({ message: 'Database error' });
  }
});

// ─── GET /attendance/today?branch= — today's full attendance for one branch ─
router.get('/attendance/today', authenticateToken, authorizeRoles('Admin', 'Front Office'), async (req, res) => {
  const { branch, date } = req.query;
  const targetDate = date || getTodayDate();

  if (branch && !VALID_BRANCHES.includes(branch)) {
    return res.status(400).json({ message: `Invalid branch. Must be one of: ${VALID_BRANCHES.join(', ')}` });
  }

  try {
    let query = `
      SELECT ca.id, ca.staff_id, ca.branch, ca.event_type, ca.source, ca.timestamp,
             ca.noted_by, ca.date, s.name AS staff_name, s.image_url AS staff_image
      FROM sarga_cctv_attendance ca
      JOIN sarga_staff s ON ca.staff_id = s.id
      WHERE ca.date = ?
    `;
    const params = [targetDate];

    if (branch) {
      query += ' AND ca.branch = ?';
      params.push(branch);
    }

    query += ' ORDER BY ca.timestamp ASC';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('CCTV attendance today error:', err);
    res.status(500).json({ message: 'Database error' });
  }
});

// ─── GET /attendance/staff/:id — attendance history for one staff member ─────
router.get('/attendance/staff/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { from, to } = req.query;

  try {
    let query = `
      SELECT ca.id, ca.branch, ca.event_type, ca.source, ca.timestamp, ca.date
      FROM sarga_cctv_attendance ca
      WHERE ca.staff_id = ?
    `;
    const params = [id];

    if (from) {
      query += ' AND ca.date >= ?';
      params.push(from);
    }
    if (to) {
      query += ' AND ca.date <= ?';
      params.push(to);
    }

    query += ' ORDER BY ca.timestamp DESC LIMIT 200';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('CCTV attendance staff history error:', err);
    res.status(500).json({ message: 'Database error' });
  }
});

// ─── GET /attendance/summary?branch=&date= — day summary with flags ─────────
router.get('/attendance/summary', authenticateToken, authorizeRoles('Admin', 'Front Office'), async (req, res) => {
  const { branch, date } = req.query;
  const targetDate = date || getTodayDate();

  try {
    // Get all active staff for the branch
    let staffQuery = `
      SELECT s.id, s.name, s.image_url, s.branch_id, b.name AS branch_name
      FROM sarga_staff s
      LEFT JOIN sarga_branches b ON s.branch_id = b.id
      WHERE s.is_active = 1 AND s.role != 'Admin'
    `;
    const staffParams = [];

    if (branch) {
      // Map branch value to branch_id
      const branchMap = { perambra: '%erambra%', meppayur_main: '%eppayur%', meppayur_room: '%eppayur%' };
      if (branchMap[branch]) {
        staffQuery += ' AND b.name LIKE ?';
        staffParams.push(branchMap[branch]);
      }
    }

    const [allStaff] = await pool.query(staffQuery, staffParams);

    // Get manually marked attendance for the day (used when CCTV events are missing)
    let markedAttendanceByStaffId = {};
    if (allStaff.length > 0) {
      const staffIds = allStaff.map(s => s.id);
      const placeholders = staffIds.map(() => '?').join(',');
      const [markedAttendance] = await pool.query(
        `SELECT staff_id, status, in_time, out_time
         FROM sarga_staff_attendance
         WHERE attendance_date = ? AND staff_id IN (${placeholders})`,
        [targetDate, ...staffIds]
      );
      markedAttendanceByStaffId = markedAttendance.reduce((acc, row) => {
        acc[row.staff_id] = row;
        return acc;
      }, {});
    }

    // Get attendance records for the day
    let attQuery = `
      SELECT ca.staff_id, ca.event_type, ca.source, ca.timestamp, ca.created_at,
             ABS(TIMESTAMPDIFF(MINUTE, ca.timestamp, ca.created_at)) AS discrepancy_minutes
      FROM sarga_cctv_attendance ca
      WHERE ca.date = ?
    `;
    const attParams = [targetDate];

    if (branch) {
      attQuery += ' AND ca.branch = ?';
      attParams.push(branch);
    }

    attQuery += ' ORDER BY ca.timestamp ASC';
    const [records] = await pool.query(attQuery, attParams);

    // Group records by staff
    const staffRecords = {};
    for (const r of records) {
      if (!staffRecords[r.staff_id]) staffRecords[r.staff_id] = [];
      staffRecords[r.staff_id].push(r);
    }

    const now = new Date();
    const isToday = targetDate === getTodayDate();
    const alertHour = 10; // 10 AM cutoff

    const summary = allStaff.map(staff => {
      const events = staffRecords[staff.id] || [];
      const entryEvent = events.find(e => e.event_type === 'entry' || e.event_type === 'manual');
      const exitEvent = [...events].reverse().find(e => e.event_type === 'exit');
      const markedAttendance = markedAttendanceByStaffId[staff.id] || null;

      let status = 'absent';
      let absentAlert = false;
      let entryTime = entryEvent ? entryEvent.timestamp : null;
      let exitTime = exitEvent ? exitEvent.timestamp : null;
      let entrySource = entryEvent ? entryEvent.source : null;
      let exitSource = exitEvent ? exitEvent.source : null;

      if (entryEvent) {
        status = exitEvent ? 'left' : 'present';
        // Check if left early (before 5 PM)
        if (exitEvent) {
          const exitHour = new Date(exitEvent.timestamp).getHours();
          if (exitHour < 17) status = 'left_early';
        }
      } else if (markedAttendance) {
        const markedStatus = String(markedAttendance.status || '').toLowerCase();
        if (markedStatus === 'present' || markedStatus === 'half day') {
          status = 'present';
        } else {
          status = 'absent';
        }

        if (markedAttendance.in_time) {
          entryTime = `${targetDate} ${markedAttendance.in_time}`;
          entrySource = 'staff_attendance';
        }
        if (markedAttendance.out_time) {
          exitTime = `${targetDate} ${markedAttendance.out_time}`;
          exitSource = 'staff_attendance';
        }
      } else if (isToday && now.getHours() >= alertHour) {
        absentAlert = true;
      }

      return {
        staff_id: staff.id,
        name: staff.name,
        image_url: staff.image_url,
        branch_id: staff.branch_id,
        branch_name: staff.branch_name,
        entry_time: entryTime,
        exit_time: exitTime,
        entry_source: entrySource,
        exit_source: exitSource,
        entry_discrepancy: (entryEvent && entryEvent.source === 'manual') ? (entryEvent.discrepancy_minutes || 0) : null,
        exit_discrepancy: (exitEvent && exitEvent.source === 'manual') ? (exitEvent.discrepancy_minutes || 0) : null,
        status,
        marked_status: markedAttendance ? markedAttendance.status : null,
        absent_alert: absentAlert,
        event_count: events.length,
      };
    });

    const totalStaff = summary.length;
    const present = summary.filter(s => s.status === 'present' || s.status === 'left' || s.status === 'left_early').length;
    const absent = summary.filter(s => s.status === 'absent').length;
    const alertCount = summary.filter(s => s.absent_alert).length;
    const discrepancyCount = summary.filter(s =>
      (s.entry_discrepancy !== null && s.entry_discrepancy > 30) ||
      (s.exit_discrepancy !== null && s.exit_discrepancy > 30)
    ).length;

    res.json({
      date: targetDate,
      branch: branch || 'all',
      total_staff: totalStaff,
      present,
      absent,
      alert_count: alertCount,
      discrepancy_count: discrepancyCount,
      staff: summary,
    });
  } catch (err) {
    console.error('CCTV attendance summary error:', err);
    res.status(500).json({ message: 'Database error' });
  }
});

// ─── POST /attendance/unknown-alert — unrecognised face detected ─────────────
router.post('/attendance/unknown-alert', authenticateToken, async (req, res) => {
  const { branch, timestamp } = req.body;

  if (!branch || !VALID_BRANCHES.includes(branch)) {
    return res.status(400).json({ message: 'Valid branch is required' });
  }

  try {
    console.warn(`[CCTV] Unknown face detected at ${branch} on ${timestamp || new Date().toISOString()}`);
    res.json({ message: 'Alert received' });
  } catch (err) {
    console.error('Unknown alert error:', err);
    res.status(500).json({ message: 'Error processing alert' });
  }
});

// ─── DELETE /attendance/:id — delete a record (admin only) ───────────────────
router.delete('/attendance/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await pool.query('DELETE FROM sarga_cctv_attendance WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Record not found' });
    }
    res.json({ message: 'Record deleted' });
  } catch (err) {
    console.error('CCTV attendance delete error:', err);
    res.status(500).json({ message: 'Database error' });
  }
});

module.exports = router;
