import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Edit3, Trash2, Eye, EyeOff, Star, Search, X, Loader2, Upload } from 'lucide-react'
import api from '../../services/api'
import toast from 'react-hot-toast'
import './PortfolioManager.css'
import PageContainer from '../../components/ui/PageContainer'

const CATEGORIES = ['Wedding Cards', 'Mementos', 'Photo Frames', 'Offset Books', 'Business Cards', 'Certificates', 'Custom Projects']

function PortfolioManager() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ title: '', description: '', category: 'Custom Projects', cover_image: '', gallery_images: [], featured: false, published: true, position: 0 })
  const [search, setSearch] = useState('')
  const [uploading, setUploading] = useState(false)

  const triggerRef = useRef(null)
  useEffect(() => {
    if (showForm) {
      triggerRef.current = document.activeElement
    } else if (triggerRef.current) {
      triggerRef.current.focus()
      triggerRef.current = null
    }
  }, [showForm])

  useEffect(() => {
    return () => {
      triggerRef.current?.focus()
    }
  }, [])
  const filtered = projects.filter(p => !search || p.title?.toLowerCase().includes(search.toLowerCase()) || p.category?.toLowerCase().includes(search.toLowerCase()))

  const loadProjects = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/portfolio')
      setProjects(res.data.projects || [])
    } catch (e) {
      toast.error('Failed to load projects')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadProjects() }, [loadProjects])

  const handleUpload = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const fd = new FormData()
    fd.append('image', file)
    try {
      const res = await api.post('/portfolio/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      return res.data.url
    } catch (e) {
      toast.error('Upload failed')
    } finally {
      setUploading(false)
    }
  }, [])

  const handleImageUpload = useCallback(async (e) => {
    const url = await handleUpload(e)
    if (url) setForm(f => ({ ...f, cover_image: url }))
  }, [handleUpload])

  const handleGalleryUpload = useCallback(async (e) => {
    const url = await handleUpload(e)
    if (url) setForm(f => ({ ...f, gallery_images: [...f.gallery_images, url] }))
  }, [handleUpload])

  const removeGalleryImage = useCallback((idx) => {
    setForm(f => ({ ...f, gallery_images: f.gallery_images.filter((_, i) => i !== idx) }))
  }, [])

  const saveProject = useCallback(async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return }
    try {
      if (editing) {
        await api.put(`/portfolio/${editing}`, form)
        toast.success('Project updated')
      } else {
        const res = await api.post('/portfolio', form)
        toast.success('Project created')
      }
      setShowForm(false)
      setEditing(null)
      setForm({ title: '', description: '', category: 'Custom Projects', cover_image: '', gallery_images: [], featured: false, published: true, position: 0 })
      loadProjects()
    } catch (e) {
      toast.error('Failed to save')
    }
  }, [editing, form])

  const editProject = useCallback(async (id) => {
    try {
      const res = await api.get(`/portfolio/${id}`)
      setForm(res.data.project)
      setEditing(id)
      setShowForm(true)
    } catch (e) { toast.error('Failed to load project') }
  }, [])

  const deleteProject = useCallback(async (id) => {
    if (!confirm('Delete this project?')) return
    try {
      await api.delete(`/portfolio/${id}`)
      toast.success('Project deleted')
      loadProjects()
    } catch (e) { toast.error('Failed to delete') }
  }, [])

  const toggleFeature = useCallback(async (id, current) => {
    try {
      await api.put(`/portfolio/${id}`, { featured: !current })
      loadProjects()
    } catch (e) { toast.error('Failed') }
  }, [])

  const togglePublish = useCallback(async (id, current) => {
    try {
      await api.put(`/portfolio/${id}`, { published: !current })
      loadProjects()
    } catch (e) { toast.error('Failed') }
  }, [])

  if (loading) return <div className="loading-spinner"><Loader2 size={36} className="spinning" /></div>

  return (
    <PageContainer>
      <div className="mgr-header">
        <h2>Portfolio Management</h2>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setForm({ title: '', description: '', category: 'Custom Projects', cover_image: '', gallery_images: [], featured: false, published: true, position: 0 }); setShowForm(true) }}>
          <Plus size={16} /> New Project
        </button>
      </div>

      <div className="mgr-search"><Search size={16} /><input className="input" placeholder="Search projects..." value={search} onChange={e => setSearch(e.target.value)} /></div>

      {showForm && (
        <div className="mgr-form-overlay" role="dialog" aria-modal="true" aria-labelledby="portfolio-form-title">
          <div className="mgr-form">
            <div className="mgr-form-header">
              <h3 id="portfolio-form-title">{editing ? 'Edit Project' : 'New Project'}</h3>
              <button className="btn btn-sm btn-ghost" onClick={() => setShowForm(false)} aria-label="Close project modal"><X size={18} aria-hidden="true" /></button>
            </div>
            <div className="mgr-form-body">
              <div className="form-group"><label>Title *</label><input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
              <div className="form-group"><label>Description</label><textarea className="input" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
              <div className="form-group"><label>Category</label><select className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
              <div className="form-group">
                <label>Cover Image</label>
                <div className="mgr-upload-row">
                  <input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploading} />
                  {uploading && <Loader2 size={16} className="spinning" />}
                </div>
                {form.cover_image && <img src={form.cover_image} alt="Portfolio cover image preview" className="mgr-preview" />}
              </div>
              <div className="form-group">
                <label>Gallery Images</label>
                <input type="file" accept="image/*" onChange={handleGalleryUpload} disabled={uploading} />
                <div className="mgr-gallery-preview">
                  {form.gallery_images.map((img, i) => (
                    <div key={i} className="mgr-gallery-item">
                      <img src={img} alt={`Portfolio gallery image ${i + 1}`} />
                      <button onClick={() => removeGalleryImage(i)} aria-label={`Remove gallery image ${i + 1}`}><X size={14} aria-hidden="true" /></button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="form-row">
                <label><input type="checkbox" checked={form.featured} onChange={e => setForm(f => ({ ...f, featured: e.target.checked }))} /> Featured</label>
                <label><input type="checkbox" checked={form.published} onChange={e => setForm(f => ({ ...f, published: e.target.checked }))} /> Published</label>
              </div>
              <button className="btn btn-primary" onClick={saveProject}>{editing ? 'Update' : 'Create'} Project</button>
            </div>
          </div>
        </div>
      )}

      <div className="mgr-table-wrap">
        <table className="mgr-table" aria-label="Portfolio projects list">
          <thead><tr><th>Image</th><th>Title</th><th>Category</th><th>Featured</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id}>
                <td>{p.cover_image ? <img src={p.cover_image} alt={`Cover for ${p.title || 'portfolio item'}`} className="mgr-thumb" /> : '-'}</td>
                <td>{p.title}</td>
                <td>{p.category}</td>
                <td>
                  <button className="btn btn-sm btn-ghost" onClick={() => toggleFeature(p.id, p.featured)} aria-pressed={p.featured} aria-label={p.featured ? "Unfeature project" : "Feature project"}>
                    <Star size={16} className={p.featured ? 'star-filled' : ''} aria-hidden="true" />
                  </button>
                </td>
                <td>
                  <button className="btn btn-sm btn-ghost" onClick={() => togglePublish(p.id, p.published)} aria-pressed={p.published} aria-label={p.published ? "Unpublish project" : "Publish project"}>
                    {p.published ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}
                  </button>
                </td>
                <td className="mgr-actions">
                  <button className="btn btn-sm btn-ghost" onClick={() => editProject(p.id)} aria-label={`Edit project ${p.title}`}><Edit3 size={16} aria-hidden="true" /></button>
                  <button className="btn btn-sm btn-ghost txt-danger" onClick={() => deleteProject(p.id)} aria-label={`Delete project ${p.title}`}><Trash2 size={16} aria-hidden="true" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageContainer>
  )
}

export default React.memo(PortfolioManager)
