export default function Terms() {
  return (
    <div className="page-enter">
      <section className="page-header">
        <div className="page-header__bg" />
        <div className="container page-header__content">
          <span className="badge badge-primary">Legal</span>
          <h1 className="page-header__title">Terms of Service</h1>
          <p className="page-header__subtitle">
            Terms and conditions governing the use of Sarga Prints services.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container" style={{ maxWidth: '760px' }}>
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.75rem' }}>Service Agreement</h2>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.8, fontSize: '0.95rem' }}>
                By placing an order with Sarga Prints, you agree to these terms. We provide printing, binding, design, and related services from our branches in Perambra and Meppayur, Kozhikode. All orders are subject to availability and our production capacity.
              </p>
            </div>
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.75rem' }}>Orders & Payment</h2>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.8, fontSize: '0.95rem' }}>
                Prices are quoted based on specifications provided. Final pricing may vary based on material choices, finishing options, and quantity changes. Payment terms are discussed at the time of order confirmation. Advance payment may be required for large or custom orders.
              </p>
            </div>
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.75rem' }}>Delivery & Turnaround</h2>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.8, fontSize: '0.95rem' }}>
                Estimated delivery times are provided at order placement. While we strive to meet all deadlines, delivery times may be affected by order complexity, material availability, and production volume. We will notify you of any significant delays.
              </p>
            </div>
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.75rem' }}>Quality Guarantee</h2>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.8, fontSize: '0.95rem' }}>
                We stand behind the quality of our work. If you are unsatisfied with the print quality, please contact us within 48 hours of receiving your order. We will review and resolve any legitimate quality concerns promptly.
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
