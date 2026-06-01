import formidable from 'formidable'
import { v2 as cloudinary } from 'cloudinary'
import fs from 'fs'
import db from '../../../../lib/db'

export const config = {
  api: { bodyParser: false }
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

export default async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).end()
  const form = new formidable.IncomingForm()
  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ error: err.message })
    const project = {
      name: fields.name,
      slug: fields.slug,
      category: fields.category,
      quantity_printed: fields.quantity_printed || null,
      material: fields.material || null,
      completion_date: fields.completion_date || null,
      customer_approved: fields.customer_approved === 'true'
    }
    const uploaded = []
    const fileList = Array.isArray(files.images) ? files.images : [files.images]
    for (const f of fileList){
      if (!f) continue
      const result = await cloudinary.uploader.upload(f.filepath || f.path, { folder: 'sarga_portfolio' })
      uploaded.push(result.secure_url)
    }
    project.images = JSON.stringify(uploaded)
    // insert into DB
    const q = `INSERT INTO projects (name, slug, category, quantity_printed, material, completion_date, images, customer_approved, published) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING *`
    const vals = [project.name, project.slug, project.category, project.quantity_printed, project.material, project.completion_date, project.images, project.customer_approved]
    const r = await db.query(q, vals)
    return res.json({ ok: true, project: r.rows[0] })
  })
}
