import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import api from '../api'
import SEO from '../components/SEO'
import toast from 'react-hot-toast'

export default function OrderView() {
  const { orderNumber } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orderNumber) return
    api.get(`/checkout/order/${orderNumber}`)
      .then(res => setOrder(res.data))
      .catch(() => toast.error('Order not found'))
      .finally(() => setLoading(false))
  }, [orderNumber])

  if (loading) return <div className="order-loading" style={{ textAlign: 'center', padding: 80 }}>Loading...</div>
  if (!order) return <div className="order-not-found" style={{ textAlign: 'center', padding: 80 }}>Order not found</div>

  const { order: orderData, transactions } = order
  const items = typeof orderData.items === 'string' ? JSON.parse(orderData.items) : (orderData.items || [])

  const statusBadge = (status) => {
    const colors = { pending: '#f59e0b', confirmed: '#2563eb', processing: '#7c3aed', ready: '#16a34a', completed: '#16a34a', cancelled: '#dc2626' }
    return <span style={{ background: colors[status] || '#64748b', color: '#fff', padding: '4px 12px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 600 }}>{status}</span>
  }

  return (
    <div className="order-view-page" style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <SEO title={`Order #${orderData.order_number} - Sarga Printing`} />

      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Order #{orderData.order_number}</h1>
          <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '4px 0 0' }}>
            Placed on {new Date(orderData.created_at).toLocaleDateString('en-IN', { dateStyle: 'long' })}
          </p>
        </div>
        {statusBadge(orderData.status)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, margin: '0 0 8px', color: '#475569' }}>Customer</h3>
          <p style={{ margin: 0, fontSize: '0.95rem' }}>{orderData.customer_name}</p>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748b' }}>{orderData.customer_phone}</p>
          {orderData.customer_email && <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748b' }}>{orderData.customer_email}</p>}
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, margin: '0 0 8px', color: '#475569' }}>Payment</h3>
          <p style={{ margin: 0, fontSize: '0.95rem' }}>₹{Number(orderData.total).toFixed(2)}</p>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748b' }}>
            {orderData.payment_method === 'full' ? 'Full Payment' : 'Partial (50%)'} — {orderData.payment_status}
          </p>
          {orderData.razorpay_payment_id && (
            <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>Payment ID: {orderData.razorpay_payment_id}</p>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: orderData.gst_number ? '1fr 1fr' : '1fr', gap: 16, marginBottom: 24 }}>
        {orderData.gst_number && (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, margin: '0 0 8px', color: '#475569' }}>GST Details</h3>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>{orderData.gst_number}</p>
            {orderData.billing_address && <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748b' }}>{orderData.billing_address}</p>}
          </div>
        )}
        {orderData.branch_name && (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, margin: '0 0 8px', color: '#475569' }}>Branch</h3>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>{orderData.branch_name}</p>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748b' }}>
              {orderData.delivery_method === 'pickup' ? 'Branch Pickup' : `Courier - ${orderData.delivery_address || ''}`}
            </p>
          </div>
        )}
      </div>

      {/* Order Items */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: 20, borderBottom: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Items ({items.length})</h3>
        </div>
        {items.map((item, i) => (
          <div key={i} style={{ padding: '14px 20px', borderBottom: i < items.length - 1 ? '1px solid #f1f5f9' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{item.product_name || 'Item'}</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Qty: {item.quantity || 1}</div>
            </div>
            <div style={{ fontWeight: 600 }}>₹{Number(item.line_total || item.unit_price * item.quantity || 0).toFixed(2)}</div>
          </div>
        ))}
      </div>

      {/* Download Invoice */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 24 }}>
        <Link
          to={`/api/checkout/order/${orderData.order_number}/invoice`}
          target="_blank"
          className="btn btn-primary"
          style={{ textDecoration: 'none', padding: '10px 24px', borderRadius: 8, fontSize: '0.9rem' }}
        >
          Download GST Invoice
        </Link>
        <button className="btn btn-outline" onClick={() => navigate(-1)} style={{ padding: '10px 24px', borderRadius: 8, fontSize: '0.9rem' }}>
          Back
        </button>
      </div>

      {orderData.notes && (
        <div style={{ background: '#fef9c3', border: '1px solid #facc15', borderRadius: 8, padding: 12, fontSize: '0.85rem', marginBottom: 24 }}>
          <strong>Notes:</strong> {orderData.notes}
        </div>
      )}
    </div>
  )
}
