import { useState } from 'react'
import { Search, Package, Clock, CheckCircle2, Truck, AlertCircle, Loader2, Play } from 'lucide-react'
import { trackJob } from '../api'
import toast from 'react-hot-toast'
import './TrackOrder.css'

const statusSteps = ['Received', 'In Progress', 'Quality Check', 'Ready', 'Delivered']

const statusIcons = {
  'Received': <Package size={20} />,
  'In Progress': <Clock size={20} />,
  'Quality Check': <Search size={20} />,
  'Ready': <CheckCircle2 size={20} />,
  'Delivered': <Truck size={20} />,
}

export default function TrackOrder() {
  const [jobCode, setJobCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [jobData, setJobData] = useState(null)
  const [error, setError] = useState('')

  const handleTrack = async (e, codeToTrack = null) => {
    if (e) e.preventDefault()
    const targetCode = (codeToTrack || jobCode).trim()
    
    if (!targetCode) {
      toast.error('Please enter a job code or mobile number')
      return
    }

    setLoading(true)
    setError('')
    setJobData(null)

    try {
      const { data } = await trackJob(targetCode)
      if (data && data.job) {
        setJobData(data.job)
        toast.success('Order found!')
      } else {
        setError('No order found with this detail. Please verify and try again.')
      }
    } catch (err) {
      // If server route is active but returns 404
      if (err.response?.status === 404) {
        // Fallback for demo testing if it fails on live server without test seed
        if (targetCode === '9495177283' || targetCode === 'DEMO-1994') {
          setJobData({
            job_code: 'DEMO-1994',
            customer_name: 'Anil Kumar (Demo)',
            product_name: 'Premium Mementos & Frames',
            quantity: 25,
            branch_name: 'Perambra',
            status: 'Ready',
            created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
            expected_date: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
          })
          toast.success('Loaded sample demo order!')
        } else {
          setError('No active order found with this job code or mobile number.')
        }
      } else {
        setError('Unable to reach the tracking database right now. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleDemo = () => {
    setJobCode('9495177283')
    handleTrack(null, '9495177283')
  }

  const getCurrentStep = (status) => {
    const statusMap = {
      'Pending': 0,
      'New': 0,
      'Received': 0,
      'In Progress': 1,
      'Printing': 1,
      'Processing': 1,
      'Quality Check': 2,
      'Ready': 3,
      'Ready for Delivery': 3,
      'Completed': 3,
      'Delivered': 4,
    }
    return statusMap[status] ?? 0
  }

  return (
    <div className="track-page">
      {/* Header */}
      <section className="page-header" id="track-header">
        <div className="page-header__bg" />
        <div className="container page-header__content">
          <span className="badge badge--primary">Order Tracking</span>
          <h1 className="page-header__title">
            Track Your <span className="text-gradient">Order Status</span>
          </h1>
          <p className="page-header__subtitle">
            Enter your Job Code or registered Mobile Number to see real-time progress.
          </p>
        </div>
      </section>

      {/* Search */}
      <section className="section" id="track-search">
        <div className="container">
          <form className="track-search-box glass-card reveal" onSubmit={(e) => handleTrack(e)} id="track-form">
            <div className="track-search-box__input-wrap">
              <Search size={20} className="track-search-box__icon" />
<input
                 type="text"
                 className="input track-search-box__input"
                 placeholder="Enter Job Code (e.g., PBA-250529-001) or Mobile Number"
                 value={jobCode}
                 onChange={(e) => setJobCode(e.target.value)}
                 id="track-input"
               />
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <button type="submit" className="btn btn-primary" disabled={loading} id="track-submit">
                {loading ? <Loader2 size={18} className="spinning" /> : 'Track Order'}
              </button>
              <button type="button" className="btn btn-outline" onClick={handleDemo} id="track-demo" style={{ whiteSpace: 'nowrap' }}>
                <Play size={14} /> Try Demo
              </button>
            </div>
          </form>

          {/* Error */}
          {error && (
            <div className="track-error" id="track-error">
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          )}

          {/* Skeleton Loader */}
          {loading && (
            <div className="track-result glass-card reveal" style={{ opacity: 0.8 }} id="track-skeleton">
              <div className="track-result__header">
                <div style={{ width: '100%' }}>
                  <div className="skeleton-line" style={{ width: '160px', height: '24px', marginBottom: '8px' }}></div>
                  <div className="skeleton-line" style={{ width: '110px', height: '14px' }}></div>
                </div>
                <div className="skeleton-line" style={{ width: '90px', height: '24px', borderRadius: '12px' }}></div>
              </div>

              {/* Progress Stepper Skeleton */}
              <div className="track-progress" style={{ margin: 'var(--space-2xl) 0' }}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="track-step">
                    <div className="track-step__icon skeleton-circle" style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'transparent' }}></div>
                    <div className="skeleton-line" style={{ width: '50px', height: '10px', marginTop: '8px' }}></div>
                  </div>
                ))}
              </div>

              {/* Details Skeleton */}
              <div className="track-details" style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 'var(--space-xl)' }}>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="track-detail">
                    <div className="skeleton-line" style={{ width: '60px', height: '10px', marginBottom: '6px' }}></div>
                    <div className="skeleton-line" style={{ width: '110px', height: '14px' }}></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Result */}
          {jobData && !loading && (
            <div className="track-result glass-card reveal" id="track-result">
              <div className="track-result__header">
                <div>
                  <h3 className="track-result__code">{jobData.job_code || jobData.id}</h3>
                  <p className="track-result__customer">{jobData.customer_name}</p>
                </div>
                <span className={`badge ${jobData.status === 'Delivered' ? 'badge--success' : 'badge--primary'}`}>
                  {jobData.status}
                </span>
              </div>

              {/* Progress Steps */}
              <div className="track-progress">
                {statusSteps.map((step, i) => {
                  const currentStep = getCurrentStep(jobData.status)
                  const isActive = i <= currentStep
                  const isCurrent = i === currentStep

                  return (
                    <div
                      key={step}
                      className={`track-step ${isActive ? 'track-step--active' : ''} ${isCurrent ? 'track-step--current' : ''}`}
                    >
                      <div className="track-step__icon">
                        {statusIcons[step]}
                      </div>
                      <span className="track-step__label">{step}</span>
                      {i < statusSteps.length - 1 && (
                        <div className={`track-step__line ${isActive ? 'track-step__line--active' : ''}`} />
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Details */}
              <div className="track-details">
                {jobData.product_name && (
                  <div className="track-detail">
                    <span className="track-detail__label">Product</span>
                    <span className="track-detail__value">{jobData.product_name}</span>
                  </div>
                )}
                {jobData.quantity && (
                  <div className="track-detail">
                    <span className="track-detail__label">Quantity</span>
                    <span className="track-detail__value">{jobData.quantity}</span>
                  </div>
                )}
                {jobData.created_at && (
                  <div className="track-detail">
                    <span className="track-detail__label">Order Date</span>
                    <span className="track-detail__value">
                      {new Date(jobData.created_at).toLocaleDateString('en-IN', {
                        year: 'numeric', month: 'short', day: 'numeric'
                      })}
                    </span>
                  </div>
                )}
                {jobData.expected_date && (
                  <div className="track-detail">
                    <span className="track-detail__label">Expected Delivery</span>
                    <span className="track-detail__value">
                      {new Date(jobData.expected_date).toLocaleDateString('en-IN', {
                        year: 'numeric', month: 'short', day: 'numeric'
                      })}
                    </span>
                  </div>
                )}
                {jobData.branch_name && (
                  <div className="track-detail">
                    <span className="track-detail__label">Branch</span>
                    <span className="track-detail__value">{jobData.branch_name}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Help text */}
          {!jobData && !error && !loading && (
            <div className="track-help reveal" id="track-help">
              <h3>Where to find your tracking detail?</h3>
              <p>You can track using your registered <strong>Mobile Number</strong> or the unique <strong>Job Code</strong> printed on your receipt (e.g., PBA-20260527-001 or MPR-20260527-002).</p>
              <p>Can't find your order? Click on the <strong>Try Demo</strong> button above to preview the tracker UX instantly, or <a href="/contact" className="track-help__link">Contact us</a> for manual assistance.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
