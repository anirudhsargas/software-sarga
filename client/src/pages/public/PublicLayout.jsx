import { Outlet } from 'react-router-dom';
import { Link } from 'react-router-dom';

export default function PublicLayout() {
  return (
    <div className="public-shell">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <header className="public-header" role="banner">
        <div className="public-header__inner">
          <Link to="/" className="public-header__brand">
            <img
              src="/icons/icon-192.png"
              alt=""
              width="36"
              height="36"
              loading="eager"
            />
            <span className="public-header__logo-text">SARGA</span>
          </Link>

          <nav className="public-header__nav" aria-label="Main navigation">
            <Link to="/services">Services</Link>
            <Link to="/products">Products</Link>
            <Link to="/design">Design</Link>
            <Link to="/track">Track Order</Link>
            <Link to="/contact">Contact</Link>
            <Link to="/signin" className="btn btn--sm btn--primary">
              Sign In
            </Link>
          </nav>
        </div>
      </header>

      <main id="main-content" role="main">
        <Outlet />
      </main>

      <footer className="public-footer" role="contentinfo">
        <div className="public-footer__inner">
          <div className="public-footer__grid">
            <div className="public-footer__col">
              <h3>SARGA</h3>
              <p>Print Beyond the Ordinary</p>
              <p className="public-footer__address">
                Offset Printing &amp; Packaging Solutions
                <br />
                India
              </p>
            </div>
            <div className="public-footer__col">
              <h4>Services</h4>
              <Link to="/services">Offset Printing</Link>
              <Link to="/services">Digital Printing</Link>
              <Link to="/services">Packaging</Link>
              <Link to="/services">Labels</Link>
            </div>
            <div className="public-footer__col">
              <h4>Company</h4>
              <Link to="/contact">Contact Us</Link>
              <Link to="/privacy">Privacy Policy</Link>
              <Link to="/terms">Terms of Service</Link>
            </div>
            <div className="public-footer__col">
              <h4>Get Started</h4>
              <Link to="/signin">Sign In</Link>
              <Link to="/track">Track Order</Link>
              <Link to="/contact">Request Quote</Link>
            </div>
          </div>
          <div className="public-footer__bottom">
            <p>&copy; {new Date().getFullYear()} Sarga Offset Printing. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
