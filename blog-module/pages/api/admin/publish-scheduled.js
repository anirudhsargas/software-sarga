import db from '../../../lib/db'

export default async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).end()
  try{
    const r = await db.query("UPDATE posts SET status='published' WHERE status='scheduled' AND published_at <= now() RETURNING id,slug")
    return res.json({ ok: true, published: r.rows })
  }catch(err){
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
}
