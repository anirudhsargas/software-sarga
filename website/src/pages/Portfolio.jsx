import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Search, Filter, X, ChevronLeft, ChevronRight, Maximize2, Grid3X3, LayoutGrid, Loader2 } from 'lucide-react'
import api from '../api'
import SEO from '../components/SEO'
import './Portfolio.css'

const CATEGORIES = ['All', 'Wedding Cards', 'Mementos', 'Photo Frames', 'Offset Books', 'Business Cards', 'Certificates', 'Custom Projects']

export default function Portfolio() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [lightbox, setLightbox] = useState(null)
  const [lightboxIdx, setLightboxIdx] = useState(0)
  const [viewMode, setViewMode] = useState('grid')

  useEffect(() => {
    loadProjects()
  }, [category])

  const loadProjects = async () => {
    setLoading(true)
    try {
      const params = { limit: 100 }
      if (category !== 'All') params.category = category
      if (search) params.search = search
      const res = await api.get('/website/portfolio', { params })
      setProjects(res.data.projects || [])
    } catch (e) {
      setProjects([])
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = () => {
    setCategory('All')
    loadProjects()
  }

  const openLightbox = (images, idx) => {
    setLightbox(images)
    setLightboxIdx(idx)
  }

  return (
    <div className="portfolio-page">
      <SEO title="Portfolio" description="Explore Sarga Printing's portfolio of wedding cards, mementos, photo frames, business cards, certificates, and custom print projects." />

      <section className="page-header">
        <div className="page-header__bg" />
        <div className="container page-header__content">
          <span className="badge badge--primary">Our Work</span>
          <h1 className="page-header__title">Portfolio <span className="text-gradient">Gallery</span></h1>
          <p className="page-header__subtitle">Explore our premium printing and design projects</p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="portfolio-toolbar">
            <div className="portfolio-search-wrap">
              <Search size={18} />
              <input
                className="input"
                placeholder="Search projects..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
              />
              {search && <button className="btn btn-sm btn-ghost" onClick={() => { setSearch(''); loadProjects(); }}><X size={16} /></button>}
            </div>
            <div className="portfolio-categories">
              {CATEGORIES.map(c => (
                <button
                  key={c}
                  className={`category-chip ${category === c ? 'active' : ''}`}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="portfolio-view-toggle">
              <button className={`btn btn-sm ${viewMode === 'grid' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setViewMode('grid')}>
                <Grid3X3 size={16} />
              </button>
              <button className={`btn btn-sm ${viewMode === 'masonry' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setViewMode('masonry')}>
                <LayoutGrid size={16} />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="loading-wrap"><Loader2 size={36} className="spinning" /></div>
          ) : projects.length === 0 ? (
            <div className="empty-wrap">
              <h3>No projects found</h3>
              <p>Try a different category or search term.</p>
            </div>
          ) : (
            <div className={`portfolio-${viewMode}`}>
              {projects.map(project => {
                const images = project.gallery_images && project.gallery_images.length
                  ? project.gallery_images
                  : project.cover_image ? [project.cover_image] : []
                const firstImage = images[0] || '/placeholder-image.svg'
                return (
                  <div key={project.id} className="portfolio-card" onClick={() => images.length && openLightbox(images, 0)}>
                    <div className="portfolio-card-image">
                      <img src={firstImage} alt={project.title} loading="lazy" />
                      <div className="portfolio-card-overlay">
                        <Maximize2 size={20} />
                      </div>
                      {images.length > 1 && <span className="portfolio-card-count">+{images.length - 1}</span>}
                    </div>
                    <div className="portfolio-card-body">
                      <span className="portfolio-card-category">{project.category}</span>
                      <h3>{project.title}</h3>
                      {project.description && <p>{project.description}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {lightbox && (
        <div className="lightbox-overlay" onClick={() => setLightbox(null)}>
          <div className="lightbox-content" onClick={e => e.stopPropagation()}>
            <button className="lightbox-close" onClick={() => setLightbox(null)}><X size={24} /></button>
            {lightbox.length > 1 && (
              <>
                <button className="lightbox-nav lightbox-prev" onClick={() => setLightboxIdx(i => (i - 1 + lightbox.length) % lightbox.length)}>
                  <ChevronLeft size={24} />
                </button>
                <button className="lightbox-nav lightbox-next" onClick={() => setLightboxIdx(i => (i + 1) % lightbox.length)}>
                  <ChevronRight size={24} />
                </button>
              </>
            )}
            <img src={lightbox[lightboxIdx]} alt={`Portfolio image ${lightboxIdx + 1}`} className="lightbox-image" />
            <div className="lightbox-counter">{lightboxIdx + 1} / {lightbox.length}</div>
          </div>
        </div>
      )}
    </div>
  )
}
