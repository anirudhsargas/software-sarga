import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search, Clock, ArrowRight, User, Hash, AlertCircle, Loader2 } from 'lucide-react'
import api from '../api'
import SEO from '../components/SEO'
import './BlogList.css'

const CATEGORIES = [
  'All',
  'Wedding Card Guides',
  'Offset Printing Tips',
  'Digital Printing',
  'Design Advice',
  'Business Branding',
  'Marketing Materials',
  'School & College Printing'
]

export default function BlogList() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '')
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || 'All')
  const [selectedTag, setSelectedTag] = useState(searchParams.get('tag') || '')

    useEffect(() => {
      const fetchPosts = async () => {
        setLoading(true)
        try {
          const params = { limit: 20 }
          if (selectedCategory !== 'All') {
            params.category = selectedCategory
          }
          if (selectedTag) {
            params.tag = selectedTag
          }
          if (searchQuery) {
            params.q = searchQuery
          }
          const response = await api.get('/blog/posts', { params })
          if (response.data && response.data.posts) {
            setPosts(response.data.posts)
          }
        } catch (err) {
          console.error('Failed to fetch blog posts:', err)
        } finally {
          setLoading(false)
        }
      }

      fetchPosts()
    }, [selectedCategory, selectedTag, searchQuery])

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    setSearchParams(searchQuery ? { q: searchQuery } : {})
  }

  const handleCategorySelect = (cat) => {
    setSelectedCategory(cat)
    setSelectedTag('')
    setSearchParams(cat !== 'All' ? { category: cat } : {})
  }

  return (
    <div className="blog-list-page">
      <SEO 
        title="Printing & Design Blog" 
        description="Learn paper GSM definitions, luxury wedding card finishes, visiting card design strategies, and direct offset vs digital printing insights from Sarga Prints." 
      />

      {/* Header */}
      <section className="page-header" id="blog-header">
        <div className="page-header__bg" />
        <div className="container page-header__content">
          <span className="badge badge--primary">Sarga Knowledge Hub</span>
          <h1 className="page-header__title">
            The Print & <span className="text-gradient">Design Journal</span>
          </h1>
          <p className="page-header__subtitle">
            Expert printing guides, creative packaging finishes, and professional branding tips from our 30-year legacy in Kozhikode.
          </p>
        </div>
      </section>

      {/* Categories & Search */}
      <section className="blog-controls container">
        <div className="blog-categories-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategorySelect(cat)}
              className={`category-pill ${selectedCategory === cat ? 'category-pill--active' : ''}`}
            >
              {cat}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearchSubmit} className="blog-search-box">
          <Search size={18} className="blog-search-icon" />
          <input
            type="text"
            className="input blog-search-input"
            placeholder="Search articles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </form>
      </section>

      {/* Articles Grid */}
      <main className="blog-grid-section container">
        {selectedTag && (
          <div className="tag-filter-notice">
            <Hash size={16} /> Filtered by Tag: <strong>{selectedTag}</strong>
            <button onClick={() => setSelectedTag('')} className="btn-clear-tag">✕ Clear</button>
          </div>
        )}

        {loading ? (
          <div className="blog-loader-wrap">
            <Loader2 size={36} className="spinning" style={{ color: 'var(--accent)' }} />
          </div>
        ) : posts.length === 0 ? (
          <div className="blog-empty-state glass-card">
            <AlertCircle size={44} style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }} />
            <h3>No Articles Found</h3>
            <p>We couldn't find any articles matching your filters. Try adjusting your search query or category.</p>
          </div>
        ) : (
          <div className="blog-grid">
            {posts.map((post) => (
              <article key={post.id} className="blog-card glass-card reveal">
                {post.featured_image ? (
                  <div className="blog-card__img-wrap">
                    <img src={post.featured_image} alt={post.title} className="blog-card__img" />
                  </div>
                ) : (
                  <div className="blog-card__placeholder">
                    <Hash size={44} />
                  </div>
                )}

                <div className="blog-card__body">
                  <div className="blog-card__meta">
                    <span className="blog-card__category">{post.category}</span>
                    <span className="blog-card__read-time">
                      <Clock size={12} /> {post.read_time} min read
                    </span>
                  </div>

                  <h3 className="blog-card__title">
                    <Link to={`/blog/${post.slug}`}>{post.title}</Link>
                  </h3>
                  
                  <p className="blog-card__excerpt">{post.excerpt}</p>

                  <div className="blog-card__footer">
                    <div className="blog-card__author">
                      <div className="blog-card__author-avatar">
                        <User size={14} />
                      </div>
                      <span>{post.author_name || 'Sarga Team'}</span>
                    </div>

                    <Link to={`/blog/${post.slug}`} className="blog-card__link">
                      Read Article <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
