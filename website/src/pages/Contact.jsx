import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { MapPin, Phone, Mail, Clock, Send, Loader2, CheckCircle, MessageSquare } from 'lucide-react'
import { submitInquiry } from '../api'
import toast from 'react-hot-toast'
import './Contact.css'

const branches = [
  {
    name: 'Sarga Perambra',
    address: 'Perambra, Kozhikode, Kerala',
    phone: '+91 94951 77283',
    email: 'sargapba@gmail.com',
    hours: 'Mon - Sat: 9:00 AM - 7:00 PM',
    mapUrl: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d15638.163353494793!2d75.74853037213271!3d11.585507851390432!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3ba68fb464a4adfb%3A0xe54e6378e9067ec8!2sPerambra%2C%20Kerala!5e0!3m2!1sen!2sin!4v1716800000000!5m2!1sen!2sin',
  },
  {
    name: 'Sarga Meppayur',
    address: 'Meppayur, Kozhikode, Kerala',
    phone: '+91 91883 31197',
    email: 'sargaoffsetmpr@gmail.com',
    hours: 'Mon - Sat: 9:00 AM - 7:00 PM',
    mapUrl: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d15642.12879590827!2d75.70617307213214!3d11.513511851390506!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3ba685c490ff6603%3A0xb35a09280cdb90a6!2sMeppayur%2C%20Kerala!5e0!3m2!1sen!2sin!4v1716800000000!5m2!1sen!2sin',
  },
]

export default function Contact() {
  const location = useLocation()
  const [formData, setFormData] = useState({
    name: '', phone: '', email: '', service: '', message: '', branch: 'Perambra',
  })
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const product = params.get('product')
    if (product) {
      setFormData((prev) => ({
        ...prev,
        service: 'Other',
        message: `Hello Sarga, I would like to place an order / request an inquiry for: "${product}".\n\nPlease contact me regarding pricing, specifications, and delivery options.\n\nThank you!`,
      }))
    }
  }, [location])

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.name.trim() || !formData.phone.trim() || !formData.message.trim()) {
      toast.error('Please fill in all required fields')
      return
    }
    setLoading(true)
    try {
      await submitInquiry(formData)
      setSubmitted(true)
      toast.success('Inquiry submitted successfully!')
    } catch (err) {
      console.error('Failed to submit inquiry:', err)
      const errMsg = err.response?.data?.message || 'Failed to submit inquiry. Please check your internet connection and try again.'
      toast.error(errMsg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="contact-page">
      <section className="page-header" id="contact-header">
        <div className="page-header__bg" />
        <div className="container page-header__content">
          <span className="badge badge-accent">Get in Touch</span>
          <h1 className="page-header__title">
            Let's Create Something <span className="text-gradient">Amazing Together</span>
          </h1>
          <p className="page-header__subtitle">
            Have a print or binding project? Send us an inquiry or reach out directly on WhatsApp.
          </p>
        </div>
      </section>

      <section className="section" id="contact-content">
        <div className="container">
          <div className="contact-grid">
            <div className="contact-form-wrapper glass-card reveal" id="contact-form-wrapper">
              {submitted ? (
                <div className="contact-success" id="contact-success">
                  <div className="contact-success__icon"><CheckCircle size={48} style={{ color: 'var(--success)' }} /></div>
                  <h3>Thank You!</h3>
                  <p>Your inquiry has been received. We'll get back to you within 24 hours.</p>
                  <button className="btn btn-outline" onClick={() => { setSubmitted(false); setFormData({ name: '', phone: '', email: '', service: '', message: '', branch: 'Perambra' }); }} id="send-another-btn">Send Another Inquiry</button>
                </div>
              ) : (
                <>
                  <h2 className="contact-form__title">Send Us an Inquiry</h2>
                  <p className="contact-form__desc">Fill out the form and we'll get back to you promptly.</p>
                  <form onSubmit={handleSubmit} className="contact-form" id="contact-form">
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label" htmlFor="contact-name">Name *</label>
                        <input type="text" className="input" name="name" id="contact-name" placeholder="Your full name" value={formData.name} onChange={handleChange} required />
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="contact-phone">Phone *</label>
                        <input type="tel" className="input" name="phone" id="contact-phone" placeholder="Your mobile number" value={formData.phone} onChange={handleChange} required />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label" htmlFor="contact-email">Email</label>
                        <input type="email" className="input" name="email" id="contact-email" placeholder="you@example.com" value={formData.email} onChange={handleChange} />
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="contact-branch">Preferred Branch</label>
                        <select className="input" name="branch" id="contact-branch" value={formData.branch} onChange={handleChange}>
                          <option value="Perambra">Perambra</option>
                          <option value="Meppayur">Meppayur</option>
                        </select>
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="contact-service">Service Required</label>
                      <select className="input" name="service" id="contact-service" value={formData.service} onChange={handleChange}>
                        <option value="">Select a service</option>
                        <option value="Offset Printing">Offset & Digital Printing</option>
                        <option value="Photostat">Photostat (Photocopying)</option>
                        <option value="Mementos & Photo Frames">Mementos & Photo Frames</option>
                        <option value="Hard & Spiral Binding">Hard, Spiral & Wire Binding</option>
                        <option value="Seals & Stamps">Rubber Seals & Stamps</option>
                        <option value="ID Cards & Badges">ID Cards & Badges</option>
                        <option value="Design Services">Graphic Design Services</option>
                        <option value="Other">Other Custom Work</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="contact-message">Message *</label>
                      <textarea className="input contact-textarea" name="message" id="contact-message" placeholder="Tell us about your project requirements (quantity, paper size, page count, binding type, etc)..." value={formData.message} onChange={handleChange} rows={5} required />
                    </div>
                    <button type="submit" className="btn btn-primary btn-lg" disabled={loading} id="contact-submit">
                      {loading ? <><Loader2 size={18} className="spinning" /> Sending...</> : <><Send size={18} /> Send Inquiry</>}
                    </button>
                  </form>
                </>
              )}
            </div>

            <div className="contact-branches">
              {branches.map((branch, i) => (
                <div key={i} className={`branch-card glass-card reveal reveal-delay-${i+1}`} id={`branch-${i}`} style={{ overflow: 'hidden', padding: 0 }}>
                  <div style={{ padding: 'var(--space-lg)' }}>
                    <h3 className="branch-card__name" style={{ marginBottom: 'var(--space-sm)' }}>{branch.name}</h3>
                    <ul className="branch-card__info" style={{ marginBottom: 'var(--space-md)' }}>
                      <li><MapPin size={16} /><span>{branch.address}</span></li>
                      <li><Phone size={16} /><a href={`tel:${branch.phone.replace(/\s/g, '')}`}>{branch.phone}</a></li>
                      <li><Mail size={16} /><a href={`mailto:${branch.email}`}>{branch.email}</a></li>
                      <li><Clock size={16} /><span>{branch.hours}</span></li>
                    </ul>
                  </div>
                  {/* Google Maps Iframe Embed */}
                  <div className="branch-card__map" style={{ height: '180px', width: '100%', borderTop: '1px solid var(--glass-border)' }}>
                    <iframe
                      src={branch.mapUrl}
                      width="100%"
                      height="100%"
                      style={{ border: 0 }}
                      allowFullScreen=""
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      title={`${branch.name} Location Map`}
                    ></iframe>
                  </div>
                </div>
              ))}
              <div className="quick-contact glass-card reveal" id="quick-contact">
                <h3>Need immediate support?</h3>
                <p>Chat directly with our manager on WhatsApp for pricing and delivery timelines.</p>
                <a
                  href="https://wa.me/919495177283"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary"
                  style={{ background: '#25D366', borderColor: '#25D366', color: '#fff', width: '100%' }}
                >
                  <MessageSquare size={16} /> Chat on WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
