import db from '../../../lib/db'

export default async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).end()
  const { order } = req.body
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be array' })
  const client = db
  try{
    for (let i=0;i<order.length;i++){
      const id = order[i]
      await client.query('UPDATE projects SET position=$1 WHERE id=$2', [i, id])
    }
    return res.json({ ok: true })
  }catch(err){
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
}
