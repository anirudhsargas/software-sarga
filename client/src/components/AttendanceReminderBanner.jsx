import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, CheckCircle2, X, ChevronRight, LogOut, UserCheck } from 'lucide-react';
import api from '../services/api';
import useAuth from '../hooks/useAuth';
import './AttendanceReminderBanner.css';

export default function AttendanceReminderBanner() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [reminder, setReminder] = useState(null);
  const [snoozedUntilHour, setSnoozedUntilHour] = useState(null);
  const [dismissedDateType, setDismissedDateType] = useState(null);

  const fetchReminder = useCallback(async () => {
    if (!user) return;
    const permittedRoles = ['Front Office', 'front office', 'Admin', 'admin', 'Accountant'];
    if (!permittedRoles.includes(user.role)) return;

    try {
      const res = await api.get('/front-office/attendance-reminder');
      const data = res.data;
      setReminder(data || null);

      // Web Desktop Notification trigger
      if (data && data.should_remind) {
        const currentHour = new Date().getHours();
        const notificationKey = `att_notif_${data.attendance_date}_${data.reminder_type}_${currentHour}`;
        
        if (!localStorage.getItem(notificationKey)) {
          if ('Notification' in window && Notification.permission === 'granted') {
            const title = data.reminder_type === 'morning_attendance'
              ? '⏰ Sarga ERP - Morning Attendance Pending!'
              : '🌆 Sarga ERP - Evening Mark-Gone Pending!';
            const body = data.reminder_type === 'morning_attendance'
              ? `Attendance is not marked for ${data.missing_count} staff member(s) today.`
              : `Exit time (Mark Gone) is not recorded for ${data.missing_gone_count} staff member(s) today.`;

            new Notification(title, {
              body,
              icon: '/favicon.ico',
              tag: notificationKey
            });
            localStorage.setItem(notificationKey, 'true');
          } else if ('Notification' in window && Notification.permission !== 'denied') {
            Notification.requestPermission();
          }
        }
      }
    } catch (err) {
      void err;
    }
  }, [user]);

  useEffect(() => {
    fetchReminder();
    const interval = setInterval(fetchReminder, 60 * 1000); // Poll every minute
    return () => clearInterval(interval);
  }, [fetchReminder]);

  if (!reminder || !reminder.should_remind) return null;

  const currentHour = new Date().getHours();
  if (snoozedUntilHour !== null && currentHour < snoozedUntilHour) {
    return null;
  }

  const isMorning = reminder.reminder_type === 'morning_attendance';
  const isEvening = reminder.reminder_type === 'evening_mark_gone';

  const handleSnoozeOneHour = () => {
    setSnoozedUntilHour(currentHour + 1);
  };

  const handleActionClick = () => {
    if (location.pathname.includes('/daily-report')) {
      // scroll to attendance / machine section if already on page
      const el = document.getElementById('staff-attendance-section') || document.querySelector('.panel-title');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    } else {
      navigate('/dashboard/daily-report');
    }
  };

  return (
    <div className={`attendance-reminder-banner ${isMorning ? 'banner--morning' : 'banner--evening'}`} role="alert">
      <div className="attendance-reminder-banner__content">
        <div className="attendance-reminder-banner__icon">
          {isMorning ? <Clock size={20} className="animate-pulse" /> : <LogOut size={20} className="animate-pulse" />}
        </div>
        <div className="attendance-reminder-banner__text">
          <div className="attendance-reminder-banner__title">
            {isMorning ? (
              <>⏰ Morning Attendance Alert <span className="time-badge">9 AM - 11 AM</span></>
            ) : (
              <>🌆 Evening Mark-Gone Alert <span className="time-badge">6 PM - 7 PM</span></>
            )}
          </div>
          <div className="attendance-reminder-banner__desc">
            {isMorning ? (
              <>Attendance is not marked for <strong>{reminder.missing_count}</strong> staff member(s) today.</>
            ) : (
              <>Exit time (Mark-Gone) is not recorded for <strong>{reminder.missing_gone_count}</strong> staff member(s) today.</>
            )}
          </div>
        </div>
      </div>

      <div className="attendance-reminder-banner__actions">
        <button className="btn btn-primary btn-sm attendance-action-btn" onClick={handleActionClick}>
          {isMorning ? <UserCheck size={14} /> : <LogOut size={14} />}
          {isMorning ? 'Mark Attendance Now' : 'Mark Gone Now'}
        </button>
        <button className="btn btn-ghost btn-sm snooze-btn" onClick={handleSnoozeOneHour} title="Remind at next hour mark">
          Remind Later (1hr)
        </button>
      </div>
    </div>
  );
}
