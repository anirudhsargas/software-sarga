import { Link } from 'react-router-dom'
import { ArrowLeft, Home } from 'lucide-react'

export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: '2rem',
      background: 'var(--bg)',
    }}>
      <div style={{ maxWidth: '480px' }}>
        <div style={{
          fontSize: 'clamp(6rem, 15vw, 10rem)',
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          lineHeight: 1,
          letterSpacing: '-0.04em',
          background: 'linear-gradient(135deg, var(--accent) 0%, #B22222 50%, var(--text-disabled) 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          marginBottom: '1rem',
        }}>404</div>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.5rem',
          fontWeight: 700,
          color: 'var(--text)',
          marginBottom: '0.75rem',
          letterSpacing: '-0.02em',
        }}>Page Not Found</h1>
        <p style={{
          color: 'var(--text-muted)',
          fontSize: '1rem',
          lineHeight: 1.7,
          marginBottom: '2rem',
        }}>The page you're looking for doesn't exist or has been moved. Let's get you back on track.</p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/" className="btn btn-primary" style={{ gap: '6px' }}>
            <Home size={16} /> Back to Home
          </Link>
          <Link to="/contact" className="btn btn-outline" style={{ gap: '6px' }}>
            Contact Us
          </Link>
        </div>
      </div>
    </div>
  )
}
