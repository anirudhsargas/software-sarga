import React, { useState } from 'react';
import api from '../services/api';


const HolidayCalendar = ({ onSuccess }) => {
  const [selectedDate, setSelectedDate] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!selectedDate || !reason) {
      setError('Please select a date and enter a reason.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/staff/mark-holiday', {
        date: selectedDate,
        reason,
      });
      setSuccess('Holiday marked successfully!');
      setSelectedDate('');
      setReason('');
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to mark holiday');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: 'var(--surface-2, #1c1f20)', borderRadius: 16, border: '1px solid var(--border)', padding: 24, minWidth: 320 }}>
      <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)', marginBottom: 16 }}>Mark Holiday</h3>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontWeight: 600, fontSize: 13, color: 'var(--muted)' }}>Date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="employee-detail__input"
            style={{ width: '100%', marginTop: 6 }}
            required
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontWeight: 600, fontSize: 13, color: 'var(--muted)' }}>Reason</label>
          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="employee-detail__input"
            style={{ width: '100%', marginTop: 6, paddingLeft: 10 }}
            placeholder="e.g. Festival, National Holiday"
            required
          />
        </div>
        {error && <div style={{ color: 'var(--error)', margin: '8px 0', fontSize: 13 }}>{error}</div>}
        {success && <div style={{ color: 'var(--success)', margin: '8px 0', fontSize: 13 }}>{success}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
          <button type="submit" className="employee-detail__btn is-primary" style={{ minWidth: 120 }} disabled={loading}>
            {loading ? 'Saving...' : 'Mark Holiday'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default HolidayCalendar;
