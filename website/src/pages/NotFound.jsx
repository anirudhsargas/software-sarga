import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div style={{ padding: '4rem', textAlign: 'center' }}>
      <h1>404 — Page Not Found</h1>
      <p>The page you are looking for doesn't exist or has been moved.</p>
      <div style={{ marginTop: '1.5rem' }}>
        <Link to="/" className="btn btn-outline">Go to Home</Link>
      </div>
    </div>
  )
}
