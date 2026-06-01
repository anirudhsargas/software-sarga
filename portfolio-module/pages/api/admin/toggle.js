import db from '../../../lib/db'

export default async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).end()
  const { id, field, value } = req.body
  const allowed = ['published','featured','customer_approved']
  if (!allowed.includes(field)) return res.status(400).json({ error: 'field not allowed' })
  try{
    const q = `UPDATE projects SET ${field}=$1 WHERE id=$2 RETURNING *`
    const r = await db.query(q, [value, id])
    if (r.rows.length===0) return res.status(404).end()
    return res.json({ ok: true, project: r.rows[0] })
  }catch(err){
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
}
