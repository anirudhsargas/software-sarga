import { Link } from 'react-router-dom'
import { Printer, MapPin, Phone, Mail, Clock, ArrowUpRight } from 'lucide-react'
import './Footer.css'
import { useI18n } from '../context/I18nContext'

export default function Footer() {
  const { t } = useI18n()
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
               {t('footer.brand_description')}
             </p>
           </div>

           {/* Quick Links */}
           <div className="footer__col">
             <h4 className="footer__heading">{t('footer.quick_links')}</h4>
             <ul className="footer__links">
               <li><Link to="/" className="footer__link">{t('nav.home')}</Link></li>
               <li><Link to="/services" className="footer__link">{t('nav.services')}</Link></li>
               <li><Link to="/track" className="footer__link">{t('nav.track')}</Link></li>
               <li><Link to="/contact" className="footer__link">{t('nav.get_quote')}</Link></li>
             </ul>
           </div>

           {/* Services */}
           <div className="footer__col">
             <h4 className="footer__heading">{t('footer.services')}</h4>
             <ul className="footer__links">
               <li><Link to="/services" className="footer__link">{t('footer.service_offset_digital')}</Link></li>
               <li><Link to="/services" className="footer__link">{t('footer.service_photostat_id')}</Link></li>
               <li><Link to="/services" className="footer__link">{t('footer.service_mementos_frames')}</Link></li>
               <li><Link to="/services" className="footer__link">{t('footer.service_hard_spiral_binding')}</Link></li>
               <li><Link to="/services" className="footer__link">{t('footer.service_rubber_seals_stamps')}</Link></li>
             </ul>
           </div>

           {/* Contact */}
           <div className="footer__col">
             <h4 className="footer__heading">{t('footer.contact_us')}</h4>
             <ul className="footer__contact">
               <li>
                 <MapPin size={16} />
                 <span>{t('footer.location')}</span>
               </li>
               <li>
                 <Phone size={16} />
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                   <a href="tel:+919495177283" className="footer__link">{t('footer.phone_pba')}</a>
                   <a href="tel:+919188331197" className="footer__link">{t('footer.phone_mpr')}</a>
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
                 <span>{t('footer.hours')}</span>
               </li>
             </ul>
           </div>
        </div>

         <div className="footer__bottom">
           <p className="footer__copyright">
             &copy; {currentYear} {t('footer.company_name')} ({t('footer.since_year')}). {t('footer.all_rights_reserved')}
           </p>
           <div className="footer__bottom-links">
             <Link to="/privacy" className="footer__link">{t('footer.privacy_policy')}</Link>
             <Link to="/terms" className="footer__link">{t('footer.terms_of_service')}</Link>
           </div>
         </div>
      </div>
    </footer>
  )
}
