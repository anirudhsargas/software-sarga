import Link from 'next/link'
import { useEffect, useState } from 'react'

function PostCard({p}){
  return (
    <article className="p-4 border rounded">
      <Link href={`/blog/${p.slug}`}><a className="text-xl font-semibold">{p.title}</a></Link>
      <p className="text-sm text-gray-600">{p.excerpt}</p>
      <div className="text-xs text-gray-500">{p.reading_time} min • {p.published_at?.split('T')[0]}</div>
    </article>
  )
}

export default function BlogIndex(){
  const [posts, setPosts] = useState([])
  const [q, setQ] = useState('')

  useEffect(()=>{ fetch('/api/blog/posts').then(r=>r.json()).then(setPosts) },[])

  const filtered = posts.filter(p => p.title.toLowerCase().includes(q.toLowerCase()) || (p.excerpt||'').toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Sarga Blog</h1>
      <div className="mb-4">
        <input placeholder="Search articles" value={q} onChange={e=>setQ(e.target.value)} className="border p-2 rounded w-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {filtered.map(p=> <PostCard key={p.id} p={p} />)}
      </div>
    </div>
  )
}
