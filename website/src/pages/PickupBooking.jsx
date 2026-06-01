import { useState, useEffect } from 'react'
import { Calendar, Clock, MapPin, CheckCircle, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import api from '../api'
import SEO from '../components/SEO'
import './PickupBooking.css'

export default function PickupBooking() {
  const [branches, setBranches] = useState([])
  const [branchId, setBranchId] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [slots, setSlots] = useState([])
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [loading, setLoading] = useState(false)
  const [booking, setBooking] = useState(null)
  const [form, setForm] = useState({ customer_name: '', customer_phone: '', customer_email: '' })
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/website/branches').then(res => {
      if (res.data?.branches) setBranches(res.data.branches)
    }).catch(() => {})
    const today = new Date().toISOString().slice(0, 10)
    setSelectedDate(today)
  }, [])

  useEffect(() => {
    if (branchId && selectedDate) {
      loadSlots()
    }
  }, [branchId, selectedDate])

  useEffect(() => {
    const token = localStorage.getItem('sarga_customer_token')
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        if (payload.name) setForm(f => ({ ...f, customer_name: payload.name }))
      } catch (e) {}
    }
  }, [])

  const loadSlots = async () => {
    setLoading(true)
    try {
      const res = await api.get('/website/pickup/slots', { params: { branch_id: branchId, date: selectedDate } })
      setSlots(res.data.slots || [])
    } catch (e) {
      setSlots([])
    } finally {
      setLoading(false)
    }
  }

  const handleBook = async () => {
    if (!selectedSlot) { setError('Please select a time slot'); return }
    if (!form.customer_name.trim()) { setError('Please enter your name'); return }
    if (!form.customer_phone.trim()) { setError('Please enter your phone number'); return }
    setError('')
    try {
      const customerId = localStorage.getItem('sarga_customer_id')
      const res = await api.post('/website/pickup/book', {
        slot_id: selectedSlot,
        customer_name: form.customer_name,
        customer_phone: form.customer_phone,
        customer_email: form.customer_email,
        customer_id: customerId || undefined
      })
      setBooking(res.data)
    } catch (e) {
      setError(e.response?.data?.error || 'Booking failed')
    }
  }

  const nextDate = () => {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + 1)
    setSelectedDate(d.toISOString().slice(0, 10))
  }
  const prevDate = () => {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() - 1)
    setSelectedDate(d.toISOString().slice(0, 10))
  }

  if (booking) {
    return (
      <div className="pickup-page">
        <div className="pickup-container">
          <div className="pickup-success">
            <CheckCircle size={48} />
            <h2>Pickup Slot Booked!</h2>
            <p>Reference: <strong>{booking.reference_number}</strong></p>
            <p>A confirmation will be sent to your WhatsApp.</p>
            <button className="btn btn-primary" onClick={() => { setBooking(null); setSelectedSlot(null); setForm({ customer_name: '', customer_phone: '', customer_email: '' }) }}>
              Book Another
            </button>
          </div>
        </div>
      </div>
    )
  }

  const formattedDate = selectedDate
    ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  return (
    <div className="pickup-page">
      <SEO title="Schedule Pickup" description="Reserve a pickup slot at Sarga Printing branches in Perambra or Meppayur." />
      <section className="page-header">
        <div className="page-header__bg" />
        <div className="container page-header__content">
          <span className="badge badge-primary">Convenience</span>
          <h1 className="page-header__title">Schedule a <span className="text-gradient">Pickup</span></h1>
          <p className="page-header__subtitle">Reserve a time slot to collect your order from our branches</p>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div className="pickup-card">
            <div className="pickup-form-group">
              <label><MapPin size={16} /> Branch</label>
              <select className="input" value={branchId} onChange={e => setBranchId(e.target.value)}>
                <option value="">Select branch</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>

            {branchId && (
              <>
                <div className="pickup-form-group">
                  <label><Calendar size={16} /> Date</label>
                  <div className="pickup-date-nav">
                    <button className="btn btn-sm btn-ghost" onClick={prevDate}><ChevronLeft size={18} /></button>
                    <span className="pickup-date-label">{formattedDate}</span>
                    <button className="btn btn-sm btn-ghost" onClick={nextDate}><ChevronRight size={18} /></button>
                  </div>
                </div>

                <div className="pickup-form-group">
                  <label><Clock size={16} /> Available Time Slots</label>
                  {loading ? (
                    <div className="pickup-loading"><Loader2 size={24} className="spinning" /></div>
                  ) : slots.length === 0 ? (
                    <p className="pickup-no-slots">No slots available for this date. Try another date.</p>
                  ) : (
                    <div className="pickup-slots-grid">
                      {slots.map(s => (
                        <button
                          key={s.id}
                          className={`pickup-slot ${selectedSlot === s.id ? 'active' : ''} ${s.available === 0 ? 'full' : ''}`}
                          onClick={() => s.available > 0 && setSelectedSlot(s.id)}
                          disabled={s.available === 0}
                        >
                          <span className="pickup-slot-time">{s.start_time.slice(0, 5)} - {s.end_time.slice(0, 5)}</span>
                          <span className="pickup-slot-avail">{s.available} left</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {selectedSlot && (
                  <div className="pickup-booking-form">
                    <h3>Your Details</h3>
                    <div className="pickup-form-group">
                      <label>Name *</label>
                      <input className="input" value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} placeholder="Full name" />
                    </div>
                    <div className="pickup-form-group">
                      <label>Phone *</label>
                      <input className="input" type="tel" value={form.customer_phone} onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))} placeholder="Mobile number" />
                    </div>
                    <div className="pickup-form-group">
                      <label>Email</label>
                      <input className="input" type="email" value={form.customer_email} onChange={e => setForm(f => ({ ...f, customer_email: e.target.value }))} placeholder="Email (optional)" />
                    </div>
                    {error && <p className="pickup-error">{error}</p>}
                    <button className="btn btn-primary btn-block" onClick={handleBook}>Confirm Booking</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
