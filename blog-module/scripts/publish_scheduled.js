const { Pool } = require('pg')
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function run(){
  try{
    const now = new Date()
    const res = await pool.query("UPDATE posts SET status='published' WHERE status='scheduled' AND published_at <= now() RETURNING id,slug")
    if (res.rows.length>0){
      console.log('Published posts:', res.rows.map(r=>r.slug))
    } else {
      console.log('No scheduled posts to publish')
    }
  }catch(err){
    console.error('Error publishing scheduled posts', err)
    process.exit(1)
  }finally{
    await pool.end()
  }
}

run()
