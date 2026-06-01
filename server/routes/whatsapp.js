// Example Express route to accept WhatsApp analytics events
// Add to your Express app: `app.use('/api/whatsapp', require('./routes/whatsapp'))`
const express = require('express')
const router = express.Router()
const { Pool } = require('pg')
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

router.post('/log', async (req, res) => {
  try{
    const { event, type, productName, quantity, size, variant, orderRef, artworkUrl, options, timestamp } = req.body || {}
    const q = `INSERT INTO whatsapp_clicks (event_type, type, product_name, quantity, size, variant, order_ref, artwork_url, options, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) RETURNING id`
    await pool.query(q, [event || 'whatsapp_click', type, productName, quantity, size, variant, orderRef, artworkUrl, options ? JSON.stringify(options) : null])
    res.json({ ok: true })
  }catch(err){
    console.error('whatsapp log error', err)
    res.status(500).json({ error: 'internal' })
  }
})

module.exports = router
