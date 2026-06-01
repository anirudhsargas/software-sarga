import { useState, useEffect } from 'react'
import { Loader2, Plus, Edit2, Search, Trash2 } from 'lucide-react'
import api from '../../services/api'
import toast from 'react-hot-toast'

export default function TranslationsManager() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [lang, setLang] = useState('all')
  const [namespace, setNamespace] = useState('all')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editEntry, setEditEntry] = useState(null)
  const [form, setForm] = useState({ lang: 'ml', namespace: 'common', key_name: '', value: '' })

  useEffect(() => { loadEntries() }, [lang, namespace])

  const loadEntries = async () => {
    setLoading(true)
    try {
      const params = {}
      if (lang !== 'all') params.lang = lang
      if (namespace !== 'all') params.namespace = namespace
      const res = await api.get('/translations', { params })
      setEntries(res.data.translations || [])
    } catch (e) { toast.error('Failed to load') }
    finally { setLoading(false) }
  }

  const openNew = () => { setEditEntry(null); setForm({ lang: 'ml', namespace: 'common', key_name: '', value: '' }); setShowForm(true) }

  const openEdit = (e) => { setEditEntry(e); setForm({ lang: e.lang, namespace: e.namespace, key_name: e.key_name, value: e.value }); setShowForm(true) }

  const save = async () => {
    try {
      await api.post('/translations', form)
      toast.success('Translation saved')
      setShowForm(false); loadEntries()
    } catch (e) { toast.error('Failed to save') }
  }

  const remove = async (id) => {
    if (!confirm('Delete this translation?')) return
    try { await api.delete(`/translations/${id}`); toast.success('Deleted'); loadEntries() }
    catch (e) { toast.error('Failed to delete') }
  }

  if (loading) return <div className="loading-spinner"><Loader2 size={36} className="spinning" /></div>

  return (
    <div className="portfolio-mgr">
      <div className="mgr-header"><h2>Translations</h2><button className="btn" onClick={openNew}><Plus size={16} /> Add Entry</button></div>
      <div className="mgr-filters">
        <select className="input" value={lang} onChange={e => setLang(e.target.value)}>
          <option value="all">All Languages</option>
          <option value="en">English</option>
          <option value="ml">Malayalam</option>
          <option value="hi">Hindi</option>
        </select>
        <select className="input" value={namespace} onChange={e => setNamespace(e.target.value)}>
          <option value="all">All Namespaces</option>
          <option value="common">Common</option>
          <option value="nav">Navigation</option>
          <option value="home">Home</option>
          <option value="products">Products</option>
        </select>
        <div className="mgr-search"><Search size={16} /><input className="input" placeholder="Search keys..." value={search} onChange={e => setSearch(e.target.value)} /></div>
      </div>
      <div className="mgr-table-wrap">
        <table className="mgr-table">
          <thead><tr><th>Key</th><th>Lang</th><th>Namespace</th><th>Value</th><th>Actions</th></tr></thead>
          <tbody>
            {entries
              .filter(e => !search || e.key_name?.toLowerCase().includes(search.toLowerCase()) || e.value?.toLowerCase().includes(search.toLowerCase()))
              .map(e => (
              <tr key={e.id}>
                <td><code>{e.key_name}</code></td>
                <td><span className="status-badge">{e.lang}</span></td>
                <td>{e.namespace}</td>
                <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.value}</td>
                <td className="mgr-actions">
                  <button className="btn btn-sm" onClick={() => openEdit(e)}><Edit2 size={14} /></button>
                  <button className="btn btn-sm btn-danger" onClick={() => remove(e.id)}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{editEntry ? 'Edit' : 'New'} Translation</h3>
            <div className="stack-md">
              <label>Language <select className="input" value={form.lang} onChange={e => setForm({ ...form, lang: e.target.value })}>
                <option value="en">English</option>
                <option value="ml">Malayalam</option>
                <option value="hi">Hindi</option>
              </select></label>
              <label>Namespace <input className="input" value={form.namespace} onChange={e => setForm({ ...form, namespace: e.target.value })} /></label>
              <label>Key <input className="input" value={form.key_name} onChange={e => setForm({ ...form, key_name: e.target.value })} /></label>
              <label>Value <textarea className="input" rows={3} value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} /></label>
              <div className="row gap-sm"><button className="btn btn-primary" onClick={save}>Save</button><button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
