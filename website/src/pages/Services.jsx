import { Link } from 'react-router-dom'
import {
  Printer,
  Zap,
  Palette,
  Layers,
  BookOpen,
  FileText,
  Gift,
  ShoppingBag,
  CreditCard,
  Stamp,
  Scissors,
  ImageIcon,
  ArrowRight,
  Sparkles,
  ClipboardList,
  Fingerprint,
} from 'lucide-react'
import './Services.css'
import { useCart } from '../context/CartContext'

const mainServices = [
  {
    icon: <Printer size={32} />,
    title: 'Offset & Digital Printing',
    desc: 'Professional high-volume offset runs and quick-turnaround digital prints. Perfect for books, magazines, brochures, leaflets, and letterheads.',
    features: ['Books & Magazines', 'Brochures & Flyers', 'Letterheads & Envelopes', 'Menu Cards & Calendars'],
    price: 'Starting from ₹0.80 / page',
    color: '#1f2a33',
  },
  {
    icon: <FileText size={32} />,
    title: 'Photostat & Document Services',
    desc: 'High-speed high-quality photocopying (photostat) services in black & white and full color. Bulk discounts available for schools, colleges, and offices.',
    features: ['A4 & A3 Photocopying', 'Color Photostat', 'Document Scanning', 'Bulk Printing Runs'],
    price: 'Starting from ₹1.00 / copy',
    color: '#2f3b46',
  },
  {
    icon: <Palette size={32} />,
    title: 'Mementos & Photo Frames',
    desc: 'Premium custom-made mementos, appreciation plaques, shields, trophy engraving, and custom photo framing for achievements, events, and memories.',
    features: ['Wooden & Acrylic Mementos', 'Custom Photo Framing', 'Plaques & Certificates', 'Appreciation Shields'],
    price: 'Starting from ₹150 / unit',
    color: '#1f2a33',
  },
  {
    icon: <Layers size={32} />,
    title: 'Finishing & Premium Binding',
    desc: 'Give your books, theses, projects, or documents a premium finish. Professional binding options matching university and industry standards.',
    features: ['Academic Hard Binding', 'Spiral Binding', 'Wire-O Binding', 'Matte & Gloss Lamination'],
    price: 'Starting from ₹15 / book',
    color: '#2f3b46',
  },
]

const additionalServices = [
  { icon: <Fingerprint size={22} />, title: 'ID Cards & Badges', price: '₹25 / card onwards', color: '#1f2a33' },
  { icon: <Stamp size={22} />, title: 'Pre-inked Rubber Seals & Stamps', price: '₹90 / seal onwards', color: '#2f3b46' },
  { icon: <BookOpen size={22} />, title: 'Notebooks & Registers', price: 'Custom Quote', color: '#1f2a33' },
  { icon: <FileText size={22} />, title: 'Invoice & Receipt Books', price: '₹80 / book onwards', color: '#2f3b46' },
  { icon: <Gift size={22} />, title: 'Wedding & Invitation Cards', price: '₹10 / card onwards', color: '#1f2a33' },
  { icon: <ShoppingBag size={22} />, title: 'Paper & Carry Bags', price: '₹5 / bag onwards', color: '#2f3b46' },
  { icon: <Scissors size={22} />, title: 'Stickers & Product Labels', price: '₹2 / label onwards', color: '#1f2a33' },
  { icon: <ImageIcon size={22} />, title: 'Large Format Photo Printing', price: '₹60 / print onwards', color: '#2f3b46' },
]

export default function Services() {
  const { addItem, openCart } = useCart()

  return (
    <div className="services-page">
      {/* Header */}
      <section className="page-header" id="services-header">
        <div className="page-header__bg" />
        <div className="container page-header__content">
          <span className="badge badge-primary">Sarga Service Suite</span>
          <h1 className="page-header__title">
            Professional Printing, <span className="text-gradient">Crafted Since 1994</span>
          </h1>
          <p className="page-header__subtitle">
            Explore our comprehensive suite of offset, digital, and custom finishing services built on 30 years of Kerala-wide trust.
          </p>
        </div>
      </section>

      {/* Main Services */}
      <section className="section" id="main-services">
        <div className="container">
          <div className="main-services-grid">
            {mainServices.map((service, i) => (
              <div key={i} className="main-service-card glass-card" id={`main-service-${i}`}>
                <div
                  className="main-service-card__icon"
                  style={{ background: `${service.color}12`, color: service.color }}
                >
                  {service.icon}
                </div>
                <h3 className="main-service-card__title">{service.title}</h3>
                <p className="main-service-card__desc">{service.desc}</p>
                
                <ul className="main-service-card__features">
                  {service.features.map((f, j) => (
                    <li key={j}>
                      <span className="main-service-card__dot" style={{ background: service.color }} />
                      {f}
                    </li>
                  ))}
                </ul>

                <div className="main-service-card__pricing-wrap" style={{ marginTop: 'auto', paddingTop: 'var(--space-md)', borderTop: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{service.price}</span>
                    <Link to="/contact" style={{ fontSize: '0.85rem', color: 'var(--accent)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      Get Custom Quote <ArrowRight size={14} />
                    </Link>
                  </div>
                  <button 
                    onClick={() => { addItem({ service: service.title, quantity: 1 }); openCart(); }}
                    className="btn btn-outline btn-sm"
                    style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 12px' }}
                  >
                    Add to Quote Cart
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Additional Services */}
      <section className="section" id="additional-services">
        <div className="container">
          <h2 className="section-title">More Products & Services</h2>
          <p className="section-subtitle">
            From university hard-binding to institutional identity badges and custom pre-inked stamps.
          </p>

          <div className="additional-grid">
            {additionalServices.map((service, i) => (
              <div key={i} className="additional-card" id={`additional-service-${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-md)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                  <div
                    className="additional-card__icon"
                    style={{ background: `${service.color}12`, color: service.color }}
                  >
                    {service.icon}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span className="additional-card__title">{service.title}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>{service.price}</span>
                  </div>
                </div>
                <button
                  onClick={() => { addItem({ service: service.title, quantity: 1 }); openCart(); }}
                  className="btn btn-outline btn-sm"
                  style={{ padding: '4px 8px', fontSize: '0.75rem', borderRadius: '4px', whiteSpace: 'nowrap' }}
                >
                  + Add
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section" id="services-cta">
        <div className="container">
          <div className="services-cta-card glass-card">
            <h2>Need a custom bulk project quote?</h2>
            <p>We offer customized commercial pricing for schools, universities, offices, and large organizations.</p>
            <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link to="/contact" className="btn btn-primary btn-lg" id="services-cta-btn">
                Request Custom Quote <ArrowRight size={18} />
              </Link>
              <a
                href="https://wa.me/919495177283"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline btn-lg"
                style={{ background: '#25D366', color: '#fff', borderColor: '#25D366' }}
              >
                Chat on WhatsApp
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
