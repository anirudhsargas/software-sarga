import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Menu, X, Printer, Palette, Sun, Moon } from 'lucide-react'
import './Navbar.css'
import CartIcon from './Cart/CartIcon'
import LanguageSwitcher from './LanguageSwitcher'
import { useI18n } from '../context/I18nContext'

const navLinks = [
  { path: '/', label: 'Home' },
  { path: '/services', label: 'Services' },
  { path: '/products', label: 'Products' },
  { path: '/portfolio', label: 'Portfolio' },
  { path: '/blog', label: 'Blog' },
  { path: '/samples', label: 'Samples' },
  { path: '/book', label: 'Free Consultation' },
  { path: '/track', label: 'Track Order' },
  { path: '/artwork-upload', label: 'Upload Artwork' },
  { path: '/pickup', label: 'Schedule Pickup' },
  { path: '/contact', label: 'Contact' },
]

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [theme, setTheme] = useState('light')
  const location = useLocation()

  useEffect(() => {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    setTheme(currentTheme);

    const observer = new MutationObserver(() => {
      const updatedTheme = document.documentElement.getAttribute('data-theme') || 'light';
      setTheme(updatedTheme);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, [])

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('sarga_theme', nextTheme);
  }

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    setIsOpen(false)
  }, [location])

  return (
    <nav className={`navbar ${scrolled ? 'navbar--scrolled' : ''} ${location.pathname === '/' ? 'navbar--hero' : ''}`} id="main-navbar">
      <div className="navbar__inner container">
        <Link to="/" className="navbar__logo" id="logo-link">
          <div className="navbar__logo-icon">
            <Printer size={24} />
          </div>
          <span className="navbar__logo-text">Sarga</span>
        </Link>

        <ul className={`navbar__links ${isOpen ? 'navbar__links--open' : ''}`}>
          {navLinks.map((link) => (
            <li key={link.path}>
              <Link
                to={link.path}
                className={`navbar__link ${location.pathname === link.path ? 'navbar__link--active' : ''}`}
                id={`nav-${link.label.toLowerCase().replace(' ', '-')}`}
              >
                {link.label}
              </Link>
            </li>
          ))}
          {/* Mobile-only Design Hub CTA inside the menu */}
          <li className="navbar__links-cta navbar__links-cta--design">
            <Link to="/design" className="navbar__mobile-design-btn">
              <Palette size={18} />
              <span>Launch Design Hub</span>
              <span className="navbar__badge-pulse">Live</span>
            </Link>
          </li>
          {/* Mobile-only CTA Buttons */}
          <li className="navbar__links-cta">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 20px', width: '100%' }}>
              <Link to="/signin" className="btn btn-outline" style={{ width: '100%' }}>Sign In</Link>
              <Link to="/contact" className="btn btn-primary" style={{ width: '100%' }}>Get a Quote</Link>
            </div>
          </li>
        </ul>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Desktop Design Hub featured Badge */}
          <Link to="/design" className="navbar__design-badge navbar__cta-desktop" id="nav-design-desktop">
            <Palette size={15} /> 
            <span>Design</span>
            <span className="navbar__design-badge-dot"></span>
          </Link>

          <Link to="/signin" className="btn btn-outline btn-sm navbar__cta-desktop" id="nav-sign-in-desktop">
            Sign In
          </Link>
          <Link to="/contact" className="btn btn-primary btn-sm navbar__cta-desktop" id="nav-get-quote-desktop">
            Get a Quote
          </Link>

          {/* Language Switcher */}
          <LanguageSwitcher />

          {/* Theme Toggle Button */}
          <button 
            className="navbar__theme-toggle" 
            onClick={toggleTheme} 
            aria-label="Toggle dark/light theme"
            title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>

          <CartIcon />
        </div>

        <button
          className="navbar__toggle"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Toggle navigation"
          id="navbar-toggle"
        >
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>
    </nav>
  )
}
