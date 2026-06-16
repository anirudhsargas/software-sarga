const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');

module.exports = (upload) => {

    // --- Product Library Assets ---
    router.get('/design-workspace/assets', authenticateToken, async (req, res) => {
        try {
            const [assets] = await pool.query(`
                SELECT a.*, s.name as uploaded_by_name 
                FROM sarga_design_assets a
                LEFT JOIN sarga_staff s ON a.uploaded_by = s.id
                WHERE a.is_archived = 0
                ORDER BY a.created_at DESC
            `);
            res.json(assets);
        } catch (err) {
            console.error('Error fetching assets:', err);
            res.status(500).json({ message: 'Failed to load assets' });
        }
    });

    router.post('/design-workspace/assets', authenticateToken, upload.fields([
        { name: 'preview', maxCount: 1 },
        { name: 'final_pdf', maxCount: 1 }
    ]), async (req, res) => {
        const { asset_name, drive_link, editable_source_url, tags } = req.body;
        const previewUrl = req.files['preview'] ? req.files['preview'][0].path : null;
        const finalPdfUrl = req.files['final_pdf'] ? req.files['final_pdf'][0].path : null;

        if (!asset_name) return res.status(400).json({ message: 'Asset name required' });

        try {
            await pool.query(
                `INSERT INTO sarga_design_assets (asset_name, preview_url, drive_link, final_pdf_url, editable_source_url, tags, uploaded_by) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [asset_name, previewUrl, drive_link, finalPdfUrl, editable_source_url, tags || '[]', req.user.id]
            );
            res.json({ message: 'Asset added successfully' });
        } catch (err) {
            console.error('Error uploading asset:', err);
            res.status(500).json({ message: 'Failed to add asset' });
        }
    });

    // --- Design Bookings ---
    router.get('/design-workspace/bookings', authenticateToken, async (req, res) => {
        try {
            const [bookings] = await pool.query(`
                SELECT b.*, c.name as customer_name, c.company_name, s.name as designer_name
                FROM sarga_design_bookings b
                LEFT JOIN sarga_customers c ON b.customer_id = c.id
                LEFT JOIN sarga_staff s ON b.assigned_designer = s.id
                ORDER BY b.created_at DESC
            `);
            res.json(bookings);
        } catch (err) {
            console.error('Error fetching bookings:', err);
            res.status(500).json({ message: 'Failed to load bookings' });
        }
    });

    router.put('/design-workspace/bookings/:id/status', authenticateToken, async (req, res) => {
        const { status } = req.body;
        if (!status) return res.status(400).json({ message: 'Status required' });

        try {
            await pool.query(
                `UPDATE sarga_design_bookings SET status = ? WHERE id = ?`,
                [status, req.params.id]
            );
            res.json({ message: 'Status updated' });
        } catch (err) {
            console.error('Error updating booking status:', err);
            res.status(500).json({ message: 'Failed to update status' });
        }
    });

    // --- Block Journal ---
    router.get('/design-workspace/blocks', authenticateToken, async (req, res) => {
        try {
            const [blocks] = await pool.query(`
                SELECT b.*, c.name as customer_name, c.company_name, s.name as created_by_name
                FROM sarga_block_journal b
                LEFT JOIN sarga_customers c ON b.customer_id = c.id
                LEFT JOIN sarga_staff s ON b.created_by = s.id
                ORDER BY b.created_at DESC
            `);
            res.json(blocks);
        } catch (err) {
            console.error('Error fetching blocks:', err);
            res.status(500).json({ message: 'Failed to load blocks' });
        }
    });

    router.post('/design-workspace/blocks', authenticateToken, async (req, res) => {
        const { block_number, customer_id, block_type, location, remarks } = req.body;
        if (!block_number || !customer_id) return res.status(400).json({ message: 'Block Number and Customer are required' });

        try {
            await pool.query(
                `INSERT INTO sarga_block_journal (block_number, customer_id, block_type, created_by, location, remarks) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [block_number, customer_id, block_type, req.user.id, location, remarks]
            );
            res.json({ message: 'Block registered successfully' });
        } catch (err) {
            console.error('Error adding block:', err);
            res.status(500).json({ message: 'Failed to register block' });
        }
    });

    return router;
};
