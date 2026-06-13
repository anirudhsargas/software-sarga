import { useState, useEffect, useRef } from 'react'
import React, { useCallback, useMemo } from 'react'
import { Loader2, Plus, Edit2, Search, Trash2, X, Globe, Check } from 'lucide-react'
import api from '../../services/api'
import toast from 'react-hot-toast'
import './TranslationsManager.css'

const LANGUAGES = [
  { value: 'ml', label: 'Malayalam' },
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
]

const NAMESPACES = [
  { value: 'common', label: 'Common' },
  { value: 'nav', label: 'Navigation' },
  { value: 'home', label: 'Home' },
  { value: 'products', label: 'Products' },
]

const staggerEnter = (el, i) => {
  if (!el) return
  el.style.transitionDelay = `${i * 30}ms`
  requestAnimationFrame(() => el.classList.add('animate-in'))
}

function TranslationsManager() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [lang, setLang] = useState('all')
  const [namespace, setNamespace] = useState('all')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editEntry, setEditEntry] = useState(null)
  const [form, setForm] = useState({ lang: 'ml', namespace: 'common', key_name: '', value: '' })
  const [saving, setSaving] = useState(false)
  const tbodyRef = useRef(null)

  const loadEntries = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (lang !== 'all') params.lang = lang
      if (namespace !== 'all') params.namespace = namespace
      const res = await api.get('/translations', { params })
      setEntries(res.data.translations || [])
      setTimeout(() => {
        if (tbodyRef.current) {
          tbodyRef.current.querySelectorAll('tr.tr__row').forEach((el, i) => staggerEnter(el, i))
        }
      }, 50)
    } catch {
      toast.error('Failed to load translations')
    } finally {
      setLoading(false)
    }
  }, [lang, namespace])

  useEffect(() => { loadEntries() }, [loadEntries])

  const openNew = useCallback(() => {
    setEditEntry(null)
    setForm({ lang: 'ml', namespace: 'common', key_name: '', value: '' })
    setShowForm(true)
  }, [])

  const openEdit = useCallback((e) => {
    setEditEntry(e)
    setForm({ lang: e.lang, namespace: e.namespace, key_name: e.key_name, value: e.value })
    setShowForm(true)
  }, [])

  const save = useCallback(async () => {
    setSaving(true)
    try {
      await api.post('/translations', form)
      toast.success('Translation saved')
      setShowForm(false)
      loadEntries()
    } catch {
      toast.error('Failed to save translation')
    } finally {
      setSaving(false)
    }
  }, [form])

  const remove = useCallback(async (id) => {
    if (!confirm('Delete this translation?')) return
    try {
      await api.delete(`/translations/${id}`)
      toast.success('Deleted')
      loadEntries()
    } catch {
      toast.error('Failed to delete')
    }
  }, [])

  const filtered = useMemo(() => entries.filter(
    e => !search || e.key_name?.toLowerCase().includes(search.toLowerCase()) || e.value?.toLowerCase().includes(search.toLowerCase())
  ), [entries, search])

  const langLabel = (code) => LANGUAGES.find(l => l.value === code)?.label || code

  if (loading) {
    return (
      <div>
        <div className="tr__loader">
          <Loader2 size={20} className="spin" />
          <span>Loading translations...</span>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="section-title">Translations</h1>
          <p className="muted" style={{ fontSize: 13 }}>Manage multilingual content keys for the website.</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={16} />
          <span>Add Entry</span>
        </button>
      </div>

      <div className="stack-md">
        <div className="tr__filters row gap-md wrap items-center">
          <div className="flex-1" style={{ minWidth: 220 }}>
            <div className="search-wrapper">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                id="translations-search"
                name="translations-search"
                placeholder="Search keys or values..."
                className="input-field"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <select
            id="translations-lang-filter"
            name="translations-lang-filter"
            className="input-field"
            style={{ width: 160 }}
            value={lang}
            onChange={e => setLang(e.target.value)}
          >
            <option value="all">All Languages</option>
            {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
          <select
            id="translations-namespace-filter"
            name="translations-namespace-filter"
            className="input-field"
            style={{ width: 160 }}
            value={namespace}
            onChange={e => setNamespace(e.target.value)}
          >
            <option value="all">All Namespaces</option>
            {NAMESPACES.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
          </select>
        </div>

        <div className="tr__table-wrap">
          <table className="tr__table">
            <thead>
              <tr>
                <th style={{ width: '30%' }}>Key</th>
                <th style={{ width: 80 }}>Lang</th>
                <th style={{ width: 100 }}>Namespace</th>
                <th>Value</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
              <tbody ref={tbodyRef}>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan="5" className="tr__empty">
                    No translations found.
                  </td>
                </tr>
              ) : (
                filtered.map((e, i) => (
                  <tr key={e.id} className="tr__row" ref={el => el && staggerEnter(el, i)}>
                    <td>
                      <code className="tr__code">{e.key_name}</code>
                    </td>
                    <td>
                      <span className="tr__lang-pill">
                        <Globe size={12} />
                        {langLabel(e.lang)}
                      </span>
                    </td>
                    <td>
                      <span className="text-xs muted">{e.namespace}</span>
                    </td>
                    <td style={{ maxWidth: 360 }}>
                      <span className="tr__value">{e.value}</span>
                    </td>
                    <td>
                      <div className="row gap-xs" style={{ flexWrap: 'nowrap' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(e)} title="Edit">
                          <Edit2 size={13} />
                        </button>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }} onClick={() => remove(e.id)} title="Delete">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="tr__count">
          {filtered.length} of {entries.length} entries
        </div>
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h2>{editEntry ? 'Edit' : 'New'} Translation</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={20} /></button>
            </div>
            <div className="modal-body stack-md">
              <div>
                <label className="label">Language</label>
                <select
                  id="translation-lang"
                  name="translation-lang"
                  className="input-field"
                  value={form.lang}
                  onChange={e => setForm({ ...form, lang: e.target.value })}
                >
                  {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Namespace</label>
                <input
                  id="translation-namespace"
                  name="translation-namespace"
                  className="input-field"
                  value={form.namespace}
                  onChange={e => setForm({ ...form, namespace: e.target.value })}
                  placeholder="e.g. common, nav, home"
                />
              </div>
              <div>
                <label className="label">Key</label>
                <input
                  id="translation-key"
                  name="translation-key"
                  className="input-field"
                  value={form.key_name}
                  onChange={e => setForm({ ...form, key_name: e.target.value })}
                  placeholder="e.g. welcome_message"
                />
              </div>
              <div>
                <label className="label">Value</label>
                <textarea
                  id="translation-value"
                  name="translation-value"
                  className="input-field textarea"
                  rows={3}
                  value={form.value}
                  onChange={e => setForm({ ...form, value: e.target.value })}
                  placeholder="Translated text"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? <><Loader2 size={15} className="spin" /> Saving...</> : <><Check size={15} /> Save</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default React.memo(TranslationsManager)
