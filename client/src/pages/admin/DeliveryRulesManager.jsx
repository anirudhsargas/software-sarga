import React, {useState, useEffect, useCallback} from 'react'
import { Loader2, Plus, Edit2, Trash2 } from 'lucide-react'
import PageContainer from '../../components/ui/PageContainer'
import api from '../../services/api'
import toast from 'react-hot-toast'

function DeliveryRulesManager() {
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editRule, setEditRule] = useState(null)
  const [form, setForm] = useState({ product_category: '', service_type: 'standard', base_days: 3, capacity_per_day: 50 })

  const loadRules = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/delivery/rules')
      setRules(res.data.rules || [])
    } catch { toast.error('Failed to load delivery rules') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadRules() }, [loadRules])

  const openNew = useCallback(() => { setEditRule(null); setForm({ product_category: '', service_type: 'standard', base_days: 3, capacity_per_day: 50 }); setShowForm(true) }, [])

  const openEdit = useCallback((r) => { setEditRule(r); setForm({ product_category: r.product_category, service_type: r.service_type, base_days: r.base_days, capacity_per_day: r.capacity_per_day }); setShowForm(true) }, [])

  const save = useCallback(async () => {
    try {
      if (editRule) {
        await api.put(`/delivery/rules/${editRule.id}`, form)
        toast.success('Rule updated')
      } else {
        await api.post('/delivery/rules', form)
        toast.success('Rule created')
      }
      setShowForm(false); loadRules()
    } catch { toast.error('Failed to save') }
  }, [])

  const remove = useCallback(async (id) => {
    if (!confirm('Delete this rule?')) return
    try { await api.delete(`/delivery/rules/${id}`); toast.success('Deleted'); loadRules() }
    catch { toast.error('Failed to delete') }
  }, [])

  if (loading) return <div className="loading-spinner"><Loader2 size={36} className="spinning" /></div>

  return (
    <PageContainer>
      <div className="mgr-header"><h2>Delivery Rules</h2><button className="btn" onClick={openNew}><Plus size={16} /> New Rule</button></div>
      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{editRule ? 'Edit' : 'New'} Delivery Rule</h3>
            <div className="stack-md">
              <label>Product Category <input className="input" value={form.product_category} onChange={e => setForm({ ...form, product_category: e.target.value })} /></label>
              <label>Service Type <input className="input" value={form.service_type} onChange={e => setForm({ ...form, service_type: e.target.value })} /></label>
              <label>Base Days <input className="input" type="number" value={form.base_days} onChange={e => setForm({ ...form, base_days: +e.target.value })} /></label>
              <label>Capacity Per Day <input className="input" type="number" value={form.capacity_per_day} onChange={e => setForm({ ...form, capacity_per_day: +e.target.value })} /></label>
              <div className="row gap-sm"><button className="btn btn-primary" onClick={save}>Save</button><button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button></div>
            </div>
          </div>
        </div>
      )}
      <div className="mgr-table-wrap">
        <table className="mgr-table">
          <thead><tr><th>Category</th><th>Service Type</th><th>Base Days</th><th>Capacity/Day</th><th>Active</th><th>Actions</th></tr></thead>
          <tbody>
            {rules.map(r => (
              <tr key={r.id}>
                <td>{r.product_category}</td><td>{r.service_type}</td><td>{r.base_days}</td><td>{r.capacity_per_day}</td>
                <td><span className={`status-badge ${r.is_active ? 'status-active' : ''}`}>{r.is_active ? 'Yes' : 'No'}</span></td>
                <td className="mgr-actions">
                  <button className="btn btn-sm" onClick={() => openEdit(r)}><Edit2 size={14} /></button>
                  <button className="btn btn-sm btn-danger" onClick={() => remove(r.id)}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageContainer>
  )
}

export default React.memo(DeliveryRulesManager)
