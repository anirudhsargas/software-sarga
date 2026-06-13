import React, { useState } from 'react';
import api from '../services/api';
import { Calendar, Save, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

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
      
      // Delay success message then call onSuccess
      setTimeout(() => {
        if (onSuccess) onSuccess();
      }, 1500);
      
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to mark holiday');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="holiday-calendar" style={{ padding: '32px 24px' }}>
      <div className="holiday-calendar__header" style={{ marginBottom: 24, textAlign: 'center' }}>
        <div style={{ 
          background: 'var(--accent)15', 
          color: 'var(--accent)', 
          width: 56, 
          height: 56, 
          borderRadius: 16, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          margin: '0 auto 16px' 
        }}>
          <Calendar size={28} />
        </div>
        <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Mark Holiday</h3>
        <p style={{ fontSize: 14, color: 'var(--muted)', maxWidth: 280, margin: '0 auto' }}>
          Marking a holiday will apply to all staff members for the selected date.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="stack-md">
        <div className="input-group">
          <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Holiday Date
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="input-field"
              style={{ width: '100%' }}
              required
            />
          </div>
        </div>

        <div className="input-group">
          <label className="label">Holiday Reason</label>
          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="input-field"
            style={{ width: '100%' }}
            placeholder="e.g. Diwali, Independence Day"
            required
          />
        </div>

        {error && (
          <div className="alert alert--error" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12 }}>
            <AlertCircle size={18} />
            <span style={{ fontSize: 13 }}>{error}</span>
          </div>
        )}

        {success && (
          <div className="alert alert--success" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12 }}>
            <CheckCircle2 size={18} />
            <span style={{ fontSize: 13 }}>{success}</span>
          </div>
        )}

        <button 
          type="submit" 
          className="btn btn-primary btn--full" 
          disabled={loading}
          style={{ height: 48, fontSize: 15, fontWeight: 600, marginTop: 12 }}
        >
          {loading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <>
              <Save size={18} style={{ marginRight: 8 }} />
              Mark Holiday
            </>
          )}
        </button>
      </form>
    </div>
  );
};

export default HolidayCalendar;
