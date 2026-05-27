import { Link } from 'react-router-dom'
import { Printer, MapPin, Phone, Mail, Clock, ArrowUpRight } from 'lucide-react'
import './Footer.css'

export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="footer" id="footer">
      <div className="footer__glow" />
      <div className="container">
        <div className="footer__grid">
          {/* Brand */}
          <div className="footer__brand">
            <div className="footer__logo">
              <div className="footer__logo-icon">
                <Printer size={22} />
              </div>
              <span className="footer__logo-text">Sarga</span>
            </div>
            <p className="footer__desc">
              Premium printing, photocopy & design solutions. Building trust across Kerala since 1994.
            </p>
          </div>

          {/* Quick Links */}
          <div className="footer__col">
            <h4 className="footer__heading">Quick Links</h4>
            <ul className="footer__links">
              <li><Link to="/" className="footer__link">Home</Link></li>
              <li><Link to="/services" className="footer__link">Services</Link></li>
              <li><Link to="/track" className="footer__link">Track Order</Link></li>
              <li><Link to="/contact" className="footer__link">Get a Quote</Link></li>
            </ul>
          </div>

          {/* Services */}
          <div className="footer__col">
            <h4 className="footer__heading">Services</h4>
            <ul className="footer__links">
              <li><Link to="/services" className="footer__link">Offset & Digital Printing</Link></li>
              <li><Link to="/services" className="footer__link">Photostat & ID Cards</Link></li>
              <li><Link to="/services" className="footer__link">Mementos & Photo Frames</Link></li>
              <li><Link to="/services" className="footer__link">Hard & Spiral Binding</Link></li>
              <li><Link to="/services" className="footer__link">Rubber Seals & Stamps</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div className="footer__col">
            <h4 className="footer__heading">Contact Us</h4>
            <ul className="footer__contact">
              <li>
                <MapPin size={16} />
                <span>Perambra & Meppayur, Kerala</span>
              </li>
              <li>
                <Phone size={16} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <a href="tel:+919495177283" className="footer__link">PBA: +91 94951 77283</a>
                  <a href="tel:+919188331197" className="footer__link">MPR: +91 91883 31197</a>
                </div>
              </li>
              <li>
                <Mail size={16} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <a href="mailto:sargapba@gmail.com" className="footer__link">sargapba@gmail.com</a>
                  <a href="mailto:sargaoffsetmpr@gmail.com" className="footer__link">sargaoffsetmpr@gmail.com</a>
                </div>
              </li>
              <li>
                <Clock size={16} />
                <span>Mon - Sat: 9:00 AM - 7:00 PM</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer__bottom">
          <p className="footer__copyright">
            &copy; {currentYear} Sarga (Since 1994). All rights reserved.
          </p>
          <div className="footer__bottom-links">
            <a href="#" className="footer__link">Privacy Policy</a>
            <a href="#" className="footer__link">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
