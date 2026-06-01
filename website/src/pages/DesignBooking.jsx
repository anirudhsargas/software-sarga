import { useState, useEffect } from 'react';
import { Calendar, Clock, Video, Phone, Users, Check, Sparkles, AlertCircle, ArrowRight, MessageSquare } from 'lucide-react';
import SEO from '../components/SEO';
import './DesignBooking.css';

const CONSULTATION_TYPES = [
  { id: 'Wedding Card Design', label: 'Wedding Card Design', desc: 'Custom creative layouts for traditional & luxury wedding cards.' },
  { id: 'Memento Design', label: 'Memento Design', desc: 'Trophy plaques, acrylic recognition awards & memento designs.' },
  { id: 'Business Branding', label: 'Business Branding', desc: 'Premium logo creation, corporate guidelines & brand assets.' },
  { id: 'Brochure Design', label: 'Brochure Design', desc: 'Professional multi-fold flyers, catalogs & company profiles.' },
  { id: 'Invitation Design', label: 'Invitation Design', desc: 'Event invites, inaugural functions & housewarming cards.' },
  { id: 'Custom Printing Projects', label: 'Custom Printing Projects', desc: 'Bespoke box packing, books, journals & custom requests.' }
];

const MEETING_MODES = [
  { id: 'Phone Call', label: 'Normal Phone Call', icon: Phone, desc: 'Sarga designers will call your mobile number directly.' },
  { id: 'WhatsApp Call', label: 'WhatsApp Audio/Video', icon: MessageSquare, desc: 'Internet call over WhatsApp (ideal for overseas clients).' },
  { id: 'Google Meet', label: 'Google Meet Screen Share', icon: Video, desc: 'Visual screen sharing session to co-edit or review designs live.' },
  { id: 'In-Person', label: 'In-Store Meeting', icon: Users, desc: 'Visit our branch to check paper physical specimens in person.' }
];

export default function DesignBooking() {
  const [branches, setBranches] = useState([]);
  const [selectedType, setSelectedType] = useState(CONSULTATION_TYPES[0].id);
  const [duration, setDuration] = useState(15); // 15 | 30 minutes
  const [meetingMode, setMeetingMode] = useState('Phone Call');
  const [preferredBranchId, setPreferredBranchId] = useState('');
  
  // Date and Time Slot selection
  const [selectedDate, setSelectedDate] = useState('');
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState('');
  
  // Form fields
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [notes, setNotes] = useState('');

  // UI States
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successData, setSuccessData] = useState(null);

  // Set min date of picker to today
  const todayStr = new Date().toISOString().split('T')[0];

  // Fetch branches and public settings
  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const res = await fetch('/api/website/branches');
        if (res.ok) {
          const data = await res.json();
          setBranches(data.branches || []);
          if (data.branches?.length > 0) {
            setPreferredBranchId(data.branches[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load branches:', err);
      }
    };
    fetchBranches();
  }, []);

  // Fetch available slots when date or duration changes
  useEffect(() => {
    if (!selectedDate) return;

    const fetchSlots = async () => {
      setLoadingSlots(true);
      setError('');
      setSelectedSlot('');
      try {
        const res = await fetch(`/api/website/consultations/slots?date=${selectedDate}&duration=${duration}`);
        if (!res.ok) throw new Error('Failed to load available slots.');
        const data = await res.json();
        setAvailableSlots(data.slots || []);
      } catch (err) {
        setError('Unable to fetch open slots. Please check your network.');
      } finally {
        setLoadingSlots(false);
      }
    };

    fetchSlots();
  }, [selectedDate, duration]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!selectedDate || !selectedSlot) {
      setError('Please pick a convenient date and time slot first.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/website/consultations/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_email: customerEmail,
          consultation_type: selectedType,
          meeting_mode: meetingMode,
          preferred_branch_id: meetingMode === 'In-Person' ? parseInt(preferredBranchId, 10) : null,
          date: selectedDate,
          start_time: selectedSlot,
          duration,
          notes
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Booking failed.');
      }

      setSuccessData(data);
    } catch (err) {
      setError(err.message || 'An error occurred during booking. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (successData) {
    return (
      <div className="booking-success container">
        <SEO title="Design Consultation Confirmed - Sarga" description="Your design appointment has been successfully scheduled!" />
        <div className="success-card reveal revealed">
          <div className="success-icon">
            <Check size={48} />
          </div>
          <h1>Consultation Booked!</h1>
          <p className="success-subtitle">Your free design consultation has been successfully reserved with Sarga's design team.</p>

          <div className="success-details">
            <div className="detail-row">
              <strong>Appointment ID:</strong> <span>#{successData.booking_id}</span>
            </div>
            <div className="detail-row">
              <strong>Service:</strong> <span>{selectedType}</span>
            </div>
            <div className="detail-row">
              <strong>Date & Time:</strong> <span>{selectedDate} at {selectedSlot} ({duration} Mins)</span>
            </div>
            <div className="detail-row">
              <strong>Mode:</strong> <span>{meetingMode}</span>
            </div>
            {meetingMode === 'In-Person' && (
              <div className="detail-row">
                <strong>Preferred Branch:</strong>{' '}
                <span>
                  {branches.find(b => b.id === parseInt(preferredBranchId, 10))?.name || 'Selected Branch'}
                </span>
              </div>
            )}
          </div>

          {successData.whatsapp_simulated && (
            <div className="wa-alert-preview">
              <div className="wa-header">
                <MessageSquare size={16} />
                <span>Simulated Booking Confirmation Alert</span>
              </div>
              <p className="wa-message">{successData.whatsapp_simulated.message}</p>
              <span className="wa-badge">Queued via WhatsApp API</span>
            </div>
          )}

          <button className="btn btn-primary" onClick={() => window.location.href = '/'}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="booking-page">
      <SEO 
        title="Book Free Design Consultation - Sarga Printing" 
        description="Book a visual screen-share or phone call consultation with Sarga's expert card designers. Avoid waiting and schedule a convenient slot." 
      />

      <header className="booking-hero container">
        <div className="booking-hero__content text-center">
          <span className="badge-pill"><Sparkles size={14} className="mr-4" /> Live Scheduling Engine</span>
          <h1>Work 1-on-1 With Sarga Designers</h1>
          <p>
            Schedule a free **15 or 30-minute visual design review**. Choose between mobile voice calls, Google Meet screen share,
            or detailed face-to-face material checkups at our branches.
          </p>
        </div>
      </header>

      <section className="container scheduler-section">
        {error && (
          <div className="alert alert--error mb-24">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <div className="scheduler-layout">
          {/* Visual Configurator Columns */}
          <div className="scheduler-config stack-lg">
            
            {/* Step 1: Service Type & Duration */}
            <div className="config-block glass-panel">
              <h3 className="config-title">1. Select Service & Duration</h3>
              
              <div className="duration-selector mb-20">
                <span className="duration-label">Meeting Duration:</span>
                <div className="duration-options">
                  <button 
                    type="button" 
                    className={`duration-btn ${duration === 15 ? 'active' : ''}`}
                    onClick={() => setDuration(15)}
                  >
                    15 Minutes
                  </button>
                  <button 
                    type="button" 
                    className={`duration-btn ${duration === 30 ? 'active' : ''}`}
                    onClick={() => setDuration(30)}
                  >
                    30 Minutes
                  </button>
                </div>
              </div>

              <div className="types-grid">
                {CONSULTATION_TYPES.map(type => (
                  <div 
                    key={type.id} 
                    className={`type-card ${selectedType === type.id ? 'active' : ''}`}
                    onClick={() => setSelectedType(type.id)}
                  >
                    <div className="type-card__indicator">
                      {selectedType === type.id && <Check size={12} />}
                    </div>
                    <div className="type-card__info">
                      <span className="type-card__label">{type.label}</span>
                      <p className="type-card__desc">{type.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Step 2: Communication Mode */}
            <div className="config-block glass-panel">
              <h3 className="config-title">2. Choose Meeting Channel</h3>
              
              <div className="modes-grid">
                {MEETING_MODES.map(mode => {
                  const Icon = mode.icon;
                  return (
                    <div
                      key={mode.id}
                      className={`mode-card ${meetingMode === mode.id ? 'active' : ''}`}
                      onClick={() => setMeetingMode(mode.id)}
                    >
                      <div className="mode-card__icon">
                        <Icon size={20} />
                      </div>
                      <div className="mode-card__info">
                        <span className="mode-card__label">{mode.label}</span>
                        <p className="mode-card__desc">{mode.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {meetingMode === 'In-Person' && (
                <div className="branch-subfield mt-20 reveal revealed">
                  <label className="label" htmlFor="pref-branch">Preferred Branch for Meeting *</label>
                  <select
                    id="pref-branch"
                    className="form-input"
                    value={preferredBranchId}
                    onChange={(e) => setPreferredBranchId(e.target.value)}
                    required
                  >
                    {branches.map(branch => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name} Branch
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Step 3: Calendar Date & Available Time Slots */}
            <div className="config-block glass-panel">
              <h3 className="config-title">3. Pick Date & Available Slot</h3>
              
              <div className="row gap-md items-end mb-20">
                <div className="flex-1">
                  <label className="label" htmlFor="book-date">Select Appointment Date *</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="date"
                      id="book-date"
                      className="form-input"
                      min={todayStr}
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              {selectedDate ? (
                <div className="slots-area">
                  <div className="slots-title mb-12">
                    <Clock size={16} className="mr-8 text-primary" />
                    <span>Available Slots on {selectedDate}:</span>
                  </div>

                  {loadingSlots ? (
                    <div className="slots-loading">
                      <div className="small-spinner"></div>
                      <span>Calculating slot conflicts...</span>
                    </div>
                  ) : availableSlots.length === 0 ? (
                    <div className="slots-empty">
                      <AlertCircle size={16} />
                      <span>No available slots for this date. Try another date.</span>
                    </div>
                  ) : (
                    <div className="slots-grid">
                      {availableSlots.map(slot => (
                        <button
                          key={slot}
                          type="button"
                          className={`slot-btn ${selectedSlot === slot ? 'active' : ''}`}
                          onClick={() => setSelectedSlot(slot)}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="date-prompt">
                  <Calendar size={24} className="mb-8" />
                  <p>Select a date above to display conflict-free visual slots.</p>
                </div>
              )}
            </div>
          </div>

          {/* Customer Confirmation Form Column */}
          <div className="scheduler-sidebar">
            <div className="checkout-card glass-panel">
              <h3>4. Customer Details</h3>
              <form onSubmit={handleSubmit} className="stack-md">
                
                <div>
                  <label className="label" htmlFor="cust-name">Full Name *</label>
                  <input
                    type="text"
                    id="cust-name"
                    className="form-input"
                    placeholder="Your name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="label" htmlFor="cust-phone">WhatsApp Mobile Number *</label>
                  <input
                    type="tel"
                    id="cust-phone"
                    className="form-input"
                    placeholder="Enter phone number"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="label" htmlFor="cust-email">Email Address</label>
                  <input
                    type="email"
                    id="cust-email"
                    className="form-input"
                    placeholder="name@gmail.com"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                  />
                </div>

                <div>
                  <label className="label" htmlFor="cust-notes">Design Brief / Project Notes</label>
                  <textarea
                    id="cust-notes"
                    className="input-field textarea"
                    placeholder="Provide details about your card, branding or layout requirements (e.g. Traditional Hindu Wedding card, metallic gold finish, multi-sheet card, logo ideas)..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>

                {/* Calendar summary receipt badge */}
                <div className="booking-summary-receipt mb-16">
                  <div className="summary-title">Booking Summary</div>
                  <div className="receipt-items">
                    <div className="receipt-item">
                      <span>Service:</span>
                      <strong>{selectedType}</strong>
                    </div>
                    <div className="receipt-item">
                      <span>Duration:</span>
                      <strong>{duration} Minutes</strong>
                    </div>
                    <div className="receipt-item">
                      <span>Channel:</span>
                      <strong>{meetingMode}</strong>
                    </div>
                    {meetingMode === 'In-Person' && (
                      <div className="receipt-item">
                        <span>Store:</span>
                        <strong>{branches.find(b => b.id === parseInt(preferredBranchId, 10))?.name || 'Sarga'}</strong>
                      </div>
                    )}
                    <div className="receipt-item highlight">
                      <span>Schedule:</span>
                      <strong>
                        {selectedDate && selectedSlot ? `${selectedDate} @ ${selectedSlot}` : 'Not Selected'}
                      </strong>
                    </div>
                  </div>
                </div>

                <button 
                  type="submit" 
                  className="btn btn-primary btn--full mt-16"
                  disabled={submitting || !selectedDate || !selectedSlot}
                >
                  {submitting ? 'Confirming Booking...' : (
                    <>
                      <span>Confirm Appointment</span>
                      <ArrowRight size={16} className="ml-8" />
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
