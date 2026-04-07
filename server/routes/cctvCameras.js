const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const VALID_BRANCHES = ['perambra', 'meppayur_main', 'meppayur_room'];

// ─── GET /cameras — list all cameras ─────────────────────────────────────────
router.get('/cameras', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, branch, ip_address, port, username, rtsp_path, is_active, created_at, updated_at
       FROM sarga_cctv_cameras ORDER BY branch, name`
    );
    res.json(rows);
  } catch (err) {
    console.error('CCTV cameras list error:', err);
    res.status(500).json({ message: 'Database error' });
  }
});

// ─── GET /cameras/:id — single camera (includes password for admin) ──────────
router.get('/cameras/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, branch, ip_address, port, username, password, rtsp_path, is_active, created_at, updated_at
       FROM sarga_cctv_cameras WHERE id = ?`, [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Camera not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('CCTV camera get error:', err);
    res.status(500).json({ message: 'Database error' });
  }
});

// ─── POST /cameras — add a new camera ────────────────────────────────────────
router.post('/cameras', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
  const { name, branch, ip_address, port, username, password, rtsp_path } = req.body;

  if (!name || !branch || !ip_address || !password) {
    return res.status(400).json({ message: 'name, branch, ip_address, and password are required' });
  }
  if (!VALID_BRANCHES.includes(branch)) {
    return res.status(400).json({ message: `Invalid branch. Must be one of: ${VALID_BRANCHES.join(', ')}` });
  }
  // Basic IP format validation
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip_address)) {
    return res.status(400).json({ message: 'Invalid IP address format' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO sarga_cctv_cameras (name, branch, ip_address, port, username, password, rtsp_path)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, branch, ip_address, port || 554, username || 'admin', password, rtsp_path || '/Streaming/Channels/101']
    );
    res.status(201).json({ id: result.insertId, message: 'Camera added' });
  } catch (err) {
    console.error('CCTV camera add error:', err);
    res.status(500).json({ message: 'Database error' });
  }
});

// ─── PUT /cameras/:id — update camera ────────────────────────────────────────
router.put('/cameras/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
  const { name, branch, ip_address, port, username, password, rtsp_path, is_active } = req.body;

  if (branch && !VALID_BRANCHES.includes(branch)) {
    return res.status(400).json({ message: `Invalid branch. Must be one of: ${VALID_BRANCHES.join(', ')}` });
  }
  if (ip_address && !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip_address)) {
    return res.status(400).json({ message: 'Invalid IP address format' });
  }

  try {
    const [existing] = await pool.query('SELECT id FROM sarga_cctv_cameras WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ message: 'Camera not found' });

    const updates = [];
    const params = [];
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (branch !== undefined) { updates.push('branch = ?'); params.push(branch); }
    if (ip_address !== undefined) { updates.push('ip_address = ?'); params.push(ip_address); }
    if (port !== undefined) { updates.push('port = ?'); params.push(port); }
    if (username !== undefined) { updates.push('username = ?'); params.push(username); }
    if (password !== undefined) { updates.push('password = ?'); params.push(password); }
    if (rtsp_path !== undefined) { updates.push('rtsp_path = ?'); params.push(rtsp_path); }
    if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }

    if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' });

    params.push(req.params.id);
    await pool.query(`UPDATE sarga_cctv_cameras SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ message: 'Camera updated' });
  } catch (err) {
    console.error('CCTV camera update error:', err);
    res.status(500).json({ message: 'Database error' });
  }
});

// ─── DELETE /cameras/:id — remove camera ─────────────────────────────────────
router.delete('/cameras/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM sarga_cctv_cameras WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Camera not found' });
    res.json({ message: 'Camera deleted' });
  } catch (err) {
    console.error('CCTV camera delete error:', err);
    res.status(500).json({ message: 'Database error' });
  }
});

// ─── GET /cameras/:id/snapshot — proxy a snapshot from camera ─────────────────
router.get('/cameras/:id/snapshot', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT ip_address, port, username, password FROM sarga_cctv_cameras WHERE id = ? AND is_active = 1',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Camera not found or inactive' });

    const cam = rows[0];
    // Hikvision ISAPI snapshot endpoint
    const snapshotUrl = `http://${cam.ip_address}/ISAPI/Streaming/channels/101/picture`;

    const http = require('http');
    const camReq = http.get(snapshotUrl, {
      auth: `${cam.username}:${cam.password}`,
      timeout: 5000,
    }, (camRes) => {
      if (camRes.statusCode !== 200) {
        return res.status(502).json({ message: 'Camera returned error', status: camRes.statusCode });
      }
      res.setHeader('Content-Type', camRes.headers['content-type'] || 'image/jpeg');
      res.setHeader('Cache-Control', 'no-cache');
      camRes.pipe(res);
    });

    camReq.on('error', (err) => {
      console.error('Camera snapshot error:', err.message);
      res.status(502).json({ message: 'Cannot reach camera' });
    });

    camReq.on('timeout', () => {
      camReq.destroy();
      res.status(504).json({ message: 'Camera timeout' });
    });
  } catch (err) {
    console.error('Snapshot proxy error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET /cameras/:id/stream-url — get RTSP URL for a camera ─────────────────
router.get('/cameras/:id/stream-url', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT ip_address, port, username, password, rtsp_path FROM sarga_cctv_cameras WHERE id = ? AND is_active = 1',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Camera not found or inactive' });

    const cam = rows[0];
    const encodedPassword = encodeURIComponent(cam.password);
    const rtspUrl = `rtsp://${cam.username}:${encodedPassword}@${cam.ip_address}:${cam.port}${cam.rtsp_path}`;
    // HTTP live view (Hikvision web interface)
    const httpUrl = `http://${cam.ip_address}`;

    res.json({ rtsp_url: rtspUrl, http_url: httpUrl });
  } catch (err) {
    console.error('Stream URL error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FACE DATA MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /face-data — list all face data entries ─────────────────────────────
router.get('/face-data', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
  const { staff_id } = req.query;
  try {
    let query = `
      SELECT fd.id, fd.staff_id, fd.image_url, fd.label, fd.created_at,
             s.name AS staff_name, s.image_url AS staff_image
      FROM sarga_cctv_face_data fd
      JOIN sarga_staff s ON fd.staff_id = s.id
    `;
    const params = [];
    if (staff_id) {
      query += ' WHERE fd.staff_id = ?';
      params.push(staff_id);
    }
    query += ' ORDER BY s.name, fd.created_at DESC';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Face data list error:', err);
    res.status(500).json({ message: 'Database error' });
  }
});

// ─── GET /face-data/stats — face data count per staff ────────────────────────
router.get('/face-data/stats', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT s.id AS staff_id, s.name, s.image_url AS staff_image,
             COUNT(fd.id) AS face_count
      FROM sarga_staff s
      LEFT JOIN sarga_cctv_face_data fd ON s.id = fd.staff_id
      WHERE s.is_active = 1
      GROUP BY s.id, s.name, s.image_url
      ORDER BY s.name
    `);
    res.json(rows);
  } catch (err) {
    console.error('Face data stats error:', err);
    res.status(500).json({ message: 'Database error' });
  }
});

// ─── DELETE /face-data/:id — remove a face data entry ────────────────────────
router.delete('/face-data/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT image_url FROM sarga_cctv_face_data WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Face data not found' });

    await pool.query('DELETE FROM sarga_cctv_face_data WHERE id = ?', [req.params.id]);
    res.json({ message: 'Face data removed' });
  } catch (err) {
    console.error('Face data delete error:', err);
    res.status(500).json({ message: 'Database error' });
  }
});

module.exports = (upload, removeUploadFile) => {
  // ─── POST /face-data — upload face image for a staff member ──────────────
  router.post('/face-data', authenticateToken, authorizeRoles('Admin'), upload.single('face_image'), async (req, res) => {
    const { staff_id, label } = req.body;
    if (!staff_id || !req.file) {
      if (req.file) await removeUploadFile(`/uploads/${req.file.filename}`);
      return res.status(400).json({ message: 'staff_id and face_image are required' });
    }

    try {
      const [staff] = await pool.query('SELECT id, name FROM sarga_staff WHERE id = ?', [staff_id]);
      if (staff.length === 0) {
        await removeUploadFile(`/uploads/${req.file.filename}`);
        return res.status(404).json({ message: 'Staff member not found' });
      }

      const imageUrl = `/uploads/${req.file.filename}`;
      const [result] = await pool.query(
        'INSERT INTO sarga_cctv_face_data (staff_id, image_url, label) VALUES (?, ?, ?)',
        [staff_id, imageUrl, label || staff[0].name]
      );

      res.status(201).json({ id: result.insertId, image_url: imageUrl, message: 'Face data added' });
    } catch (err) {
      console.error('Face data upload error:', err);
      if (req.file) await removeUploadFile(`/uploads/${req.file.filename}`);
      res.status(500).json({ message: 'Database error' });
    }
  });

  return router;
};
