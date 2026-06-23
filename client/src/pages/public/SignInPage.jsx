import { Link } from 'react-router-dom';
import SEOProvider from '../../seo/SEOProvider';

export default function SignInPage() {
  return (
    <SEOProvider routeKey="/signin">
      <div className="auth-shell">
        <div className="auth-card">
          <div className="brand">
            <picture>
              <source type="image/avif" srcSet="/icons/icon-48.avif 48w, /icons/icon-96.avif 96w" sizes="72px" />
              <source type="image/webp" srcSet="/icons/icon-48.webp 48w, /icons/icon-96.webp 96w" sizes="72px" />
              <img src="/icons/icon-192.png" alt="Sarga" className="login-logo" width="72" height="72" />
            </picture>
            <h1>SARGA</h1>
            <p>Printing Management System</p>
          </div>

          <div className="mb-20">
            <h2 className="section-title">Sign In</h2>
            <p className="section-subtitle">Access your account to manage orders and track production.</p>
          </div>

          <form action="/login" method="GET" className="stack-lg">
            <div className="field-global">
              <label className="label" htmlFor="signin-id">User ID / Mobile Number</label>
              <input
                id="signin-id"
                type="tel"
                inputMode="numeric"
                className="input-field"
                placeholder="User ID / Mobile Number"
                autoComplete="tel"
                readOnly
                onFocus={(_e) => { window.location.href = '/login'; }}
              />
            </div>
            <button type="button" className="btn btn-primary btn--full" onClick={() => { window.location.href = '/login'; }}>
              Go to Sign In
            </button>
          </form>

          <div className="text-sm muted mt-24 text-center">
            <Link to="/" style={{ color: 'var(--text-muted)' }}>Back to Home</Link>
          </div>
        </div>
      </div>
    </SEOProvider>
  );
}
