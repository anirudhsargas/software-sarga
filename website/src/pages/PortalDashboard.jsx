import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Package, Download, CheckCircle, XCircle, Clock, FileText, Palette, Truck, LogOut, Loader2, Eye } from 'lucide-react'
import api from '../api'
import SEO from '../components/SEO'
import './PortalDashboard.css'

const TABS = [
  { id: 'overview', label: 'Overview', icon: Package },
  { id: 'jobs', label: 'My Orders', icon: FileText },
  { id: 'artworks', label: 'My Artworks', icon: Palette },
  { id: 'proofs', label: 'Proof Approvals', icon: Eye },
  { id: 'samples', label: 'Sample Requests', icon: Truck },
  { id: 'consultations', label: 'Consultations', icon: Clock },
]

export default function PortalDashboard() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({ jobs: [], payments: [] })
  const [artworks, setArtworks] = useState([])
  const [samples, setSamples] = useState([])
  const [consultations, setConsultations] = useState([])

  useEffect(() => {
    const token = localStorage.getItem('sarga_customer_token')
    if (!token) { navigate('/signin'); return }
    loadAll()
  }, [])

  const loadAll = async () => {
    setLoading(true)
    try {
      const customerId = localStorage.getItem('sarga_customer_id')
      if (customerId) {
        const [jobsRes, artRes, sampRes, consulRes] = await Promise.allSettled([
          api.get(`/website/customer/dashboard`),
          api.get('/website/artwork/my-uploads'),
          api.get('/website/sample-requests/my').catch(() => ({ data: { requests: [] } })),
          api.get('/website/design-consultations/my').catch(() => ({ data: { consultations: [] } })),
        ])
        if (jobsRes.status === 'fulfilled') setData(jobsRes.value.data)
        if (artRes.status === 'fulfilled') setArtworks(artRes.value.data.uploads || [])
        if (sampRes.status === 'fulfilled') setSamples(sampRes.value.data.requests || [])
        if (consulRes.status === 'fulfilled') setConsultations(consulRes.value.data.consultations || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    localStorage.removeItem('sarga_customer_token')
    localStorage.removeItem('sarga_customer_id')
    navigate('/')
  }

  const statusBadge = (status) => {
    const colors = {
      'Pending': '#f59e0b', 'Processing': '#3b82f6', 'Completed': '#22c55e', 'Delivered': '#22c55e',
      'Cancelled': '#ef4444', 'Approved': '#22c55e', 'Rejected': '#ef4444', 'uploaded': '#f59e0b',
      'under_review': '#3b82f6', 'proof_sent': '#8b5cf6', 'printing': '#3b82f6',
      'Confirmed': '#22c55e', 'New': '#f59e0b',
    }
    return <span className="portal-badge" style={{ background: (colors[status] || '#6b7280') + '20', color: colors[status] || '#6b7280' }}>{status}</span>
  }

  if (loading) return <div className="portal-loading"><Loader2 size={36} className="spinning" /></div>

  return (
    <div className="portal-page">
      <SEO title="My Dashboard" description="Manage your orders, artwork uploads, proof approvals, sample requests, and design consultations." noindex />
      <div className="portal-header">
        <div className="container">
          <div className="portal-header-inner">
            <h1>My Dashboard</h1>
            <button className="btn btn-outline btn-sm" onClick={logout}><LogOut size={16} /> Logout</button>
          </div>
        </div>
      </div>

      <div className="container portal-layout">
        <aside className="portal-sidebar">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`portal-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <tab.icon size={18} />
              <span>{tab.label}</span>
            </button>
          ))}
        </aside>

        <main className="portal-content">
          {activeTab === 'overview' && (
            <div className="portal-overview">
              <div className="portal-stats">
                <div className="portal-stat-card"><Package size={24} /><div><strong>{data.jobs?.length || 0}</strong><span>Orders</span></div></div>
                <div className="portal-stat-card"><Palette size={24} /><div><strong>{artworks.length}</strong><span>Artworks</span></div></div>
                <div className="portal-stat-card"><Truck size={24} /><div><strong>{samples.length}</strong><span>Samples</span></div></div>
                <div className="portal-stat-card"><Clock size={24} /><div><strong>{consultations.length}</strong><span>Consultations</span></div></div>
              </div>
              <div className="portal-recent">
                <h3>Recent Orders</h3>
                {data.jobs?.slice(0, 5).map(j => (
                  <Link key={j.id} to={`/portal/job/${j.id}`} className="portal-recent-item">
                    <span>{j.job_code || `Order #${j.id}`}</span>
                    {statusBadge(j.status)}
                  </Link>
                ))}
                {(!data.jobs || data.jobs.length === 0) && <p className="portal-empty">No orders yet.</p>}
              </div>
            </div>
          )}

          {activeTab === 'jobs' && (
            <div>
              <h2>My Orders</h2>
              {data.jobs?.length ? (
                <div className="portal-table-wrap">
                  <table className="portal-table">
                    <thead><tr><th>Order ID</th><th>Product</th><th>Quantity</th><th>Status</th><th>Date</th></tr></thead>
                    <tbody>
                      {data.jobs.map(j => (
                        <tr key={j.id}>
                          <td><Link to={`/portal/job/${j.id}`}>{j.job_code || `#${j.id}`}</Link></td>
                          <td>{j.product_name || '-'}</td>
                          <td>{j.quantity || '-'}</td>
                          <td>{statusBadge(j.status)}</td>
                          <td>{new Date(j.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="portal-empty">No orders found.</p>}
            </div>
          )}

          {activeTab === 'artworks' && (
            <div>
              <h2>My Artwork Uploads</h2>
              <Link to="/artwork-upload" className="btn btn-primary btn-sm" style={{ marginBottom: 16 }}>Upload New Artwork</Link>
              {artworks.length ? (
                <div className="portal-table-wrap">
                  <table className="portal-table">
                    <thead><tr><th>Order #</th><th>Product</th><th>Files</th><th>Status</th><th>Date</th></tr></thead>
                    <tbody>
                      {artworks.map(a => (
                        <tr key={a.id}>
                          <td>{a.order_number}</td>
                          <td>{a.product_type || '-'}</td>
                          <td>{a.quantity || '-'}</td>
                          <td>{statusBadge(a.status)}</td>
                          <td>{new Date(a.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="portal-empty">No artwork uploads yet.</p>}
            </div>
          )}

          {activeTab === 'proofs' && (
            <div>
              <h2>Proof Approvals</h2>
              <p className="portal-hint">View and approve proofs for your orders. Navigate to an order detail page to review proofs.</p>
              {data.jobs?.filter(j => j.status === 'Approval Pending').length > 0 ? (
                <div className="portal-table-wrap">
                  <table className="portal-table">
                    <thead><tr><th>Order</th><th>Status</th><th>Action</th></tr></thead>
                    <tbody>
                      {data.jobs.filter(j => j.status === 'Approval Pending').map(j => (
                        <tr key={j.id}>
                          <td>{j.job_code || `#${j.id}`}</td>
                          <td>{statusBadge(j.status)}</td>
                          <td><Link to={`/portal/job/${j.id}`} className="btn btn-sm btn-primary">Review</Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="portal-empty">No proofs pending approval.</p>}
            </div>
          )}

          {activeTab === 'samples' && (
            <div>
              <h2>Sample Requests</h2>
              <Link to="/samples" className="btn btn-primary btn-sm" style={{ marginBottom: 16 }}>Request New Sample</Link>
              {samples.length ? (
                <div className="portal-table-wrap">
                  <table className="portal-table">
                    <thead><tr><th>ID</th><th>Status</th><th>Date</th></tr></thead>
                    <tbody>
                      {samples.map(s => (
                        <tr key={s.id}>
                          <td>#{s.id}</td>
                          <td>{statusBadge(s.status)}</td>
                          <td>{new Date(s.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="portal-empty">No sample requests yet.</p>}
            </div>
          )}

          {activeTab === 'consultations' && (
            <div>
              <h2>Design Consultations</h2>
              <Link to="/book" className="btn btn-primary btn-sm" style={{ marginBottom: 16 }}>Book New Consultation</Link>
              {consultations.length ? (
                <div className="portal-table-wrap">
                  <table className="portal-table">
                    <thead><tr><th>Type</th><th>Mode</th><th>Date</th><th>Status</th></tr></thead>
                    <tbody>
                      {consultations.map(c => (
                        <tr key={c.id}>
                          <td>{c.consultation_type}</td>
                          <td>{c.meeting_mode}</td>
                          <td>{new Date(c.date).toLocaleDateString()}</td>
                          <td>{statusBadge(c.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="portal-empty">No consultations booked yet.</p>}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
