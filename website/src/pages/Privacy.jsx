export default function Privacy() {
  return (
    <div className="page-enter">
      <section className="page-header">
        <div className="page-header__bg" />
        <div className="container page-header__content">
          <span className="badge badge--primary">Legal</span>
          <h1 className="page-header__title">Privacy Policy</h1>
          <p className="page-header__subtitle">
            How Sarga Prints collects, uses, and protects your personal information.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container" style={{ maxWidth: '760px' }}>
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.75rem' }}>Information We Collect</h2>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.8, fontSize: '0.95rem' }}>
                When you use our services or submit an inquiry, we may collect your name, phone number, email address, and details about your printing requirements. This information is collected solely to process your orders and provide customer support.
              </p>
            </div>
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.75rem' }}>How We Use Your Data</h2>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.8, fontSize: '0.95rem' }}>
                Your information is used to process orders, send status updates, provide quotes, and improve our services. We do not sell or share your personal data with third parties for marketing purposes.
              </p>
            </div>
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.75rem' }}>Data Security</h2>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.8, fontSize: '0.95rem' }}>
                We implement industry-standard security measures to protect your information. All data transmitted through our website is encrypted. We retain your information only for as long as necessary to fulfill the purposes outlined in this policy.
              </p>
            </div>
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.75rem' }}>Contact Us</h2>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.8, fontSize: '0.95rem' }}>
                For questions about this privacy policy, contact us at <a href="mailto:sargapba@gmail.com" style={{ color: 'var(--accent)', fontWeight: 600 }}>sargapba@gmail.com</a> or call <a href="tel:+919495177283" style={{ color: 'var(--accent)', fontWeight: 600 }}>+91 94951 77283</a>.
              </p>
            </div>
            <p style={{ color: 'var(--text-disabled)', fontSize: '0.8rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1.5rem' }}>
              Last updated: May 2026. Sarga Prints, Perambra & Meppayur, Kozhikode, Kerala.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
