import { Link } from 'react-router-dom';
import SEOProvider from '../../seo/SEOProvider';
import { ArrowRight } from 'lucide-react';

const products = [
  { name: 'Business Cards', category: 'Stationery', description: 'Premium business cards in matte, glossy, and textured finishes.' },
  { name: 'Brochures', category: 'Marketing', description: 'Tri-fold and bi-fold brochures for promotions and events.' },
  { name: 'Flyers & Posters', category: 'Marketing', description: 'Eye-catching flyers and large-format posters for advertising.' },
  { name: 'Product Packaging', category: 'Packaging', description: 'Custom boxes, cartons, and wrapping for retail products.' },
  { name: 'Labels', category: 'Packaging', description: 'Product labels, barcode stickers, and compliance labels.' },
  { name: 'Booklets', category: 'Publications', description: 'Saddle-stitched and perfect-bound booklets and manuals.' },
  { name: 'Catalogs', category: 'Publications', description: 'Multi-page product catalogs with vivid color printing.' },
  { name: 'Letterheads', category: 'Stationery', description: 'Professional letterheads and compliments slips.' },
  { name: 'Envelopes', category: 'Stationery', description: 'Custom printed envelopes in all standard sizes.' },
  { name: 'Invitation Cards', category: 'Specialty', description: 'Wedding invitations, event cards, and festive greetings.' },
  { name: 'Carry Bags', category: 'Packaging', description: 'Paper carry bags with custom printing and handles.' },
  { name: 'Calendars', category: 'Specialty', description: 'Wall calendars and desk calendars with custom designs.' },
];

export default function ProductsPage() {
  return (
    <SEOProvider routeKey="/products">
      <section className="page-hero">
        <div className="page-hero__inner">
          <h1>Products &amp; Samples</h1>
          <p>
            Explore our full range of printed products. Each item is crafted with care using
            premium materials and modern printing technology.
          </p>
        </div>
      </section>

      <section className="products-section">
        <div className="products-grid">
          {products.map((p) => (
            <article key={p.name} className="product-card">
              <span className="product-card__category">{p.category}</span>
              <h3>{p.name}</h3>
              <p>{p.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="cta-section">
        <div className="cta-section__inner">
          <h2>Looking for Something Specific?</h2>
          <p>We can create custom products tailored to your exact specifications.</p>
          <Link to="/contact" className="btn btn--primary btn--lg">
            Request a Quote <ArrowRight size={18} />
          </Link>
        </div>
      </section>
    </SEOProvider>
  );
}
