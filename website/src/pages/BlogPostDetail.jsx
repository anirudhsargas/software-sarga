import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Clock, User, Calendar, ArrowLeft, Facebook, Twitter, Link2, ChevronRight } from 'lucide-react'
import axios from 'axios'
import SEO from '../components/SEO'
import toast from 'react-hot-toast'
import './BlogPostDetail.css'

export default function BlogPostDetail() {
  const { slug } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchPost = async () => {
      setLoading(true)
      try {
        const response = await axios.get(`/api/blog/posts/${slug}`)
        if (response.data) {
          setData(response.data)
        }
      } catch (err) {
        console.error('Failed to load blog article:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchPost()
  }, [slug])

  // Share tracking helper
  const trackShare = async (eventType) => {
    if (!data?.post?.id) return
    try {
      await axios.post(`/api/blog/posts/${data.post.id}/track`, { eventType })
    } catch (e) {
      console.warn('Analytics failure:', e.message)
    }
  }

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    toast.success('Link copied to clipboard!')
    trackShare('share_link')
  }

  if (loading) {
    return (
      <div className="blog-detail-loading container">
        <div className="spinner"></div>
      </div>
    )
  }

  if (!data || !data.post) {
    return (
      <div className="blog-detail-error container">
        <div className="glass-card">
          <h2>Article Not Found</h2>
          <p>The print guide or design advice article you requested does not exist or has been moved.</p>
          <Link to="/blog" className="btn btn-primary"><ArrowLeft size={16} /> Back to Blog</Link>
        </div>
      </div>
    )
  }

  const { post, related } = data

  // Dynamic JSON-LD Rich Snippet for Blog / Article schema
  const blogJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": post.title,
    "description": post.excerpt,
    "image": post.featured_image || "https://sarga.in/favicon.png",
    "author": {
      "@type": "Person",
      "name": post.author_name || "Sarga Prints Team",
      "jobTitle": post.author_role || "Printing & Design Experts"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Sarga Prints",
      "logo": {
        "@type": "ImageObject",
        "url": "https://sarga.in/favicon.png"
      }
    },
    "datePublished": post.created_at,
    "dateModified": post.updated_at,
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": window.location.href
    }
  }

  return (
    <article className="blog-detail-page">
      <SEO 
        title={post.seo_title || post.title} 
        description={post.seo_description || post.excerpt} 
      />

      {/* JSON-LD Rich Snippet Injection */}
      <script type="application/ld+json">
        {JSON.stringify(blogJsonLd)}
      </script>

      {/* Hero Header */}
      <header className="blog-detail-header">
        <div className="container">
          <Link to="/blog" className="blog-back-link">
            <ArrowLeft size={14} /> Back to Journal
          </Link>

          <div className="blog-detail-header__meta">
            <span className="blog-detail-header__category">{post.category}</span>
            <span className="blog-detail-header__dot" />
            <span className="blog-detail-header__read-time">
              <Clock size={13} /> {post.read_time} min read
            </span>
          </div>

          <h1 className="blog-detail-header__title">{post.title}</h1>
          <p className="blog-detail-header__excerpt">{post.excerpt}</p>

          <div className="blog-detail-header__author">
            <div className="blog-detail-header__author-avatar">
              <User size={16} />
            </div>
            <div>
              <div className="blog-detail-header__author-name">{post.author_name || 'Sarga Prints'}</div>
              <div className="blog-detail-header__author-date">
                <Calendar size={11} /> {new Date(post.created_at).toLocaleDateString('en-IN', {
                  year: 'numeric', month: 'long', day: 'numeric'
                })}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Layout Grid */}
      <div className="container blog-detail-layout">
        
        {/* Main Article Body */}
        <main className="blog-detail-content glass-card">
          {post.featured_image && (
            <div className="blog-detail-image-wrap">
              <img src={post.featured_image} alt={post.title} />
            </div>
          )}

          <div 
            className="blog-rich-text"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />

          {/* Social share widget */}
          <footer className="blog-detail-sharing">
            <h4>Share this Guide</h4>
            <div className="blog-share-buttons">
              <a 
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackShare('share_facebook')}
                className="btn btn-outline share-btn share-btn--fb"
              >
                <Facebook size={16} /> Facebook
              </a>
              <a 
                href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(post.title)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackShare('share_twitter')}
                className="btn btn-outline share-btn share-btn--tw"
              >
                <Twitter size={16} /> Twitter
              </a>
              <a 
                href={`https://wa.me/?text=${encodeURIComponent(post.title + ' - ' + window.location.href)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackShare('share_whatsapp')}
                className="btn btn-outline share-btn share-btn--wa"
                style={{ color: '#25D366' }}
              >
                WhatsApp
              </a>
              <button 
                onClick={handleCopyLink}
                className="btn btn-outline share-btn share-btn--copy"
              >
                <Link2 size={16} /> Copy Link
              </button>
            </div>
          </footer>
        </main>

        {/* Sidebar Info */}
        <aside className="blog-detail-sidebar">
          {/* Author Bio Box */}
          <div className="blog-sidebar-author glass-card">
            <h3>Author Profile</h3>
            <div className="blog-sidebar-author__inner">
              <div className="blog-sidebar-author__avatar">
                <User size={24} />
              </div>
              <div>
                <strong>{post.author_name || 'Sarga Team'}</strong>
                <span>{post.author_role || 'Print Specialist'}</span>
              </div>
            </div>
            <p className="blog-sidebar-author__bio">
              {post.author_bio || 'Sharing practical printing, packaging and finishing guides based on Sarga Prints\' 30-year legacy of quality in Kerala.'}
            </p>
          </div>

          {/* Quick CTA */}
          <div className="blog-sidebar-cta glass-card">
            <h3>Ready to Print?</h3>
            <p>Order custom prints or request pricing for high-GSM wedding invitations directly from our team.</p>
            <Link to="/contact" className="btn btn-primary" style={{ width: '100%' }}>Request Quote</Link>
          </div>
        </aside>

      </div>

      {/* Related Articles Section */}
      {related && related.length > 0 && (
        <section className="blog-related-section container">
          <h2 className="related-title">You Might Also Like</h2>
          <div className="related-grid">
            {related.map((item) => (
              <article key={item.id} className="blog-card glass-card">
                {item.featured_image ? (
                  <div className="blog-card__img-wrap">
                    <img src={item.featured_image} alt={item.title} className="blog-card__img" />
                  </div>
                ) : (
                  <div className="blog-card__placeholder">
                    <Clock size={28} />
                  </div>
                )}
                <div className="blog-card__body">
                  <div className="blog-card__meta">
                    <span className="blog-card__category">{post.category}</span>
                    <span className="blog-card__read-time">
                      <Clock size={12} /> {item.read_time} min read
                    </span>
                  </div>
                  <h3 className="blog-card__title">
                    <Link to={`/blog/${item.slug}`}>{item.title}</Link>
                  </h3>
                  <p className="blog-card__excerpt">{item.excerpt}</p>
                  <div className="blog-card__footer" style={{ border: 'none', paddingTop: 0 }}>
                    <Link to={`/blog/${item.slug}`} className="blog-card__link">
                      Read Article <ChevronRight size={14} />
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </article>
  )
}
