import { useState, useEffect } from 'react'
import React, { useCallback } from 'react'
import { Plus, Edit3, Trash2, Loader2, X } from 'lucide-react'
import PageContainer from '../../components/ui/PageContainer'
import api from '../../services/api'
import toast from 'react-hot-toast'

const CAMPAIGN_TYPES = ['Onam', 'Vishu', 'Christmas', 'New Year', 'School Admission', 'Wedding Season', 'Custom']

function PromotionsManager() {
  const [promotions, setPromotions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({
    title: '', description: '', banner_image: '', banner_mobile_image: '',
    campaign_type: 'Custom', start_date: '', end_date: '',
    discount_percent: 0, discount_code: '', link_url: '', priority: 0, is_active: true
  })

  const loadPromotions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/promotions')
      setPromotions(res.data.promotions || [])
    } catch (e) { toast.error('Failed to load') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadPromotions() }, [loadPromotions])

  const savePromotion = useCallback(async () => {
    if (!form.title.trim()) { toast.error('Title required'); return }
    if (!form.start_date || !form.end_date) { toast.error('Start and end dates required'); return }
    try {
      if (editing) {
        await api.put(`/promotions/${editing}`, form)
        toast.success('Updated')
      } else {
        await api.post('/promotions', form)
        toast.success('Created')
      }
      setShowForm(false); setEditing(null)
      setForm({ title: '', description: '', banner_image: '', banner_mobile_image: '', campaign_type: 'Custom', start_date: '', end_date: '', discount_percent: 0, discount_code: '', link_url: '', priority: 0, is_active: true })
      loadPromotions()
    } catch (e) { toast.error('Failed to save') }
  }, [editing, form])

  const editPromotion = useCallback((p) => {
    setForm({ ...p, start_date: p.start_date?.slice(0, 16) || '', end_date: p.end_date?.slice(0, 16) || '' })
    setEditing(p.id)
    setShowForm(true)
  }, [])

  const deletePromotion = useCallback(async (id) => {
    if (!confirm('Delete?')) return
    try { await api.delete(`/promotions/${id}`); toast.success('Deleted'); loadPromotions() }
    catch (e) { toast.error('Failed') }
  }, [])

  if (loading) return <div className="loading-spinner"><Loader2 size={36} className="spinning" /></div>

  return (
    <PageContainer>
      <div className="mgr-header">
        <h2>Seasonal Promotions</h2>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setForm({ title: '', description: '', banner_image: '', banner_mobile_image: '', campaign_type: 'Custom', start_date: '', end_date: '', discount_percent: 0, discount_code: '', link_url: '', priority: 0, is_active: true }); setShowForm(true) }}>
          <Plus size={16} /> New Promotion
        </button>
      </div>

      {showForm && (
        <div className="mgr-form-overlay">
          <div className="mgr-form">
            <div className="mgr-form-header"><h3>{editing ? 'Edit' : 'New'} Promotion<button className="btn btn-sm btn-ghost" onClick={() => setShowForm(false)}><X size={18} /></button></h3></div>
            <div className="mgr-form-body">
              <div className="form-group"><label>Title *</label><input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
              <div className="form-group"><label>Description</label><textarea className="input" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
              <div className="form-group"><label>Campaign Type</label><select className="input" value={form.campaign_type} onChange={e => setForm(f => ({ ...f, campaign_type: e.target.value }))}>{CAMPAIGN_TYPES.map(c => <option key={c}>{c}</option>)}</select></div>
              <div className="form-row">
                <div className="form-group"><label>Start *</label><input className="input" type="datetime-local" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} /></div>
                <div className="form-group"><label>End *</label><input className="input" type="datetime-local" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Discount %</label><input className="input" type="number" value={form.discount_percent} onChange={e => setForm(f => ({ ...f, discount_percent: e.target.value }))} /></div>
                <div className="form-group"><label>Discount Code</label><input className="input" value={form.discount_code} onChange={e => setForm(f => ({ ...f, discount_code: e.target.value }))} /></div>
              </div>
              <div className="form-group"><label>Banner Image URL</label><input className="input" value={form.banner_image} onChange={e => setForm(f => ({ ...f, banner_image: e.target.value }))} placeholder="https://..." /></div>
              <div className="form-group"><label>Link URL</label><input className="input" value={form.link_url} onChange={e => setForm(f => ({ ...f, link_url: e.target.value }))} /></div>
              <div className="form-group"><label>Priority (higher = first)</label><input className="input" type="number" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} /></div>
              <div className="form-row">
                <label><input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} /> Active</label>
              </div>
              <button className="btn btn-primary" onClick={savePromotion}>{editing ? 'Update' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="mgr-table-wrap">
        <table className="mgr-table">
          <thead><tr><th>Title</th><th>Campaign</th><th>Discount</th><th>Start</th><th>End</th><th>Active</th><th>Actions</th></tr></thead>
          <tbody>
            {promotions.map(p => (
              <tr key={p.id}>
                <td>{p.title}</td>
                <td>{p.campaign_type}</td>
                <td>{p.discount_percent}%</td>
                <td>{new Date(p.start_date).toLocaleDateString()}</td>
                <td>{new Date(p.end_date).toLocaleDateString()}</td>
                <td>{p.is_active ? 'Yes' : 'No'}</td>
                <td className="mgr-actions">
                  <button className="btn btn-sm btn-ghost" onClick={() => editPromotion(p)}><Edit3 size={16} /></button>
                  <button className="btn btn-sm btn-ghost txt-danger" onClick={() => deletePromotion(p.id)}><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageContainer>
  )
}

export default React.memo(PromotionsManager)
