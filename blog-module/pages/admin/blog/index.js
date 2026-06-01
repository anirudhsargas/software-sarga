import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function AdminList(){
  const [posts, setPosts] = useState([])
  useEffect(()=>{ fetch('/api/blog/posts').then(r=>r.json()).then(setPosts) },[])
  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Blog Admin</h1>
        <Link href="/admin/blog/editor"><a className="px-3 py-1 bg-blue-600 text-white rounded">New Post</a></Link>
      </div>
      <div className="grid gap-2">
        {posts.map(p=> (
          <div key={p.id} className="p-3 border rounded flex justify-between">
            <div>
              <Link href={`/blog/${p.slug}`}><a className="font-semibold">{p.title}</a></Link>
              <div className="text-sm text-gray-600">{p.status} • {p.published_at?.split('T')[0]}</div>
            </div>
            <div className="flex gap-2">
              <Link href={`/admin/blog/editor?id=${p.id}`}><a className="px-2 py-1 border rounded">Edit</a></Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
