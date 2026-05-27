import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, Printer, Package, ChevronRight, Loader2, ArrowRight, ShoppingBag } from 'lucide-react'
import { getCategories, getProducts } from '../api'
import './Products.css'
import { useCart } from '../context/CartContext'

export default function Products() {
  const navigate = useNavigate()
  const { addItem, openCart } = useCart()
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')

  useEffect(() => {
    async function loadData() {
      try {
        const [catRes, prodRes] = await Promise.all([getCategories(), getProducts()])
        if (catRes.data && catRes.data.categories) {
          setCategories(catRes.data.categories)
        }
        if (prodRes.data && prodRes.data.products) {
          setProducts(prodRes.data.products)
        }
      } catch (err) {
        console.error('Failed to load categories or products:', err)
        // Fallback mock products if DB is empty or connection fails in dev env
        setCategories([
          { id: 1, name: 'Digital Printing' },
          { id: 2, name: 'Offset Printing' },
          { id: 3, name: 'Mementos & Frames' },
          { id: 4, name: 'Binding & Finishing' },
        ])
        setProducts([
          { id: 101, name: 'Premium Multi-color Wedding Cards', description: 'Stunning premium wedding card designs on metallic, textured, or handmade boards.', category_name: 'Offset Printing', image_url: '' },
          { id: 102, name: 'Institutional ID Cards & Badges', description: 'Durable thermal printed PVC smartcards and badges with customized printed lanyards.', category_name: 'Digital Printing', image_url: '' },
          { id: 103, name: 'Pre-Inked Professional Rubber Stamps', description: 'Flash pre-inked stamps, automatic self-inking stamps, and standard office seals.', category_name: 'Binding & Finishing', image_url: '' },
          { id: 104, name: 'Custom Appreciation Mementos', description: 'Elegant wooden, crystal, and acrylic trophy mementos crafted for corporate recognition.', category_name: 'Mementos & Frames', image_url: '' },
          { id: 105, name: 'Bulk Product Label Stickers', description: 'Glossy or matte vinyl packaging stickers, die-cut to any shape for product branding.', category_name: 'Digital Printing', image_url: '' },
          { id: 106, name: 'University Thesis Hard Binding', description: 'Premium gold-foil embossing on luxury leatherette hardcover binding for college projects.', category_name: 'Binding & Finishing', image_url: '' },
        ])
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const handleOrder = (productName) => {
    // Navigate to contact form and pre-fill the selected product
    navigate(`/contact?product=${encodeURIComponent(productName)}`)
  }

  // Filter products based on search query and category
  const filteredProducts = products.filter((prod) => {
    const matchesSearch = prod.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          prod.description?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = selectedCategory === 'All' || prod.category_name === selectedCategory
    return matchesSearch && matchesCategory
  })

  return (
    <div className="products-page">
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
            
            {/* Sidebar Categories */}
            <aside className="catalog-sidebar glass-card">
              <h3 className="sidebar-title">Categories</h3>
              <ul className="sidebar-list">
                <li>
                  <button
                    className={`sidebar-btn ${selectedCategory === 'All' ? 'sidebar-btn--active' : ''}`}
                    onClick={() => setSelectedCategory('All')}
                  >
                    All Products
                  </button>
                </li>
                {categories.map((cat) => (
                  <li key={cat.id}>
                    <button
                      className={`sidebar-btn ${selectedCategory === cat.name ? 'sidebar-btn--active' : ''}`}
                      onClick={() => setSelectedCategory(cat.name)}
                    >
                      {cat.name}
                    </button>
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
                />
              </div>

              {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-4xl) 0' }}>
                  <Loader2 size={36} className="spinning" style={{ color: 'var(--accent)' }} />
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="catalog-empty glass-card">
                  <ShoppingBag size={48} style={{ color: 'var(--text-disabled)', marginBottom: 'var(--space-md)' }} />
                  <h3>No Products Found</h3>
                  <p>We couldn't find any products matching your filters. Try adjusting your search query or category.</p>
                </div>
              ) : (
                <div className="products-grid">
                  {filteredProducts.map((prod) => (
                    <div key={prod.id} className="product-card glass-card" id={`product-${prod.id}`}>
                      {prod.image_url ? (
                        <div className="product-card__img-wrap">
                          <img src={prod.image_url} alt={prod.name} className="product-card__img" />
                        </div>
                      ) : (
                        <div className="product-card__icon-wrap">
                          <Printer size={32} />
                        </div>
                      )}
                      
                      <div className="product-card__body">
                        <span className="product-card__cat-badge">{prod.category_name}</span>
                        <h3 className="product-card__title">{prod.name}</h3>
                        <p className="product-card__desc">{prod.description || 'Custom professional-grade product printed using top-tier machinery and precision binding.'}</p>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto', width: '100%' }}>
                          <button
                            onClick={() => { addItem({ service: prod.name, quantity: 1 }); openCart(); }}
                            className="btn btn-primary btn-sm"
                            style={{ width: '100%' }}
                          >
                            Add to Quote Cart
                          </button>
                          <button
                            onClick={() => handleOrder(prod.name)}
                            className="btn btn-outline btn-sm"
                            style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px' }}
                          >
                            Direct Inquiry <ArrowRight size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </section>
    </div>
  )
}
