import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'

export default function Editor(){
  const router = useRouter()
  const { id } = router.query
  const [post, setPost] = useState({ title:'', slug:'', excerpt:'', content:'', status:'draft', seo_title:'', seo_description:'', seo_keywords:'', featured_image:'', author_id:1, published_at:'' })

  useEffect(()=>{ if (id){ fetch(`/api/blog/posts/${id}`).then(r=>r.json()).then(setPost) } },[id])

  async function save(e){
    e.preventDefault()
    const method = id ? 'PUT' : 'POST'
    const url = id ? `/api/blog/posts/${id}` : '/api/blog/posts'
    const res = await fetch(url, { method, headers:{'content-type':'application/json'}, body: JSON.stringify(post) })
    const data = await res.json()
    if (data.id || data.ok === undefined) router.push('/admin/blog')
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Blog Editor</h1>
      <form onSubmit={save} className="grid gap-2">
        <input value={post.title} onChange={e=>setPost({...post,title:e.target.value})} placeholder="Title" className="border p-2" />
        <input value={post.slug} onChange={e=>setPost({...post,slug:e.target.value})} placeholder="Slug" className="border p-2" />
        <input value={post.excerpt} onChange={e=>setPost({...post,excerpt:e.target.value})} placeholder="Excerpt" className="border p-2" />
        <textarea value={post.content} onChange={e=>setPost({...post,content:e.target.value})} placeholder="HTML Content" rows={12} className="border p-2" />
        <input value={post.featured_image} onChange={e=>setPost({...post,featured_image:e.target.value})} placeholder="Featured image URL" className="border p-2" />
        <div className="flex gap-2">
          <select value={post.status} onChange={e=>setPost({...post,status:e.target.value})} className="border p-2">
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="published">Published</option>
          </select>
          <input type="datetime-local" value={post.published_at || ''} onChange={e=>setPost({...post,published_at:e.target.value})} className="border p-2" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input value={post.seo_title} onChange={e=>setPost({...post,seo_title:e.target.value})} placeholder="SEO title" className="border p-2" />
          <input value={post.seo_description} onChange={e=>setPost({...post,seo_description:e.target.value})} placeholder="SEO description" className="border p-2" />
          <input value={post.seo_keywords} onChange={e=>setPost({...post,seo_keywords:e.target.value})} placeholder="SEO keywords" className="border p-2" />
        </div>
        <div>
          <button className="px-3 py-1 bg-blue-600 text-white rounded">Save</button>
        </div>
      </form>
    </div>
  )
}
