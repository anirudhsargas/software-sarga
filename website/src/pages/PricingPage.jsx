import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../api'
import PricingCalculator from '../components/PricingCalculator'
import WhatsAppButton from '../components/WhatsAppButton'
import SEO from '../components/SEO'

export default function PricingPage() {
  const { productId } = useParams()
  const [product, setProduct] = useState(null)
  const [express, setExpress] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!productId) return
    setLoading(true)
    api.get('/pricing/products').then(res => {
      const found = res.data.products.find(p => String(p.id) === String(productId))
      if (found) setProduct(found)
    }).catch(() => {}).finally(() => setLoading(false))

    api.get('/pricing/express', { params: { product_id: productId } })
      .then(res => setExpress(res.data))
      .catch(() => {})
  }, [productId])

  if (loading) {
    return <div style={{ maxWidth: 1200, margin: '0 auto', padding: 60, textAlign: 'center' }}>Loading...</div>
  }

  if (!product) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 60, textAlign: 'center' }}>
        <h2>Product not found</h2>
        <Link to="/products" className="btn btn-primary" style={{ marginTop: 16, display: 'inline-block' }}>
          Browse Products
        </Link>
      </div>
    )
  }

  return (
    <div className="pricing-page" style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
      <SEO title={`${product.name} - Pricing - Sarga Printing`} description={product.description} />

      {/* Breadcrumb */}
      <nav style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 24 }}>
        <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <Link to="/products" style={{ color: 'inherit', textDecoration: 'none' }}>Products</Link>
        {' / '}
        <span style={{ color: '#1a1a2e' }}>{product.name}</span>
      </nav>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: 32, alignItems: 'start' }}>
        {/* Product Info */}
        <div>
          {product.image_url && (
            <img
              src={product.image_url}
              alt={product.name}
              style={{ width: '100%', maxHeight: 400, objectFit: 'contain', borderRadius: 12, marginBottom: 24, background: '#f8fafc' }}
              loading="lazy"
            />
          )}
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0 0 8px' }}>{product.name}</h1>
          <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: 8 }}>
            {product.category_name} {'>'} {product.subcategory_name}
          </p>
          {product.size && <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: 8 }}>Standard Size: {product.size}</p>}
          {product.description && (
            <p style={{ lineHeight: 1.7, color: '#334155', marginBottom: 24, whiteSpace: 'pre-wrap' }}>
              {product.description}
            </p>
          )}

          {/* Express Delivery Badges */}
          {express && express.labels?.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
              {express.labels.map((label, i) => (
                <span key={i} style={{
                  background: label.includes('3 Hours') ? '#dc2626' : label.includes('Today') ? '#ea580c' : '#16a34a',
                  color: '#fff', padding: '6px 16px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 600
                }}>
                  {label}
                </span>
              ))}
            </div>
          )}

          {/* WhatsApp Order Button */}
          <div style={{ marginBottom: 24 }}>
            <WhatsAppButton
              phoneNumber="919895410035"
              productName={product.name}
              type="order"
            />
          </div>

          {/* Product Features */}
          {product.tiers?.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 12 }}>Pricing Tiers</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Min Qty</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Max Qty</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Unit Price</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Setup Fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.tiers.map((tier, i) => (
                      <tr key={tier.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 12px' }}>{tier.min_qty}</td>
                        <td style={{ padding: '8px 12px' }}>{tier.max_qty || '∞'}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>₹{Number(tier.unit_price).toFixed(2)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{Number(tier.setup_fee) > 0 ? `₹${Number(tier.setup_fee).toFixed(2)}` : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Pricing Calculator Sidebar */}
        <div style={{ position: 'sticky', top: 100 }}>
          <PricingCalculator product={product} />
        </div>
      </div>
    </div>
  )
}
