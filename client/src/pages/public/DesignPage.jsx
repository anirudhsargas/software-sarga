import { Link } from 'react-router-dom';
import SEOProvider from '../../seo/SEOProvider';
import { Palette, PenTool, Layout, FileImage } from 'lucide-react';

const capabilities = [
  {
    icon: PenTool,
    title: 'Logo Design',
    description: 'Create a memorable brand identity with custom logo design and guidelines.',
  },
  {
    icon: Layout,
    title: 'Packaging Layout',
    description: 'Print-ready packaging dielines and layouts optimized for your production needs.',
  },
  {
    icon: FileImage,
    title: 'Brochure Design',
    description: 'Professional brochure and flyer designs that communicate your message effectively.',
  },
  {
    icon: Palette,
    title: 'Brand Identity',
    description: 'Complete brand identity packages including color palettes, typography, and style guides.',
  },
];

export default function DesignPage() {
  return (
    <SEOProvider routeKey="/design">
      <section className="page-hero">
        <div className="page-hero__inner">
          <h1>Design Studio</h1>
          <p>
            Our in-house design team brings your ideas to life. From concept sketches to
            print-ready files, we handle every step.
          </p>
        </div>
      </section>

      <section className="design-section">
        <div className="design-grid">
          {capabilities.map((c) => (
            <div key={c.title} className="design-card">
              <div className="design-card__icon">
                <c.icon size={28} />
              </div>
              <h3>{c.title}</h3>
              <p>{c.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="design-process">
        <div className="design-process__inner">
          <h2>Our Design Process</h2>
          <ol className="process-steps">
            <li>
              <strong>Consultation:</strong> Share your ideas, goals, and references with our design team.
            </li>
            <li>
              <strong>Concept:</strong> We create initial concepts and mockups for your review.
            </li>
            <li>
              <strong>Revision:</strong> Refine the design based on your feedback until it is perfect.
            </li>
            <li>
              <strong>Print-Ready:</strong> We deliver final print-ready files or send directly to production.
            </li>
          </ol>
        </div>
      </section>

      <section className="cta-section">
        <div className="cta-section__inner">
          <h2>Start Your Design Project</h2>
          <p>Tell us about your project and we will get back to you within 24 hours.</p>
          <Link to="/contact" className="btn btn--primary btn--lg">
            Get Started
          </Link>
        </div>
      </section>
    </SEOProvider>
  );
}
