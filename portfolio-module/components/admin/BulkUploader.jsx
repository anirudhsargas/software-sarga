import { useState } from 'react'

export default function BulkUploader({ onUploaded }){
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [category, setCategory] = useState('Custom Works')
  const [customerApproved, setCustomerApproved] = useState(false)
  const [files, setFiles] = useState([])

  const categories = ['Wedding Cards','Mementos','Photo Frames','Offset Printing','Business Cards','Brochures','Certificates','ID Cards','Flex & Signage','Custom Works']

  function handleFiles(e){
    setFiles(Array.from(e.target.files))
  }

  async function upload(e){
    e.preventDefault()
    if (files.length===0) return alert('Select images')
    const fd = new FormData()
    fd.append('name', name)
    fd.append('slug', slug || name.toLowerCase().replace(/[^a-z0-9]+/g,'-'))
    fd.append('category', category)
    fd.append('customer_approved', customerApproved ? 'true' : 'false')
    files.forEach(f=> fd.append('images', f))
    const res = await fetch('/api/admin/upload',{ method: 'POST', body: fd })
    const data = await res.json()
    if (data.ok){ setName(''); setSlug(''); setFiles([]); onUploaded && onUploaded() }
    else alert('Upload failed')
  }

  return (
    <form onSubmit={upload} className="border rounded p-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input id="project-name" name="project-name" value={name} onChange={e=>setName(e.target.value)} placeholder="Project name" className="border p-2 rounded" />
        <input id="project-slug" name="project-slug" value={slug} onChange={e=>setSlug(e.target.value)} placeholder="Slug (optional)" className="border p-2 rounded" />
        <select id="project-category" name="project-category" value={category} onChange={e=>setCategory(e.target.value)} className="border p-2 rounded">
          {categories.map(c=> <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input type="file" id="project-images" name="project-images" multiple accept="image/*" onChange={handleFiles} />
        <label className="flex items-center gap-2"><input type="checkbox" id="customer-approved" name="customer-approved" checked={customerApproved} onChange={e=>setCustomerApproved(e.target.checked)} /> Customer approved</label>
      </div>
      <div className="mt-3">
        <button className="px-3 py-1 bg-blue-600 text-white rounded" type="submit">Upload</button>
      </div>
      {files.length>0 && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {files.map((f,i)=>(<div key={i} className="p-1 border rounded"><img src={URL.createObjectURL(f)} alt={f.name} className="w-full h-24 object-cover"/></div>))}
        </div>
      )}
    </form>
  )
}
