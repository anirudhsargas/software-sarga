import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Search, Printer, Package, ChevronRight, Loader2, ArrowRight, ShoppingBag } from 'lucide-react'
import { getCategories, getProducts } from '../api'
import SEO from '../components/SEO'
import './Products.css'
import WhatsAppButton from '../components/WhatsAppButton'
import { useCart } from '../context/CartContext'

const FALLBACK_CATEGORIES = [
  { id: 1, name: 'Digital Printing' },
  { id: 2, name: 'Offset Printing' },
  { id: 3, name: 'Mementos & Frames' },
  { id: 4, name: 'Binding & Finishing' },
]

const FALLBACK_PRODUCTS = [
  { id: 101, name: 'Premium Multi-color Wedding Cards', description: 'Stunning premium wedding card designs on metallic, textured, or handmade boards.', category_name: 'Offset Printing', image_url: '', starting_price: 12 },
  { id: 102, name: 'Institutional ID Cards & Badges', description: 'Durable thermal printed PVC smartcards and badges with customized printed lanyards.', category_name: 'Digital Printing', image_url: '', starting_price: 25 },
  { id: 103, name: 'Pre-Inked Professional Rubber Stamps', description: 'Flash pre-inked stamps, automatic self-inking stamps, and standard office seals.', category_name: 'Binding & Finishing', image_url: '', starting_price: 90 },
  { id: 104, name: 'Custom Appreciation Mementos', description: 'Elegant wooden, crystal, and acrylic trophy mementos crafted for corporate recognition.', category_name: 'Mementos & Frames', image_url: '', starting_price: 150 },
  { id: 105, name: 'Bulk Product Label Stickers', description: 'Glossy or matte vinyl packaging stickers, die-cut to any shape for product branding.', category_name: 'Digital Printing', image_url: '', starting_price: 2 },
  { id: 106, name: 'University Thesis Hard Binding', description: 'Premium gold-foil embossing on luxury leatherette hardcover binding for college projects.', category_name: 'Binding & Finishing', image_url: '', starting_price: 180 },
]

export default function Products() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { addItem, openCart } = useCart()
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '')
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || 'All')
  const [page, setPage] = useState(1)
  const [limit] = useState(12)
  const [total, setTotal] = useState(0)
  const [activeCategoryId, setActiveCategoryId] = useState(null) // expanded category to show subcategories

  const totalPages = Math.max(1, Math.ceil(total / limit))

  const fetchProducts = async (p, q) => {
    setLoading(true)
    try {
      const res = await getProducts({ page: p, limit, q: q || '' })
      if (res.data?.products) {
        setProducts(res.data.products)
        setTotal(res.data.total || 0)
      }
    } catch {
      setProducts(FALLBACK_PRODUCTS)
      setTotal(FALLBACK_PRODUCTS.length)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    getCategories()
      .then(res => { if (res.data?.categories) setCategories(res.data.categories) })
      .catch(() => setCategories(FALLBACK_CATEGORIES))
  }, [])

  useEffect(() => {
    const q = searchParams.get('q') || ''
    const cat = searchParams.get('category') || 'All'
    setSearchQuery(q)
    setSelectedCategory(cat)
    fetchProducts(page, q)
  }, [page, searchParams])

  const handleSearch = () => {
    setPage(1)
    fetchProducts(1, searchQuery)
  }

  const handleOrder = (productName) => {
    // Navigate to contact form and pre-fill the selected product
    navigate(`/contact?product=${encodeURIComponent(productName)}`)
  }

  // Filter products based on selected category and client-side search query
  const filteredProducts = products.filter((prod) => {
    const matchesCategory = selectedCategory === 'All' || prod.category_name === selectedCategory || prod.subcategory_name === selectedCategory
    const matchesQuery = !searchQuery || 
      prod.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (prod.description && prod.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (prod.category_name && prod.category_name.toLowerCase().includes(searchQuery.toLowerCase()))
    return matchesCategory && matchesQuery
  })

  return (
    <div className="products-page">
      <SEO 
        title="Products Catalog" 
        description="Browse Sarga Prints' dynamically synchronized print catalog. Custom wedding cards, rubber stamps, mementos, labels, and thesis binding." 
      />
      {/* Header */}
      <section className="page-header" id="products-header">
        <div className="page-header__bg" />
        <div className="container page-header__content">
          <span className="badge badge-primary">Sarga Catalog</span>
          <h1 className="page-header__title">
            Explore Our <span className="text-gradient">Premium Products</span>
          </h1>
          <p className="page-header__subtitle">
            Browse our dynamically synchronized category list and order customized prints directly online.
          </p>
        </div>
      </section>

      {/* Main Browse Grid */}
      <section className="section" id="products-catalog">
        <div className="container">
          <div className="catalog-layout">
            
            {/* Mobile Filter Action (Sticky) */}
            <div className="mobile-action-bar" style={{ display: 'none' /* handled by CSS media query in real app, simulating here */, marginBottom: 'var(--space-md)' }}>
              <button 
                className="btn btn-primary btn-full" 
                onClick={() => document.querySelector('.catalog-sidebar').classList.toggle('mobile-open')}
                style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
              >
                Filters & Categories
              </button>
            </div>

            {/* Sidebar Categories */}
            <aside className="catalog-sidebar glass-card reveal">
              <h3 className="sidebar-title">Categories</h3>
              <ul className="sidebar-list">
                <li>
                  <button
                    className={`sidebar-btn ${selectedCategory === 'All' ? 'sidebar-btn--active' : ''}`}
                    onClick={() => { setSelectedCategory('All'); setActiveCategoryId(null); setPage(1); fetchProducts(1, searchQuery); }}
                  >
                    All Products
                  </button>
                </li>
                {categories.map((cat) => (
                  <li key={cat.id}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <button
                        className={`sidebar-btn ${selectedCategory === cat.name ? 'sidebar-btn--active' : ''}`}
                        onClick={() => {
                          // If category has subcategories, toggle expansion. Otherwise select it.
                          const subs = cat.subcategories || cat.children || [];
                          if (subs && subs.length) {
                            setActiveCategoryId(prev => prev === cat.id ? null : cat.id);
                            // don't immediately change selectedCategory until a subcategory is chosen
                          } else {
                            setSelectedCategory(cat.name);
                            setActiveCategoryId(null);
                            setPage(1);
                            fetchProducts(1, searchQuery);
                          }
                        }}
                      >
                        {cat.name}
                      </button>
                      {/* Render subcategories when expanded */}
                      { (activeCategoryId === cat.id) && ((cat.subcategories && cat.subcategories.length) || (cat.children && cat.children.length)) && (
                        <ul className="subcategory-list">
                          {(cat.subcategories || cat.children || []).map((s) => (
                            <li key={s.id}>
                              <button
                                className={`sidebar-btn sidebar-btn--sub ${selectedCategory === s.name ? 'sidebar-btn--active' : ''}`}
                                onClick={() => { setSelectedCategory(s.name); setPage(1); fetchProducts(1, searchQuery); }}
                              >
                                {s.name}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </aside>

            {/* Product Listing */}
            <div className="catalog-content">
              {/* Search Bar */}
              <div className="catalog-search-wrap">
                <Search size={18} className="catalog-search-icon" />
                <input
                  type="text"
                  className="input catalog-search-input"
                  placeholder="Search products (e.g. stamps, mementos, cards)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
                />
              </div>

              {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-4xl) 0' }}>
                  <Loader2 size={36} className="spinning" style={{ color: 'var(--accent)' }} />
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="catalog-empty glass-card reveal">
                  <ShoppingBag size={48} style={{ color: 'var(--text-disabled)', marginBottom: 'var(--space-md)' }} />
                  <h3>No Products Found</h3>
                  <p>We couldn't find any products matching your filters. Try adjusting your search query or category.</p>
                </div>
              ) : (
                <div className="products-grid">
                  {filteredProducts.map((prod) => (
                    <div key={prod.id} className="product-card glass-card reveal" id={`product-${prod.id}`}>
{prod.image_url ? (
                         <div className="product-card__img-wrap">
                           <img 
                             src={prod.image_url} 
                             alt={prod.name} 
                             className="product-card__img" 
                             onError={(e) => { e.target.style.display='none'; }}
                           /></div>
                         ) : (
                         <div className="product-card__icon-wrap">
                           <Printer size={32} />
                         </div>
                       )}
                      
                       <div className="product-card__body">
                         <span className="product-card__cat-badge">{prod.category_name}</span>
                         <h3 className="product-card__title">{prod.name}</h3>
                         <p className="product-card__desc">{prod.description || 'Custom professional-grade product printed using top-tier machinery and precision binding.'}</p>

                         {(prod.starting_price || prod.price) && (
                           <div className="product-card__price-row" style={{ margin: 'var(--space-sm) 0', fontWeight: 700, fontSize: '1.05rem', color: 'var(--accent)' }}>
                            Starting from ₹{Number(prod.starting_price || prod.price).toLocaleString('en-IN')}
                          </div>
                        )}

                        {/* Added Product Specs/Badges */}
                        <div className="product-card__specs" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', margin: 'var(--space-sm) 0 var(--space-md)' }}>
                          <span className="badge badge-accent" style={{ fontSize: '9px' }}>{prod.gsm || '300 GSM'}</span>
                          <span className="badge badge-accent" style={{ fontSize: '9px' }}>{prod.finish || 'Premium Finish'}</span>
                          <span className="badge badge-accent" style={{ fontSize: '9px' }}>MOQ: {prod.moq || '50'}</span>
                        </div>

                        <div className="product-actions" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto', width: '100%' }}>
                          <Link
                            to={`/pricing/${prod.id}`}
                            className="btn btn-primary btn-sm btn-full"
                            style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', textDecoration: 'none' }}
                          >
                            View Pricing <ArrowRight size={14} />
                          </Link>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              onClick={() => { addItem({ service: prod.name, quantity: 1, product_id: prod.id }); openCart(); }}
                              className="btn btn-outline btn-sm"
                              style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 8px' }}
                            >
                              Add to Cart
                            </button>
                            <WhatsAppButton
                              phoneNumber="919895410035"
                              productName={prod.name}
                              type="quote"
                              className="btn-sm"
                              style={{ padding: '6px 8px', fontSize: '0.8rem' }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {/* Pagination controls */}
              {totalPages > 1 && (
                <div className="pagination">
                  <button className="pagination__btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                    <button key={p} className={`pagination__btn pagination__btn--num ${p === page ? 'pagination__btn--active' : ''}`} onClick={() => setPage(p)}>{p}</button>
                  ))}
                  <button className="pagination__btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
                </div>
              )}
            </div>

          </div>
        </div>
      </section>
    </div>
  )
}
