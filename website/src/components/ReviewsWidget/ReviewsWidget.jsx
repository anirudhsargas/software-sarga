import { useState, useEffect, useRef, useCallback } from 'react'
import { Star, ChevronLeft, ChevronRight, ExternalLink, MessageSquare, Quote } from 'lucide-react'
import { getReviews, getReviewStats } from '../../api'
import './ReviewsWidget.css'

const STARS = [1, 2, 3, 4, 5]

function StarRating({ rating, size = 14 }) {
  return (
    <div className="rw-stars" aria-label={`${rating} out of 5 stars`}>
      {STARS.map((s) => (
        <Star
          key={s}
          size={size}
          className={`rw-star ${s <= Math.round(rating) ? 'rw-star--filled' : 'rw-star--empty'}`}
        />
      ))}
    </div>
  )
}

function ReviewCard({ review }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = review.review_text && review.review_text.length > 150

  return (
    <div className="rw-card" itemScope itemType="https://schema.org/Review">
      <div className="rw-card__top">
        <div className="rw-card__avatar">
          {review.profile_image_url ? (
            <img src={review.profile_image_url} alt={review.reviewer_name} loading="lazy" />
          ) : (
            <span>{review.reviewer_name.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="rw-card__info">
          <span className="rw-card__name" itemProp="author">{review.reviewer_name}</span>
          <StarRating rating={review.rating} size={12} />
        </div>
        {review.review_date && (
          <time className="rw-card__date" dateTime={review.review_date} itemProp="datePublished">
            {new Date(review.review_date + 'T00:00:00').toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}
          </time>
        )}
      </div>
      {review.review_text && (
        <div className="rw-card__body" itemProp="reviewBody">
          <Quote size={14} className="rw-card__quote" />
          <p className={expanded ? '' : 'rw-card__text--clamp'}>
            {review.review_text}
          </p>
          {isLong && (
            <button className="rw-card__toggle" onClick={() => setExpanded(!expanded)}>
              {expanded ? 'Read less' : 'Read more'}
            </button>
          )}
        </div>
      )}
      <meta itemProp="reviewRating" content={String(review.rating)} />
    </div>
  )
}

export default function ReviewsWidget() {
  const [reviews, setReviews] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [scrollPos, setScrollPos] = useState(0)
  const trackRef = useRef(null)
  const intervalRef = useRef(null)

  useEffect(() => {
    let mounted = true
    Promise.all([getReviews(), getReviewStats()])
      .then(([revRes, statRes]) => {
        if (!mounted) return
        setReviews(revRes.data?.reviews || [])
        setStats(statRes.data || null)
      })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const scroll = useCallback((dir) => {
    if (!trackRef.current) return
    const scrollAmt = trackRef.current.clientWidth * 0.8
    trackRef.current.scrollBy({ left: dir * scrollAmt, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const handleScroll = () => setScrollPos(el.scrollLeft)
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  // auto-rotate carousel every 6s
  useEffect(() => {
    if (reviews.length <= 1) return
    intervalRef.current = setInterval(() => {
      if (!trackRef.current) return
      const el = trackRef.current
      const maxScroll = el.scrollWidth - el.clientWidth
      if (el.scrollLeft >= maxScroll - 10) {
        el.scrollTo({ left: 0, behavior: 'smooth' })
      } else {
        el.scrollBy({ left: el.clientWidth * 0.5, behavior: 'smooth' })
      }
    }, 6000)
    return () => clearInterval(intervalRef.current)
  }, [reviews.length])

  if (loading) return null

  const avgRating = stats ? Number(stats.average_rating) : 0
  const totalReviews = stats ? Number(stats.total_reviews) : 0
  const featured = reviews.filter(r => r.is_featured).slice(0, 3)

  return (
    <section className="rw-section" id="reviews">
      <div className="rw-container">
        {/* Header */}
        <div className="rw-header">
          <div className="rw-header__left">
            <span className="rw-eyebrow">Customer Reviews</span>
            <h2 className="rw-title">What Our Clients Say</h2>
          </div>
          <a
            href="https://search.google.com/local/writereview?placeid=PLACE_ID"
            target="_blank"
            rel="noopener noreferrer"
            className="rw-write-btn"
          >
            <MessageSquare size={14} />
            Write a Review
          </a>
        </div>

        {/* Rating Summary */}
        {stats && (
          <div className="rw-summary" itemScope itemType="https://schema.org/Product">
            <meta itemProp="name" content="Sarga Printing" />
            <div className="rw-summary__stars">
              <StarRating rating={avgRating} size={22} />
              <span className="rw-summary__rating">{avgRating}</span>
            </div>
            <div className="rw-summary__info" itemProp="aggregateRating" itemScope itemType="https://schema.org/AggregateRating">
              <meta itemProp="ratingValue" content={String(avgRating)} />
              <meta itemProp="reviewCount" content={String(totalReviews)} />
              <span className="rw-summary__count">Rated {avgRating}+ by {totalReviews} customers</span>
              <span className="rw-summary__badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 12l2 2 4-4"/></svg>
                Google Verified
              </span>
            </div>
          </div>
        )}

        {/* Featured */}
        {featured.length > 0 && (
          <div className="rw-featured">
            {featured.map(r => (
              <div key={r.id} className="rw-featured__item">
                <Quote size={16} className="rw-featured__quote" />
                <p>{r.review_text}</p>
                <div className="rw-featured__author">
                  <span>{r.reviewer_name}</span>
                  <StarRating rating={r.rating} size={10} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Carousel */}
        {reviews.length > 0 && (
          <div className="rw-carousel">
            <button className="rw-carousel__btn rw-carousel__btn--prev" onClick={() => scroll(-1)} aria-label="Previous reviews">
              <ChevronLeft size={20} />
            </button>
            <div className="rw-carousel__track" ref={trackRef}>
              {reviews.map(r => (
                <ReviewCard key={r.id} review={r} />
              ))}
            </div>
            <button className="rw-carousel__btn rw-carousel__btn--next" onClick={() => scroll(1)} aria-label="Next reviews">
              <ChevronRight size={20} />
            </button>
          </div>
        )}

        {reviews.length === 0 && !loading && (
          <p className="rw-empty">No reviews yet. Be the first to leave one!</p>
        )}

        {/* Footer link */}
        <div className="rw-footer">
          <a href="https://search.google.com/local/reviews?placeid=PLACE_ID" target="_blank" rel="noopener noreferrer" className="rw-footer__link">
            See all reviews on Google <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </section>
  )
}
