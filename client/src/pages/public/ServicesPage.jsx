import { Link } from 'react-router-dom';
import SEOProvider from '../../seo/SEOProvider';
import { Printer, BookOpen, Tags, Boxes, CreditCard, Layers } from 'lucide-react';

const services = [
  {
    icon: Printer,
    title: 'Offset Printing',
    description:
      'High-volume offset printing for brochures, flyers, posters, and marketing materials with consistent quality and vibrant colors.',
  },
  {
    icon: Layers,
    title: 'Digital Printing',
    description:
      'Short-run digital printing for business cards, letterheads, envelopes, and quick-turnaround projects.',
  },
  {
    icon: Boxes,
    title: 'Packaging',
    description:
      'Custom packaging solutions including corrugated boxes, folding cartons, and specialty packaging for all industries.',
  },
  {
    icon: Tags,
    title: 'Labels & Stickers',
    description:
      'Printed labels, stickers, and decals in various materials and finishes for product branding and compliance.',
  },
  {
    icon: BookOpen,
    title: 'Booklets & Catalogs',
    description:
      'Multi-page booklets, product catalogs, and manuals with professional binding and finishing options.',
  },
  {
    icon: CreditCard,
    title: 'Business Stationery',
    description:
      'Business cards, letterheads, envelopes, and compliment slips printed with precision and care.',
  },
];

export default function ServicesPage() {
  return (
    <SEOProvider routeKey="/services">
      <section className="page-hero">
        <div className="page-hero__inner">
          <h1>Our Services</h1>
          <p>
            Comprehensive printing solutions from concept to delivery. We combine traditional
            craftsmanship with modern technology.
          </p>
        </div>
      </section>

      <section className="services-section">
        <div className="services-grid">
          {services.map((s) => (
            <div key={s.title} className="service-card">
              <div className="service-card__icon">
                <s.icon size={28} />
              </div>
              <h3>{s.title}</h3>
              <p>{s.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="cta-section">
        <div className="cta-section__inner">
          <h2>Need a Custom Solution?</h2>
          <p>We handle projects of all sizes. Tell us what you need.</p>
          <Link to="/contact" className="btn btn--primary btn--lg">
            Get in Touch
          </Link>
        </div>
      </section>
    </SEOProvider>
  );
}
