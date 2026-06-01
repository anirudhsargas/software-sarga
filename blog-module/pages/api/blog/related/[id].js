import db from '../../../../lib/db'

function tokenize(text){
  if(!text) return []
  return text.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean)
}

function jaccard(aWords, bWords){
  const A = new Set(aWords)
  const B = new Set(bWords)
  const inter = [...A].filter(x=>B.has(x)).length
  const union = new Set([...A,...B]).size
  return union === 0 ? 0 : inter/union
}

export default async function handler(req, res){
  const { id } = req.query
  // fetch post tags and content
  const postR = await db.query('SELECT p.content FROM posts p WHERE p.id=$1 LIMIT 1', [id])
  if (postR.rows.length===0) return res.status(404).json({ error: 'post not found' })
  const post = postR.rows[0]
  // tags
  const t = await db.query('SELECT t.id,t.name FROM tags t JOIN posts_tags pt ON pt.tag_id=t.id WHERE pt.post_id=$1', [id])
  const tagIds = t.rows.map(r=>r.id)

  // candidate posts: those sharing tags or latest published
  let candidates = []
  if (tagIds.length>0){
    const q = `SELECT p.id,p.title,p.slug,p.excerpt,p.content,p.featured_image FROM posts p JOIN posts_tags pt ON pt.post_id=p.id WHERE pt.tag_id=ANY($1) AND p.status='published' AND p.id<>$2 GROUP BY p.id ORDER BY count(pt.tag_id) DESC, p.published_at DESC LIMIT 20`;
    const cr = await db.query(q, [tagIds, id])
    candidates = cr.rows
  }
  // if no candidates, get latest published
  if (candidates.length === 0){
    const cr = await db.query("SELECT id,title,slug,excerpt,content,featured_image FROM posts WHERE status='published' AND id<>$1 ORDER BY published_at DESC LIMIT 20", [id])
    candidates = cr.rows
  }

  const baseWords = tokenize(post.content || '')
  const scored = candidates.map(c=>{
    const tagIntersection = 0 // already prioritized by SQL when using tag match
    const sim = jaccard(baseWords, tokenize(c.content || ''))
    const score = (tagIntersection * 3) + (sim * 100)
    return { ...c, score }
  })

  scored.sort((a,b)=>b.score-a.score)
  const top = scored.slice(0,6).map(({id,title,slug,excerpt,featured_image})=>({id,title,slug,excerpt,featured_image}))
  return res.json(top)
}
