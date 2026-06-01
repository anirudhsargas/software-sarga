import { useState, useEffect } from 'react';
import { Calendar, Clock, Video, Phone, Users, Check, X, Tag, DollarSign, Award, AlertTriangle, Search, Filter } from 'lucide-react';
import api from '../services/api';
import './DesignBookingsCMS.css';

export default function DesignBookingsCMS() {
  const [bookings, setBookings] = useState([]);
  const [designers, setDesigners] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All'); // 'All' | 'Pending' | 'Confirmed' | 'Completed' | 'Cancelled'
  const [typeFilter, setTypeFilter] = useState('All');

  // Selected Booking modal
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [updating, setUpdating] = useState(false);

  // Form states inside modal
  const [status, setStatus] = useState('Pending');
  const [assignedStaffId, setAssignedStaffId] = useState('');
  const [notes, setNotes] = useState('');
  const [quoteIssued, setQuoteIssued] = useState(false);
  const [quoteAmount, setQuoteAmount] = useState('');
  const [conflictWarning, setConflictWarning] = useState('');

  // Fetch initial data
  const fetchData = async () => {
    try {
      setLoading(true);
      const [bookingsRes, designersRes] = await Promise.all([
        api.get('/admin/consultations'),
        api.get('/admin/designers')
      ]);
      setBookings(bookingsRes.data.consultations || []);
      setDesigners(designersRes.data.designers || []);
    } catch (err) {
      console.error('Failed to fetch CRM booking data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Helper to check overlapping bookings for a designer on staff assignment change
  const handleDesignerChange = (staffId) => {
    setAssignedStaffId(staffId);
    setConflictWarning('');

    if (!staffId || !selectedBooking) return;

    // Check conflict: designer is assigned to another booking on the same date and overlapping times
    const designerId = parseInt(staffId, 10);
    const dateStr = selectedBooking.date; // YYYY-MM-DD
    
    // Convert current selected booking time to minutes
    const timeToMinutes = (t) => {
      const parts = t.split(':');
      return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
    };

    const bStart = timeToMinutes(selectedBooking.start_time);
    const bEnd = bStart + selectedBooking.duration;

    const hasConflict = bookings.some(b => {
      // Must be a different booking, same designer, same date, and not cancelled
      if (b.id === selectedBooking.id) return false;
      if (b.assigned_staff_id !== designerId) return false;
      if (b.date !== dateStr) return false;
      if (b.status === 'Cancelled') return false;

      const otherStart = timeToMinutes(b.start_time);
      const otherEnd = otherStart + b.duration;

      // Overlap formula
      return bStart < otherEnd && bEnd > otherStart;
    });

    if (hasConflict) {
      setConflictWarning('⚠️ Warning: This designer has an overlapping consultation booked at this time.');
    }
  };

  const handleOpenModal = (booking) => {
    setSelectedBooking(booking);
    setStatus(booking.status);
    setAssignedStaffId(booking.assigned_staff_id || '');
    setNotes(booking.notes || '');
    setQuoteIssued(booking.quote_issued === 1);
    setQuoteAmount(booking.quote_amount || '');
    setConflictWarning('');
  };

  const handleUpdateBooking = async (e) => {
    e.preventDefault();
    if (!selectedBooking) return;
    setUpdating(true);
    try {
      await api.put(`/admin/consultations/${selectedBooking.id}`, {
        status,
        assigned_staff_id: assignedStaffId ? parseInt(assignedStaffId, 10) : null,
        notes,
        quote_issued: quoteIssued ? 1 : 0,
        quote_amount: quoteIssued && quoteAmount ? parseFloat(quoteAmount) : null
      });
      import('react-hot-toast').then(m => m.default.success('Appointment saved!'));
      setSelectedBooking(null);
      fetchData();
    } catch (err) {
      console.error(err);
      alert('Failed to update booking.');
    } finally {
      setUpdating(false);
    }
  };

  // CRM Analytics Metrics
  const metrics = (() => {
    const total = bookings.length;
    const confirmed = bookings.filter(b => b.status === 'Confirmed').length;
    const completedBookings = bookings.filter(b => b.status === 'Completed');
    
    // Conversion Rate: % of completed consultations that generated a follow-up quote
    const completedCount = completedBookings.length;
    const convertedCount = completedBookings.filter(b => b.quote_issued === 1 || b.quote_amount > 0).length;
    const conversionRate = completedCount > 0 ? ((convertedCount / completedCount) * 100).toFixed(1) : '0.0';

    // Sum of quote amounts representing conversion value
    const pipelineValue = bookings.reduce((sum, b) => sum + (parseFloat(b.quote_amount) || 0), 0);

    return { total, confirmed, conversionRate, pipelineValue };
  })();

  // Filter Bookings
  const filteredBookings = bookings.filter(b => {
    const matchesSearch = 
      b.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      b.customer_phone.includes(search) ||
      b.consultation_type.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'All' || b.status === statusFilter;
    const matchesType = typeFilter === 'All' || b.consultation_type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  return (
    <div className="bookings-cms reveal revealed">
      
      {/* ──── CRM ANALYTICS WIDGET ──── */}
      <div className="crm-metrics-grid mb-24">
        <div className="metric-card glass-panel">
          <div className="metric-icon total">
            <Calendar size={24} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Total Leads</span>
            <strong className="metric-value">{metrics.total}</strong>
          </div>
        </div>

        <div className="metric-card glass-panel">
          <div className="metric-icon confirmed">
            <Clock size={24} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Active Scheduled</span>
            <strong className="metric-value">{metrics.confirmed}</strong>
          </div>
        </div>

        <div className="metric-card glass-panel">
          <div className="metric-icon conversion">
            <Award size={24} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Lead Conversion Rate</span>
            <strong className="metric-value">{metrics.conversionRate}%</strong>
          </div>
        </div>

        <div className="metric-card glass-panel">
          <div className="metric-icon pipeline">
            <DollarSign size={24} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Pipeline Value</span>
            <strong className="metric-value">₹{metrics.pipelineValue.toLocaleString('en-IN')}</strong>
          </div>
        </div>
      </div>

      <div className="cms-header mb-24">
        <div>
          <h1 className="section-title">Design Consultations CRM</h1>
          <p className="muted">Book visual screen-share or store slots, assign designers, and track follow-up quotes conversions.</p>
        </div>
      </div>

      {loading ? (
        <div className="cms-loader">
          <div className="small-spinner"></div>
          <span>Loading consultation ledger...</span>
        </div>
      ) : (
        <div className="stack-md">
          {/* Filters Bar */}
          <div className="filters-bar row gap-md">
            <div className="flex-1 search-wrapper">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder="Search by customer, phone, or design category..."
                className="input-field"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            
            <div style={{ width: 180 }}>
              <select
                className="input-field"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="All">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="Confirmed">Confirmed</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

            <div style={{ width: 220 }}>
              <select
                className="input-field"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="All">All Design Types</option>
                <option value="Wedding Card Design">Wedding Card Design</option>
                <option value="Memento Design">Memento Design</option>
                <option value="Business Branding">Business Branding</option>
                <option value="Brochure Design">Brochure Design</option>
                <option value="Invitation Design">Invitation Design</option>
                <option value="Custom Printing Projects">Custom Printing Projects</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="table-responsive">
            <table className="cms-table">
              <thead>
                <tr>
                  <th>Booking ID</th>
                  <th>Customer</th>
                  <th>Design Needed</th>
                  <th>Channel</th>
                  <th>Date & Time</th>
                  <th>Assigned Designer</th>
                  <th>Status</th>
                  <th>Quote Conversion</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBookings.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="text-center muted">No appointments match your filters.</td>
                  </tr>
                ) : (
                  filteredBookings.map(b => (
                    <tr key={b.id}>
                      <td><strong>#{b.id}</strong></td>
                      <td>
                        <div>
                          <div><strong>{b.customer_name}</strong></div>
                          <span className="muted text-xs">{b.customer_phone}</span>
                        </div>
                      </td>
                      <td>
                        <span className="category-pill">{b.consultation_type}</span>
                      </td>
                      <td>
                        <span className="mode-pill">
                          {b.meeting_mode === 'Google Meet' && <Video size={12} className="mr-4 text-primary" />}
                          {b.meeting_mode === 'Phone Call' && <Phone size={12} className="mr-4 text-primary" />}
                          {b.meeting_mode}
                        </span>
                      </td>
                      <td>
                        <div>
                          <strong>{b.date}</strong>
                          <div className="text-xs muted">{b.start_time} ({b.duration} Min)</div>
                        </div>
                      </td>
                      <td>
                        {b.staff_name ? (
                          <span className="designer-assigned">{b.staff_name}</span>
                        ) : (
                          <span className="text-error font-semibold text-xs">Unassigned</span>
                        )}
                      </td>
                      <td>
                        <span className={`status-badge status-badge--${b.status.toLowerCase()}`}>
                          {b.status}
                        </span>
                      </td>
                      <td>
                        {b.quote_issued === 1 ? (
                          <span className="quote-badge success">
                            ₹{parseFloat(b.quote_amount).toLocaleString('en-IN')}
                          </span>
                        ) : (
                          <span className="quote-badge pending">No Quote</span>
                        )}
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleOpenModal(b)}>
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ──── APPOINTMENT DETAILS & CRM MODAL ──── */}
      {selectedBooking && (
        <div className="modal-backdrop">
          <div className="modal modal--large">
            <button className="modal-close" onClick={() => setSelectedBooking(null)}><X size={20} /></button>
            <h2>Design Appointment CRM Manager: #{selectedBooking.id}</h2>

            <form onSubmit={handleUpdateBooking} className="modal-layout mt-16">
              
              {/* Sidebar: customer details & status */}
              <div className="modal-sidebar stack-md">
                <div className="details-card">
                  <h3>Customer Details</h3>
                  <div className="stack-sm mt-8 text-sm">
                    <div>
                      <span className="muted block">Name:</span>
                      <strong>{selectedBooking.customer_name}</strong>
                    </div>
                    <div>
                      <span className="muted block">Phone:</span>
                      <strong>{selectedBooking.customer_phone}</strong>
                    </div>
                    <div>
                      <span className="muted block">Email:</span>
                      <span>{selectedBooking.customer_email || 'Not provided'}</span>
                    </div>
                  </div>
                </div>

                <div className="details-card">
                  <h3>Appointment Time</h3>
                  <div className="stack-sm mt-8 text-sm">
                    <div>
                      <span className="muted block">Date:</span>
                      <strong>{selectedBooking.date}</strong>
                    </div>
                    <div>
                      <span className="muted block">Time Slot:</span>
                      <strong>{selectedBooking.start_time} ({selectedBooking.duration} mins)</strong>
                    </div>
                    <div>
                      <span className="muted block">Channel:</span>
                      <span>{selectedBooking.meeting_mode}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="label">Appointment Status</label>
                  <select
                    className="input-field"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    required
                  >
                    <option value="Pending">Pending</option>
                    <option value="Confirmed">Confirmed</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              {/* Main panel: designer assigning & quote conversion */}
              <div className="modal-main stack-md">
                
                {/* Designer Assignment */}
                <div className="details-card">
                  <h3>Designer Assignment</h3>
                  <div className="mt-8 stack-sm">
                    <label className="label">Select Staff Designer *</label>
                    <select
                      className="input-field"
                      value={assignedStaffId}
                      onChange={(e) => handleDesignerChange(e.target.value)}
                    >
                      <option value="">-- Choose Designer --</option>
                      {designers.map(d => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.role})
                        </option>
                      ))}
                    </select>

                    {conflictWarning && (
                      <div className="alert alert--error py-8 mt-8">
                        <AlertTriangle size={14} className="mr-8" />
                        <span className="text-xs font-semibold">{conflictWarning}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* CRM Quote Conversion */}
                <div className="details-card">
                  <h3>CRM Sales Conversion</h3>
                  <div className="stack-md mt-8">
                    <label className="checkbox-container">
                      <input
                        type="checkbox"
                        checked={quoteIssued}
                        onChange={(e) => setQuoteIssued(e.target.checked)}
                      />
                      <span className="checkbox-label">Follow-up Print Quote Issued (Lead Converted)</span>
                    </label>

                    {quoteIssued && (
                      <div className="row gap-md items-center reveal revealed">
                        <div className="flex-1">
                          <label className="label">Generated Quote Amount (₹) *</label>
                          <div style={{ position: 'relative' }}>
                            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontWeight: 'bold' }}>₹</span>
                            <input
                              type="number"
                              className="input-field"
                              style={{ paddingLeft: 24 }}
                              placeholder="e.g. 15000"
                              value={quoteAmount}
                              onChange={(e) => setQuoteAmount(e.target.value)}
                              required={quoteIssued}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="label">Internal Design / Meeting Notes</label>
                  <textarea
                    className="input-field textarea"
                    placeholder="Add brief details about their invitation sheets, rustic paper choice, layout drafts shared..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>

                <div className="row end gap-md mt-16">
                  <button type="button" className="btn btn-ghost" onClick={() => setSelectedBooking(null)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={updating}>
                    {updating ? 'Saving CRM changes...' : 'Save CRM Details'}
                  </button>
                </div>

              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
