import { useEffect, useState } from 'react'
import BulkUploader from '../../components/admin/BulkUploader'
import ReorderList from '../../components/admin/ReorderList'

export default function AdminPage(){
  const [projects, setProjects] = useState([])

  async function load(){
    const r = await fetch('/api/projects')
    const data = await r.json()
    setProjects(data)
  }

  useEffect(()=>{ load() },[])

  const handleToggle = async (id, field, value) => {
    await fetch('/api/admin/toggle', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ id, field, value }) })
    await load()
  }

  const handleReorderSave = async (orderedIds) => {
    await fetch('/api/admin/reorder', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ order: orderedIds }) })
    await load()
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Portfolio Admin</h1>
      <section className="mb-6">
        <h2 className="font-semibold mb-2">Bulk uploader</h2>
        <BulkUploader onUploaded={load} />
      </section>

      <section className="mb-6">
        <h2 className="font-semibold mb-2">Order & Publish</h2>
        <ReorderList projects={projects} onSave={handleReorderSave} onToggle={handleToggle} />
      </section>

      <section>
        <h2 className="font-semibold mb-2">All Projects</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map(p=> (
            <div key={p.id} className="border p-3 rounded">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-sm text-gray-600">{p.category}</div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={p.published} onChange={e=>handleToggle(p.id,'published',e.target.checked)} /> Published</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={p.featured} onChange={e=>handleToggle(p.id,'featured',e.target.checked)} /> Featured</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={p.customer_approved} onChange={e=>handleToggle(p.id,'customer_approved',e.target.checked)} /> Customer Approved</label>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
