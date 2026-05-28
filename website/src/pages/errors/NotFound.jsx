import React from 'react'
import { Link } from 'react-router-dom'
import { Printer } from 'lucide-react'

export default function NotFound() {
  const style = {
    container: {
      minHeight: '70vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '1.25rem',
      color: 'var(--text-primary)'
    },
    code: {
      fontSize: '6rem',
      color: 'var(--text-muted)',
      opacity: 0.12,
      fontWeight: 800,
      margin: 0,
    },
    iconWrap: {
      background: 'var(--glass-bg)',
      borderRadius: '12px',
      padding: '1rem',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: 'var(--glass-shadow)'
    },
    actions: { display: 'flex', gap: '0.75rem', marginTop: '0.5rem' },
    small: { marginTop: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.95rem' }
  }

  return (
    <div style={style.container}>
      <div style={style.iconWrap} aria-hidden>
        <Printer size={36} />
      </div>
      <h1 style={style.code}>404</h1>
      <h2 style={{ margin: 0 }}>Page Not Found</h2>
      <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Looks like this page didn't make it to print.</p>

      <div style={style.actions}>
        <Link to="/" className="btn btn-outline">Go Home</Link>
        <Link to="/contact" className="btn btn-primary">Contact Us</Link>
      </div>

      <div style={style.small}>
        <Link to="/track">Track your order →</Link>
      </div>
    </div>
  )
}
