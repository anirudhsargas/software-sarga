import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import SEOProvider from '../../seo/SEOProvider';
import { Printer, Package, Palette, Truck, Phone, ArrowRight } from 'lucide-react';

function HeroCanvas() {
  const canvasRef = useCallback((canvas) => {
    if (!canvas) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      canvas.style.display = 'none';
      return;
    }

    let ctx;
    try {
      ctx = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    } catch {
      canvas.style.display = 'none';
      return;
    }

    if (!ctx) {
      canvas.style.display = 'none';
      return;
    }

    let animId;
    let particles = [];
    const count = 40;

    const resize = () => {
      canvas.width = canvas.offsetWidth * (window.devicePixelRatio || 1);
      canvas.height = canvas.offsetHeight * (window.devicePixelRatio || 1);
      ctx.viewport(0, 0, canvas.width, canvas.height);
    };

    const init = () => {
      particles = [];
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          r: Math.random() * 2 + 0.5,
          dx: (Math.random() - 0.5) * 0.5,
          dy: (Math.random() - 0.5) * 0.5,
          o: Math.random() * 0.3 + 0.1,
        });
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${p.o})`;
        ctx.fill();
        p.x += p.dx;
        p.y += p.dy;
        if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
      });
      animId = requestAnimationFrame(draw);
    };

    resize();
    init();
    draw();
    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="hero-canvas"
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        opacity: 0.4,
      }}
    />
  );
}

function HeroFallback() {
  return (
    <img
      src="/images/hero-printing.jpg"
      alt="Sarga Offset Printing — high-quality offset printing and packaging solutions"
      className="hero-fallback-img"
      width="1200"
      height="630"
      loading="eager"
      fetchPriority="high"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        opacity: 0.15,
        pointerEvents: 'none',
      }}
    />
  );
}

export default function HomePage() {
  const [hasWebGL, setHasWebGL] = useState(true);

  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      setHasWebGL(!!gl);
    } catch {
      setHasWebGL(false);
    }
  }, []);

  return (
    <SEOProvider routeKey="/">
      <section className="hero-section" style={{ position: 'relative', overflow: 'hidden' }}>
        {hasWebGL ? <HeroCanvas /> : <HeroFallback />}
        <div className="hero-section__inner" style={{ position: 'relative', zIndex: 1 }}>
          <h1 className="hero-heading">
            <span className="hero-heading__line">Print </span>
            <span className="hero-heading__line">Beyond </span>
            <span className="hero-heading__line">the </span>
            <span className="hero-heading__line">Ordinary</span>
          </h1>
          <p className="hero-sub">
            Premium offset printing, packaging, and branding solutions crafted with precision.
            From business cards to large-format packaging, we bring your vision to life.
          </p>
          <div className="hero-actions">
            <Link to="/contact" className="btn btn--primary btn--lg">
              Get a Quote <ArrowRight size={18} />
            </Link>
            <Link to="/services" className="btn btn--outline btn--lg">
              Our Services
            </Link>
          </div>
        </div>
      </section>

      <section className="features-section">
        <div className="features-section__inner">
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-card__icon">
                <Printer size={28} />
              </div>
              <h3>Offset Printing</h3>
              <p>High-quality offset printing for brochures, catalogs, posters, and marketing materials with vibrant colors.</p>
            </div>
            <div className="feature-card">
              <div className="feature-card__icon">
                <Package size={28} />
              </div>
              <h3>Packaging Solutions</h3>
              <p>Custom packaging boxes, cartons, and wraps designed to protect your products and elevate your brand.</p>
            </div>
            <div className="feature-card">
              <div className="feature-card__icon">
                <Palette size={28} />
              </div>
              <h3>Design Studio</h3>
              <p>Professional design support for logos, brand identity, packaging layouts, and print-ready artwork.</p>
            </div>
            <div className="feature-card">
              <div className="feature-card__icon">
                <Truck size={28} />
              </div>
              <h3>Fast Delivery</h3>
              <p>Quick turnaround times with reliable delivery across India. Track your orders in real time.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="cta-section">
        <div className="cta-section__inner">
          <h2>Ready to Start Your Print Project?</h2>
          <p>Get in touch with our team for a free consultation and quote.</p>
          <div className="cta-actions">
            <Link to="/contact" className="btn btn--primary btn--lg">
              <Phone size={18} /> Contact Us
            </Link>
            <Link to="/products" className="btn btn--outline btn--lg">
              View Products
            </Link>
          </div>
        </div>
      </section>

      {/* Structured Data — LocalBusiness */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'LocalBusiness',
            name: 'Sarga Offset Printing',
            description: 'Premium offset printing, packaging, labels, and branding solutions with fast turnaround across India.',
            url: 'https://sargaoffset.vercel.app',
            logo: 'https://sargaoffset.vercel.app/icons/icon-512.png',
            image: 'https://sargaoffset.vercel.app/og-image.jpg',
            telephone: '+91-0000000000',
            address: {
              '@type': 'PostalAddress',
              addressCountry: 'IN',
            },
            sameAs: [],
            areaServed: {
              '@type': 'Country',
              name: 'India',
            },
            hasOfferCatalog: {
              '@type': 'OfferCatalog',
              name: 'Printing Services',
              itemListElement: [
                {
                  '@type': 'Offer',
                  itemOffered: {
                    '@type': 'Service',
                    name: 'Offset Printing',
                  },
                },
                {
                  '@type': 'Offer',
                  itemOffered: {
                    '@type': 'Service',
                    name: 'Digital Printing',
                  },
                },
                {
                  '@type': 'Offer',
                  itemOffered: {
                    '@type': 'Service',
                    name: 'Packaging Solutions',
                  },
                },
                {
                  '@type': 'Offer',
                  itemOffered: {
                    '@type': 'Service',
                    name: 'Label Printing',
                  },
                },
              ],
            },
          }),
        }}
      />
    </SEOProvider>
  );
}
