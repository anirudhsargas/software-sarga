import { useState, useEffect } from 'react'
import React, { useCallback } from 'react'
import { Loader2, Search, Calendar, Filter } from 'lucide-react'
import api from '../../services/api'
import toast from 'react-hot-toast'

function PickupBookings() {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ branch_id: '', date: '', status: '' })
  const [search, setSearch] = useState('')
  const [branches, setBranches] = useState([])

  const loadBranches = useCallback(async () => {
    try { const r = await api.get('/branches'); setBranches(r.data || []) } catch (e) {}
  }, [])

  const loadBookings = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (filter.branch_id) params.branch_id = filter.branch_id
      if (filter.date) params.date = filter.date
      if (filter.status) params.status = filter.status
      const res = await api.get('/pickup/bookings', { params })
      setBookings(res.data.bookings || [])
    } catch (e) { toast.error('Failed to load') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadBranches(); loadBookings() }, [loadBranches, loadBookings])

  const updateStatus = useCallback(async (id, status) => {
    try {
      await api.put(`/pickup/bookings/${id}/status`, { status })
      toast.success(`Marked as ${status}`)
      loadBookings()
    } catch (e) { toast.error('Failed') }
  }, [])

  if (loading) return <div className="loading-spinner"><Loader2 size={36} className="spinning" /></div>

  return (
    <div className="portfolio-mgr">
      <div className="mgr-header"><h2>Pickup Bookings</h2></div>
      <div className="mgr-filters">
        <div className="mgr-search"><Search size={16} /><input className="input" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        <select className="input" value={filter.status} onChange={e => setFilter({ ...filter, status: e.target.value })}>
          <option value="">All Status</option><option value="confirmed">Confirmed</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option>
        </select>
        <input className="input" type="date" value={filter.date} onChange={e => setFilter({ ...filter, date: e.target.value })} />
        <select className="input" value={filter.branch_id} onChange={e => setFilter({ ...filter, branch_id: e.target.value })}>
          <option value="">All Branches</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <button className="btn btn-sm" onClick={loadBookings}><Filter size={14} /> Apply</button>
      </div>
      <div className="mgr-table-wrap">
        <table className="mgr-table">
          <thead><tr><th>Ref #</th><th>Customer</th><th>Phone</th><th>Branch</th><th>Date</th><th>Time</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {bookings
              .filter(b => !search || b.customer_name?.toLowerCase().includes(search.toLowerCase()) || b.reference_number?.toLowerCase().includes(search.toLowerCase()) || b.customer_phone?.includes(search))
              .map(b => (
              <tr key={b.id}>
                <td><strong>{b.reference_number}</strong></td>
                <td>{b.customer_name}</td>
                <td>{b.customer_phone}</td>
                <td>{b.branch_name}</td>
                <td>{b.slot_date ? new Date(b.slot_date).toLocaleDateString() : '-'}</td>
                <td>{b.start_time?.slice(0, 5)}-{b.end_time?.slice(0, 5)}</td>
                <td><span className={`status-badge status-${b.status}`}>{b.status}</span></td>
                <td className="mgr-actions">
                  {b.status === 'confirmed' && (
                    <>
                      <button className="btn btn-sm" onClick={() => updateStatus(b.id, 'completed')}>Complete</button>
                      <button className="btn btn-sm btn-danger" onClick={() => updateStatus(b.id, 'cancelled')}>Cancel</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default React.memo(PickupBookings)
