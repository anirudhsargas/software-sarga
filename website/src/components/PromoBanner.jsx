import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { X, ChevronLeft, ChevronRight, Clock, Gift } from 'lucide-react'
import api from '../api'
import './PromoBanner.css'

export default function PromoBanner() {
  const [banners, setBanners] = useState([])
  const [current, setCurrent] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    api.get('/website/promotions/banners').then(res => {
      if (res.data?.banners?.length) setBanners(res.data.banners)
    }).catch(() => {})
  }, [])

  const nextBanner = useCallback(() => {
    setCurrent(i => (i + 1) % banners.length)
  }, [banners.length])

  useEffect(() => {
    if (banners.length <= 1) return
    const timer = setInterval(nextBanner, 6000)
    return () => clearInterval(timer)
  }, [banners.length, nextBanner])

  if (!banners.length || dismissed) return null

  const banner = banners[current]
  const timeLeft = banner.end_date ? new Date(banner.end_date) - new Date() : 0
  const daysLeft = Math.ceil(timeLeft / (1000 * 60 * 60 * 24))

  return (
    <div className="promo-banner" style={{ backgroundImage: banner.banner_image ? `url(${banner.banner_image})` : undefined }}>
      <div className="promo-banner-overlay" />
      <div className="promo-banner-content">
        <div className="promo-banner-text">
          {banners.length > 1 && (
            <div className="promo-banner-nav">
              <button onClick={() => setCurrent(i => (i - 1 + banners.length) % banners.length)}><ChevronLeft size={16} /></button>
              <span>{current + 1}/{banners.length}</span>
              <button onClick={nextBanner}><ChevronRight size={16} /></button>
            </div>
          )}
          <div className="promo-banner-badge"><Gift size={14} /> {banner.campaign_type}</div>
          <h3>{banner.title}</h3>
          {banner.description && <p>{banner.description}</p>}
          <div className="promo-banner-meta">
            {banner.discount_percent > 0 && <span className="promo-discount">{banner.discount_percent}% OFF</span>}
            {banner.discount_code && <span className="promo-code">Code: {banner.discount_code}</span>}
            {daysLeft > 0 && <span className="promo-countdown"><Clock size={12} /> {daysLeft}d left</span>}
          </div>
          {banner.link_url && <Link to={banner.link_url} className="btn btn-sm btn-primary">View Promotion</Link>}
        </div>
      </div>
      <button className="promo-banner-close" onClick={() => setDismissed(true)}><X size={16} /></button>
    </div>
  )
}
