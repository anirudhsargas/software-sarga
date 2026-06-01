import { useState, useEffect } from 'react';
import { Layers, Check, Truck, Store, AlertCircle, Plus, Sparkles, Send, PhoneCall } from 'lucide-react';
import SEO from '../components/SEO';
import './SampleRequest.css';

export default function SampleRequest() {
  const [samples, setSamples] = useState([]);
  const [selectedSampleIds, setSelectedSampleIds] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Form fields
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState('Pickup'); // 'Pickup' | 'Courier'
  const [branchId, setBranchId] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('Kerala');
  const [pincode, setPincode] = useState('');
  const [notes, setNotes] = useState('');

  // Submission States
  const [submitting, setSubmitting] = useState(false);
  const [successData, setSuccessData] = useState(null);

  // Fetch samples and branches on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch Samples
        const samplesRes = await fetch('/api/website/samples');
        if (!samplesRes.ok) throw new Error('Failed to fetch print samples');
        const samplesData = await samplesRes.json();
        setSamples(samplesData.samples || []);

        // Fetch Branches
        const branchesRes = await fetch('/api/website/branches');
        if (branchesRes.ok) {
          const branchesData = await branchesRes.json();
          setBranches(branchesData.branches || []);
          if (branchesData.branches?.length > 0) {
            setBranchId(branchesData.branches[0].id);
          }
        }
      } catch (err) {
        setError('Could not connect to Sarga databases. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleToggleSample = (sampleId) => {
    if (selectedSampleIds.includes(sampleId)) {
      setSelectedSampleIds(prev => prev.filter(id => id !== sampleId));
    } else {
      if (selectedSampleIds.length >= 5) {
        // Limit exceeded
        alert('You can select a maximum of 5 print samples to build your kit.');
        return;
      }
      setSelectedSampleIds(prev => [...prev, sampleId]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (selectedSampleIds.length === 0) {
      setError('Please select at least 1 print sample to build your kit.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/website/samples/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_email: customerEmail,
          delivery_method: deliveryMethod,
          branch_id: deliveryMethod === 'Pickup' ? parseInt(branchId, 10) : null,
          address_line1: deliveryMethod === 'Courier' ? addressLine1 : null,
          address_line2: deliveryMethod === 'Courier' ? addressLine2 : null,
          city: deliveryMethod === 'Courier' ? city : null,
          state: deliveryMethod === 'Courier' ? state : null,
          pincode: deliveryMethod === 'Courier' ? pincode : null,
          notes,
          sample_ids: selectedSampleIds
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to submit request.');
      }

      setSuccessData(data);
    } catch (err) {
      setError(err.message || 'An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Group samples by category
  const categories = samples.reduce((acc, sample) => {
    if (!acc[sample.category]) acc[sample.category] = [];
    acc[sample.category].push(sample);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="samples-loading">
        <div className="spinner"></div>
        <p>Loading Sarga print finishes & materials...</p>
      </div>
    );
  }

  if (successData) {
    return (
      <div className="samples-success container">
        <SEO title="Sample Request Submitted - Sarga" description="Your paper samples kit request is successfully submitted!" />
        <div className="success-card reveal revealed">
          <div className="success-icon">
            <Check size={48} />
          </div>
          <h1>Request Submitted Successfully!</h1>
          <p className="success-subtitle">We have queued your custom print sample kit for preparation.</p>
          
          <div className="success-details">
            <div className="detail-row">
              <strong>Request ID:</strong> <span>#{successData.request_id}</span>
            </div>
            <div className="detail-row">
              <strong>Delivery Mode:</strong> <span>{deliveryMethod}</span>
            </div>
            {deliveryMethod === 'Pickup' && (
              <div className="detail-row">
                <strong>Pickup Branch:</strong>{' '}
                <span>
                  {branches.find(b => b.id === parseInt(branchId, 10))?.name || 'Selected Branch'}
                </span>
              </div>
            )}
            <div className="detail-row">
              <strong>Samples Chosen:</strong> <span>{selectedSampleIds.length} items</span>
            </div>
          </div>

          {successData.whatsapp_simulated && (
            <div className="wa-alert-preview">
              <div className="wa-header">
                <PhoneCall size={16} />
                <span>Simulated WhatsApp Confirmation</span>
              </div>
              <p className="wa-message">{successData.whatsapp_simulated.message}</p>
              <span className="wa-badge">Queued via WhatsApp API</span>
            </div>
          )}

          <button className="btn btn-primary" onClick={() => window.location.href = '/'}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="samples-page">
      <SEO 
        title="Request Physical Print Samples - Sarga Printing" 
        description="Select up to 5 paper grades, luxury cards, rustic kraft papers, and special finishes. Get a custom sample kit delivered to North Kerala." 
      />
      
      {/* Hero Header */}
      <header className="samples-hero container">
        <div className="samples-hero__content text-center">
          <span className="badge-pill"><Sparkles size={14} className="mr-4" /> Physical Print Samples</span>
          <h1>Feel Sarga Quality Before You Order</h1>
          <p>
            Choose up to <strong>5 materials and premium finishes</strong> to create your bespoke sample kit.
            Compare weights, textures, lamination layers, and gold foil borders completely free.
          </p>
        </div>
      </header>

      <section className="container builder-section">
        {error && (
          <div className="alert alert--error mb-24">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <div className="builder-layout">
          {/* Catalog Selection */}
          <div className="builder-catalog">
            <h2 className="builder-title">1. Build Your Sample Kit</h2>
            <div className="builder-subtitle mb-16">
              Selected <span>{selectedSampleIds.length}</span> of <span>5</span> maximum samples
            </div>

            {Object.keys(categories).map(catName => (
              <div key={catName} className="category-group mb-32">
                <h3 className="category-heading">{catName}</h3>
                <div className="samples-grid">
                  {categories[catName].map(sample => {
                    const isSelected = selectedSampleIds.includes(sample.id);
                    const isOutOfStock = sample.stock_quantity <= 0;
                    return (
                      <div 
                        key={sample.id} 
                        className={`sample-card ${isSelected ? 'sample-card--selected' : ''} ${isOutOfStock ? 'sample-card--out' : ''}`}
                        onClick={() => !isOutOfStock && handleToggleSample(sample.id)}
                      >
                        <div className="sample-card__header">
                          <span className="sample-card__title">{sample.name}</span>
                          <button 
                            className={`sample-card__btn ${isSelected ? 'sample-card__btn--selected' : ''}`}
                            disabled={isOutOfStock}
                            aria-label={isSelected ? 'Deselect sample' : 'Select sample'}
                          >
                            {isSelected ? <Check size={16} /> : <Plus size={16} />}
                          </button>
                        </div>
                        <p className="sample-card__desc">{sample.description}</p>
                        <div className="sample-card__footer">
                          {isOutOfStock ? (
                            <span className="stock-label out">Out of Stock</span>
                          ) : (
                            <span className="stock-label in">Available</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Delivery and Checkout Form */}
          <div className="builder-checkout">
            <div className="checkout-card glass-panel">
              <h3>2. Choose Delivery Details</h3>
              <form onSubmit={handleSubmit} className="stack-md">
                
                <div>
                  <label className="label" htmlFor="customer-name">Full Name *</label>
                  <input
                    type="text"
                    id="customer-name"
                    className="form-input"
                    placeholder="Enter your name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    required
                  />
                </div>

                <div className="row gap-md">
                  <div className="flex-1">
                    <label className="label" htmlFor="customer-phone">Phone Number (WhatsApp) *</label>
                    <input
                      type="tel"
                      id="customer-phone"
                      className="form-input"
                      placeholder="e.g. +91 98765 43210"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex-1">
                    <label className="label" htmlFor="customer-email">Email Address</label>
                    <input
                      type="email"
                      id="customer-email"
                      className="form-input"
                      placeholder="name@email.com"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Delivery Method *</label>
                  <div className="delivery-toggle-group">
                    <button
                      type="button"
                      className={`delivery-toggle-btn ${deliveryMethod === 'Pickup' ? 'active' : ''}`}
                      onClick={() => setDeliveryMethod('Pickup')}
                    >
                      <Store size={16} />
                      <span>Branch Pickup</span>
                    </button>
                    <button
                      type="button"
                      className={`delivery-toggle-btn ${deliveryMethod === 'Courier' ? 'active' : ''}`}
                      onClick={() => setDeliveryMethod('Courier')}
                    >
                      <Truck size={16} />
                      <span>Courier Delivery</span>
                    </button>
                  </div>
                </div>

                {deliveryMethod === 'Pickup' ? (
                  <div>
                    <label className="label" htmlFor="branch-select">Select Branch *</label>
                    <select
                      id="branch-select"
                      className="form-input"
                      value={branchId}
                      onChange={(e) => setBranchId(e.target.value)}
                      required
                    >
                      {branches.map(branch => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name} Branch
                        </option>
                      ))}
                    </select>
                    <small className="help-text">We will SMS/WhatsApp you when your sample kit is packed and ready for pickup.</small>
                  </div>
                ) : (
                  <div className="stack-sm courier-fields">
                    <div>
                      <label className="label" htmlFor="address-1">Address Line 1 *</label>
                      <input
                        type="text"
                        id="address-1"
                        className="form-input"
                        placeholder="House / Office name, Street name"
                        value={addressLine1}
                        onChange={(e) => setAddressLine1(e.target.value)}
                        required={deliveryMethod === 'Courier'}
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor="address-2">Address Line 2</label>
                      <input
                        type="text"
                        id="address-2"
                        className="form-input"
                        placeholder="Locality, Landmark"
                        value={addressLine2}
                        onChange={(e) => setAddressLine2(e.target.value)}
                      />
                    </div>
                    <div className="row gap-md">
                      <div className="flex-2">
                        <label className="label" htmlFor="city">City / Town *</label>
                        <input
                          type="text"
                          id="city"
                          className="form-input"
                          placeholder="e.g. Perambra"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          required={deliveryMethod === 'Courier'}
                        />
                      </div>
                      <div className="flex-1">
                        <label className="label" htmlFor="pincode">Pincode *</label>
                        <input
                          type="text"
                          id="pincode"
                          className="form-input"
                          placeholder="673525"
                          value={pincode}
                          onChange={(e) => setPincode(e.target.value)}
                          required={deliveryMethod === 'Courier'}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="label" htmlFor="notes">Notes / Special Finishing Queries</label>
                  <textarea
                    id="notes"
                    className="input-field textarea"
                    placeholder="Tell us about your upcoming project (e.g. Wedding invitations, Business cards, brand box packaging) so we can pack the best guides."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>

                <div className="kit-summary-box mb-16">
                  <div className="summary-title">Kit Selection Summary</div>
                  <div className="summary-count">{selectedSampleIds.length} of 5 selected</div>
                  {selectedSampleIds.length === 0 ? (
                    <div className="summary-empty">No samples selected yet. Click sample cards on the left to add materials!</div>
                  ) : (
                    <ul className="summary-list">
                      {selectedSampleIds.map(id => {
                        const s = samples.find(x => x.id === id);
                        return s ? <li key={id}><Check size={12} className="mr-8 text-primary" /> {s.name}</li> : null;
                      })}
                    </ul>
                  )}
                </div>

                <button 
                  type="submit" 
                  className="btn btn-primary btn--full mt-16"
                  disabled={submitting || selectedSampleIds.length === 0}
                >
                  {submitting ? 'Submitting Request...' : (
                    <>
                      <span>Submit Request</span>
                      <Send size={16} className="ml-8" />
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
