import { useState } from 'react';
import SEOProvider from '../../seo/SEOProvider';
import { Phone, Mail, MapPin, Send, Loader2 } from 'lucide-react';

export default function ContactPage() {
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', message: '' });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
    }, 1000);
  };

  return (
    <SEOProvider routeKey="/contact">
      <section className="page-hero">
        <div className="page-hero__inner">
          <h1>Contact Us</h1>
          <p>Have a question or need a quote? We would love to hear from you.</p>
        </div>
      </section>

      <section className="contact-section">
        <div className="contact-grid">
          <div className="contact-info">
            <h2>Get in Touch</h2>
            <div className="contact-info__list">
              <div className="contact-info__item">
                <Phone size={20} />
                <div>
                  <strong>Phone</strong>
                  <p>Call us for immediate assistance</p>
                </div>
              </div>
              <div className="contact-info__item">
                <Mail size={20} />
                <div>
                  <strong>Email</strong>
                  <p>Send us your inquiries anytime</p>
                </div>
              </div>
              <div className="contact-info__item">
                <MapPin size={20} />
                <div>
                  <strong>Visit Us</strong>
                  <p>Sarga Offset Printing, India</p>
                </div>
              </div>
            </div>
          </div>

          <div className="contact-form-wrapper">
            {submitted ? (
              <div className="contact-success" role="status">
                <h3>Message Sent!</h3>
                <p>Thank you for reaching out. We will get back to you within 24 hours.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="contact-form">
                <div className="field-global">
                  <label className="label" htmlFor="contact-name">
                    Full Name <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id="contact-name"
                    name="name"
                    type="text"
                    className="input-field"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    autoComplete="name"
                  />
                </div>
                <div className="field-global">
                  <label className="label" htmlFor="contact-email">
                    Email <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id="contact-email"
                    name="email"
                    type="email"
                    className="input-field"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    autoComplete="email"
                  />
                </div>
                <div className="field-global">
                  <label className="label" htmlFor="contact-phone">
                    Phone
                  </label>
                  <input
                    id="contact-phone"
                    name="phone"
                    type="tel"
                    className="input-field"
                    value={formData.phone}
                    onChange={handleChange}
                    autoComplete="tel"
                  />
                </div>
                <div className="field-global">
                  <label className="label" htmlFor="contact-message">
                    Message <span aria-hidden="true">*</span>
                  </label>
                  <textarea
                    id="contact-message"
                    name="message"
                    className="input-field"
                    rows={5}
                    value={formData.message}
                    onChange={handleChange}
                    required
                  />
                </div>
                <button type="submit" className="btn btn--primary btn--full" disabled={loading}>
                  {loading ? (
                    <span className="row gap-sm">
                      <Loader2 className="animate-spin" size={18} /> Sending...
                    </span>
                  ) : (
                    <span className="row gap-sm">
                      <Send size={18} /> Send Message
                    </span>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </SEOProvider>
  );
}
