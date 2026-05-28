import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Printer,
  Palette,
  Layers,
  Zap,
  Star,
  Shield,
  Clock,
  Users,
  ChevronRight,
  Sparkles,
  Package,
  Search,
  MessageSquare,
  BookOpen,
  FileText,
  BadgeAlert,
} from 'lucide-react'
import { getStats } from '../api'
import './Home.css'
import useHead from '../utils/useHead'

const services = [
  {
    icon: <Printer size={28} />,
    title: 'Offset & Digital Printing',
    desc: 'High-volume professional offset runs and lightning-fast digital prints perfect for books, brochures, flyers, and business cards.',
    color: '#1f2a33',
  },
  {
    icon: <FileText size={28} />,
    title: 'Photostat & ID Cards',
    desc: 'High-speed photocopy/photostat services, identity cards, badges, and certificates for schools and institutions.',
    color: '#2f3b46',
  },
  {
    icon: <Palette size={28} />,
    title: 'Mementos & Photo Frames',
    desc: 'Custom mementos, corporate gifts, premium photo framing, and branding services custom-built to honor achievement.',
    color: '#1f2a33',
  },
  {
    icon: <Layers size={28} />,
    title: 'Hard & Spiral Binding',
    desc: 'Expert hard binding, wire binding, spiral binding, and premium rubber seals/stamps for all office and academic requirements.',
    color: '#2f3b46',
  },
]

const features = [
  { icon: <Star size={20} />, title: 'Premium Quality', desc: 'Industry-leading print quality with state-of-the-art machinery' },
  { icon: <Clock size={20} />, title: 'Fast Delivery', desc: 'Quick turnaround times with real-time order tracking' },
  { icon: <Shield size={20} />, title: '30 Years Trust', desc: 'Serving Kerala with printing excellence since 1994' },
  { icon: <Users size={20} />, title: 'Expert Team', desc: 'Skilled professionals dedicated to bringing your vision to life' },
]

export default function Home() {
  const [jobsCount, setJobsCount] = useState('30K+')

  useHead({ title: 'Sarga — Print & Design | Home', description: "Sarga - premium printing, binding and design services in Kerala. Get quotes, track orders and upload files for print.", ogImage: '/og-image.svg' })

  useEffect(() => {
    async function loadStats() {
      try {
        const { data } = await getStats()
        if (data && data.jobsCompleted) {
          // Format count to display as "32,450+"
          setJobsCount(Number(data.jobsCompleted).toLocaleString('en-IN') + '+')
        }
      } catch (err) {
        console.error('Failed to load stats:', err)
      }
    }
    loadStats()
  }, [])

  return (
    <div className="home">
      {/* Hero Section */}
      <section className="hero" id="hero">
        <div className="hero__bg">
          <div className="hero__orb hero__orb--1" />
          <div className="hero__orb hero__orb--2" />
          <div className="hero__orb hero__orb--3" />
          <div className="hero__grid-pattern" />
        </div>

        <div className="container hero__content">
          <div className="hero__badge animate-in">
            <Sparkles size={14} />
            <span>Serving Kerala Since 1994</span>
          </div>

          <h1 className="hero__title animate-in animate-delay-1">
            Bring Your Ideas to
            <span className="hero__title-accent"> Life in Print</span>
          </h1>

          <p className="hero__subtitle animate-in animate-delay-2">
            From high-speed photostat to digital and offset printing, Sarga delivers exceptional quality. Two locations, 30+ years of trust.
          </p>

          <div className="hero__actions animate-in animate-delay-3">
            <Link to="/contact" className="btn btn-primary btn-lg" id="hero-get-quote">
              Get a Free Quote
              <ArrowRight size={18} />
            </Link>
            <Link to="/track" className="btn btn-outline btn-lg" id="hero-track-order">
              <Search size={18} />
              Track Your Order
            </Link>
          </div>

          <div className="hero__stats animate-in animate-delay-4">
            <div className="hero__stat">
              <span className="hero__stat-value">{jobsCount}</span>
              <span className="hero__stat-label">Jobs Completed</span>
            </div>
            <div className="hero__stat">
              <span className="hero__stat-value">2</span>
              <span className="hero__stat-label">Locations (Perambra & Meppayur)</span>
            </div>
            <div className="hero__stat">
              <span className="hero__stat-value">30+</span>
              <span className="hero__stat-label">Years Legacy</span>
            </div>
            <div className="hero__stat">
              <span className="hero__stat-value">99%</span>
              <span className="hero__stat-label">Satisfaction</span>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="section" id="services-section">
        <div className="container">
          <h2 className="section-title">What We Offer</h2>
          <p className="section-subtitle">
            Comprehensive printing, photocopying, binding, and branding solutions tailored to meet your exact specifications.
          </p>

          <div className="services-grid">
            {services.map((service, i) => (
              <div key={i} className="service-card glass-card" id={`service-${i}`}>
                <div
                  className="service-card__icon"
                  style={{ background: `${service.color}15`, color: service.color }}
                >
                  {service.icon}
                </div>
                <h3 className="service-card__title">{service.title}</h3>
                <p className="service-card__desc">{service.desc}</p>
                <Link to="/services" className="service-card__link">
                  Learn more <ChevronRight size={16} />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Sarga Section */}
      <section className="section why-section" id="why-section">
        <div className="container">
          <div className="why-section__content">
            <div className="why-section__text">
              <span className="badge badge-primary">Why Choose Sarga</span>
              <h2 className="why-section__title">
                Trusted by thousands across Kerala
              </h2>
              <p className="why-section__desc">
                With branches in Perambra and Meppayur, we combine 30 years of traditional craftsmanship with cutting-edge technology.
              </p>

              <div className="features-list">
                {features.map((feature, i) => (
                  <div key={i} className="feature-item" id={`feature-${i}`}>
                    <div className="feature-item__icon">{feature.icon}</div>
                    <div>
                      <h4 className="feature-item__title">{feature.title}</h4>
                      <p className="feature-item__desc">{feature.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="why-section__visual">
              <div className="visual-card">
                <div className="visual-card__inner">
                  <Package size={48} strokeWidth={1.5} />
                  <h3>Ready to Print?</h3>
                  <p>Upload your design, copy documents, or custom craft photo frames and mementos with our team.</p>
                  <Link to="/contact" className="btn btn-primary">
                    Start Your Project <ArrowRight size={16} />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section" id="cta-section">
        <div className="cta-section__bg" />
        <div className="container cta-section__content">
          <h2 className="cta-section__title">Ready to bring your ideas to life?</h2>
          <p className="cta-section__desc">
            Get in touch today for a free consultation and quote. Chat directly via WhatsApp or fill our inquiry form.
          </p>
          <div className="cta-section__actions">
            <a
              href="https://wa.me/919495177283"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary btn-lg"
              id="cta-whatsapp"
              style={{ background: '#25D366', borderColor: '#25D366' }}
            >
              <MessageSquare size={18} />
              Chat on WhatsApp
            </a>
            <Link to="/contact" className="btn btn-outline btn-lg" id="cta-get-quote">
              Fill Inquiry Form
            </Link>
          </div>
        </div>
      </section>

      {/* Floating WhatsApp Button */}
      <a
        href="https://wa.me/919495177283"
        className="whatsapp-float"
        target="_blank"
        rel="noopener noreferrer"
        title="Chat with us"
      >
        <span className="whatsapp-float__text">Chat with us</span>
        <div className="whatsapp-float__icon">
          <MessageSquare size={24} />
        </div>
      </a>
    </div>
  )
}
