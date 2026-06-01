import { useState, useEffect } from 'react';
import { Package, Truck, Store, Check, X, Edit2, Plus, Clock, Search, AlertCircle, Eye } from 'lucide-react';
import api from '../services/api';
import './SampleRequestsCMS.css';

export default function SampleRequestsCMS() {
  const [requests, setRequests] = useState([]);
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('requests'); // 'requests' | 'inventory'
  
  // Search & Filter
  const [reqSearch, setReqSearch] = useState('');
  const [reqFilter, setReqFilter] = useState('All'); // 'All' | 'Pending' | 'Approved' | 'Dispatched' | 'Completed'
  const [invSearch, setInvSearch] = useState('');

  // Selected Request detail Modal
  const [selectedReq, setSelectedReq] = useState(null);
  const [updatingReq, setUpdatingReq] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [notes, setNotes] = useState('');

  // Inventory Modals
  const [editingSample, setEditingSample] = useState(null);
  const [addingSample, setAddingSample] = useState(false);
  
  // Inventory Form states
  const [sampleName, setSampleName] = useState('');
  const [sampleCategory, setSampleCategory] = useState('Paper Stock');
  const [sampleDescription, setSampleDescription] = useState('');
  const [sampleStock, setSampleStock] = useState(50);
  const [sampleActive, setSampleActive] = useState(true);
  const [savingSample, setSavingSample] = useState(false);

  // Fetch initial data
  const fetchData = async () => {
    try {
      setLoading(true);
      const [reqsRes, invRes] = await Promise.all([
        api.get('/admin/sample-requests'),
        api.get('/admin/samples/inventory')
      ]);
      setRequests(reqsRes.data.requests || []);
      setSamples(invRes.data.samples || []);
    } catch (err) {
      console.error('Failed to load admin sample data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Update request status
  const handleUpdateReqStatus = async (e) => {
    e.preventDefault();
    if (!selectedReq) return;
    setUpdatingReq(true);
    try {
      await api.put(`/admin/sample-requests/${selectedReq.id}`, {
        status: newStatus,
        tracking_number: trackingNumber,
        notes: notes
      });
      // Toast notification (simulated via hot-toast if loaded, else standard alert)
      import('react-hot-toast').then(m => m.default.success('Request updated successfully!'));
      setSelectedReq(null);
      fetchData(); // Refresh list
    } catch (err) {
      console.error('Failed to update request:', err);
      alert('Failed to update request.');
    } finally {
      setUpdatingReq(false);
    }
  };

  // Add new sample material
  const handleAddSample = async (e) => {
    e.preventDefault();
    setSavingSample(true);
    try {
      await api.post('/admin/samples/inventory', {
        name: sampleName,
        category: sampleCategory,
        description: sampleDescription,
        stock_quantity: parseInt(sampleStock, 10)
      });
      import('react-hot-toast').then(m => m.default.success('Material added successfully!'));
      setAddingSample(false);
      resetSampleForm();
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to add material.');
    } finally {
      setSavingSample(false);
    }
  };

  // Save edited sample material
  const handleSaveEditSample = async (e) => {
    e.preventDefault();
    if (!editingSample) return;
    setSavingSample(true);
    try {
      await api.put(`/admin/samples/inventory/${editingSample.id}`, {
        name: sampleName,
        category: sampleCategory,
        description: sampleDescription,
        stock_quantity: parseInt(sampleStock, 10),
        is_active: sampleActive
      });
      import('react-hot-toast').then(m => m.default.success('Material updated successfully!'));
      setEditingSample(null);
      resetSampleForm();
      fetchData();
    } catch (err) {
      alert('Failed to save material adjustments.');
    } finally {
      setSavingSample(false);
    }
  };

  const resetSampleForm = () => {
    setSampleName('');
    setSampleCategory('Paper Stock');
    setSampleDescription('');
    setSampleStock(50);
    setSampleActive(true);
  };

  const openEditSample = (sample) => {
    setEditingSample(sample);
    setSampleName(sample.name);
    setSampleCategory(sample.category);
    setSampleDescription(sample.description || '');
    setSampleStock(sample.stock_quantity);
    setSampleActive(sample.is_active === 1);
  };

  const openAddSample = () => {
    resetSampleForm();
    setAddingSample(true);
  };

  const openReqModal = (req) => {
    setSelectedReq(req);
    setNewStatus(req.status);
    setTrackingNumber(req.tracking_number || '');
    setNotes(req.notes || '');
  };

  // Filters
  const filteredRequests = requests.filter(req => {
    const matchesSearch = 
      req.customer_name.toLowerCase().includes(reqSearch.toLowerCase()) ||
      req.customer_phone.includes(reqSearch) ||
      (req.id && String(req.id).includes(reqSearch));
    const matchesFilter = reqFilter === 'All' || req.status === reqFilter;
    return matchesSearch && matchesFilter;
  });

  const filteredSamples = samples.filter(sample => 
    sample.name.toLowerCase().includes(invSearch.toLowerCase()) ||
    sample.category.toLowerCase().includes(invSearch.toLowerCase())
  );

  return (
    <div className="sample-cms reveal revealed">
      <div className="cms-header mb-24">
        <div>
          <h1 className="section-title">Physical Sample Requests</h1>
          <p className="muted">Manage customer material kits and monitor paper stock inventory.</p>
        </div>
        <div className="cms-tabs">
          <button 
            className={`cms-tab-btn ${activeTab === 'requests' ? 'active' : ''}`}
            onClick={() => setActiveTab('requests')}
          >
            Sample Requests ({requests.length})
          </button>
          <button 
            className={`cms-tab-btn ${activeTab === 'inventory' ? 'active' : ''}`}
            onClick={() => setActiveTab('inventory')}
          >
            Inventory Stock ({samples.length})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="cms-loader">
          <div className="small-spinner"></div>
          <span>Loading ledger data...</span>
        </div>
      ) : activeTab === 'requests' ? (
        
        /* ──── REQUESTS VIEW ──── */
        <div className="requests-container stack-md">
          {/* Filters Bar */}
          <div className="filters-bar row gap-md">
            <div className="flex-1 search-wrapper">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder="Search by ID, name or phone number..."
                className="input-field"
                value={reqSearch}
                onChange={(e) => setReqSearch(e.target.value)}
              />
            </div>
            <div style={{ width: 200 }}>
              <select
                className="input-field"
                value={reqFilter}
                onChange={(e) => setReqFilter(e.target.value)}
              >
                <option value="All">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Dispatched">Dispatched</option>
                <option value="Ready for Pickup">Ready for Pickup</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {/* Grid/Table */}
          <div className="table-responsive">
            <table className="cms-table">
              <thead>
                <tr>
                  <th>Request ID</th>
                  <th>Customer Name</th>
                  <th>Contact Phone</th>
                  <th>Method</th>
                  <th>Selected Samples</th>
                  <th>Status</th>
                  <th>Date Requested</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="text-center muted">No sample requests match your filters.</td>
                  </tr>
                ) : (
                  filteredRequests.map(req => (
                    <tr key={req.id}>
                      <td><strong>#{req.id}</strong></td>
                      <td>{req.customer_name}</td>
                      <td>{req.customer_phone}</td>
                      <td>
                        <span className="method-pill">
                          {req.delivery_method === 'Pickup' ? <Store size={14} className="mr-4" /> : <Truck size={14} className="mr-4" />}
                          {req.delivery_method}
                        </span>
                      </td>
                      <td>
                        <span className="samples-badge">
                          {req.samples?.length || 0} Samples
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge status-badge--${req.status.toLowerCase().replace(/ /g, '-')}`}>
                          {req.status}
                        </span>
                      </td>
                      <td>{new Date(req.created_at).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</td>
                      <td>
                        <button 
                          className="btn btn-ghost btn-sm" 
                          onClick={() => openReqModal(req)}
                        >
                          <Eye size={14} className="mr-4" />
                          <span>Details</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      ) : (
        
        /* ──── INVENTORY VIEW ──── */
        <div className="inventory-container stack-md">
          {/* Toolbar */}
          <div className="filters-bar row gap-md items-center">
            <div className="flex-1 search-wrapper">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder="Search material catalog..."
                className="input-field"
                value={invSearch}
                onChange={(e) => setInvSearch(e.target.value)}
              />
            </div>
            <button className="btn btn-primary" onClick={openAddSample}>
              <Plus size={16} className="mr-8" />
              <span>Add New Material</span>
            </button>
          </div>

          {/* Grid */}
          <div className="materials-grid">
            {filteredSamples.map(sample => (
              <div key={sample.id} className={`material-card ${sample.is_active === 0 ? 'inactive' : ''}`}>
                <div className="material-card__header">
                  <span className="material-category">{sample.category}</span>
                  <button className="icon-button" onClick={() => openEditSample(sample)}>
                    <Edit2 size={14} />
                  </button>
                </div>
                <h4 className="material-name">{sample.name}</h4>
                <p className="material-desc">{sample.description || 'No description provided.'}</p>
                <div className="material-card__footer">
                  <div className="stock-level">
                    <span className="muted text-xs">Stock Level:</span>
                    <strong className={sample.stock_quantity <= 10 ? 'text-error' : 'text-success'}>
                      {sample.stock_quantity} remaining
                    </strong>
                  </div>
                  <span className={`status-dot ${sample.is_active === 1 ? 'active' : ''}`}></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ──── REQUEST DETAIL MODAL ──── */}
      {selectedReq && (
        <div className="modal-backdrop">
          <div className="modal modal--large">
            <button className="modal-close" onClick={() => setSelectedReq(null)}><X size={20} /></button>
            <h2>Sample Request details: #{selectedReq.id}</h2>
            <div className="modal-layout mt-16">
              
              <div className="modal-sidebar">
                <h3>Selected Material Kit</h3>
                <ul className="req-materials-list mt-8">
                  {selectedReq.samples?.map(sample => (
                    <li key={sample.sample_id} className="req-material-item">
                      <Package size={16} className="mr-8 text-primary" />
                      <div>
                        <strong>{sample.sample_name}</strong>
                        <span className="block muted text-xs">{sample.sample_category}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="modal-main stack-md">
                <div className="details-card">
                  <h3>Customer Details</h3>
                  <div className="grid grid--2 mt-8">
                    <div>
                      <span className="label muted">Customer Name:</span>
                      <strong>{selectedReq.customer_name}</strong>
                    </div>
                    <div>
                      <span className="label muted">Phone Number:</span>
                      <strong>{selectedReq.customer_phone}</strong>
                    </div>
                    <div>
                      <span className="label muted">Email Address:</span>
                      <span>{selectedReq.customer_email || 'Not provided'}</span>
                    </div>
                    <div>
                      <span className="label muted">Request Date:</span>
                      <span>{new Date(selectedReq.created_at).toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                </div>

                <div className="details-card">
                  <h3>Delivery Information</h3>
                  <div className="mt-8">
                    <div className="row items-center mb-8">
                      <span className="method-pill">
                        {selectedReq.delivery_method === 'Pickup' ? <Store size={14} className="mr-4" /> : <Truck size={14} className="mr-4" />}
                        {selectedReq.delivery_method}
                      </span>
                    </div>
                    {selectedReq.delivery_method === 'Pickup' ? (
                      <p>
                        <strong>Branch for Pickup:</strong> {selectedReq.branch_name || 'Selected branch'}
                      </p>
                    ) : (
                      <div className="shipping-address">
                        <strong>Address:</strong>
                        <p>{selectedReq.address_line1}</p>
                        {selectedReq.address_line2 && <p>{selectedReq.address_line2}</p>}
                        <p>{selectedReq.city}, {selectedReq.state} - <strong>{selectedReq.pincode}</strong></p>
                      </div>
                    )}
                  </div>
                </div>

                {selectedReq.notes && (
                  <div className="details-card">
                    <h3>Project Notes</h3>
                    <p className="note-text mt-8">{selectedReq.notes}</p>
                  </div>
                )}

                <form onSubmit={handleUpdateReqStatus} className="status-update-form stack-sm mt-16">
                  <h3>Action Panel (Update Request)</h3>
                  <div className="row gap-md items-end">
                    <div className="flex-1">
                      <label className="label">Change Status</label>
                      <select
                        className="input-field"
                        value={newStatus}
                        onChange={(e) => setNewStatus(e.target.value)}
                        required
                      >
                        <option value="Pending">Pending</option>
                        <option value="Approved">Approved</option>
                        <option value="Dispatched">Dispatched (Courier Only)</option>
                        <option value="Ready for Pickup">Ready for Pickup (Pickup Only)</option>
                        <option value="Completed">Completed</option>
                        <option value="Cancelled">Cancelled</option>
                      </select>
                    </div>

                    {newStatus === 'Dispatched' && (
                      <div className="flex-2">
                        <label className="label">Carrier Tracking Number (e.g. DTDC #)</label>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="Enter tracking ID"
                          value={trackingNumber}
                          onChange={(e) => setTrackingNumber(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-8">
                    <label className="label">Internal Notes / Tracking Updates</label>
                    <textarea
                      className="input-field textarea"
                      placeholder="Add dispatch logs or pickup location..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>

                  <div className="row end gap-md mt-16">
                    <button type="button" className="btn btn-ghost" onClick={() => setSelectedReq(null)}>Close</button>
                    <button type="submit" className="btn btn-primary" disabled={updatingReq}>
                      {updatingReq ? 'Saving...' : 'Save Updates'}
                    </button>
                  </div>
                </form>

              </div>
            </div>
          </div>
        </div>
      )}

      {/* ──── ADD/EDIT INVENTORY MODAL ──── */}
      {(editingSample || addingSample) && (
        <div className="modal-backdrop">
          <div className="modal">
            <button className="modal-close" onClick={() => { setEditingSample(null); setAddingSample(false); resetSampleForm(); }}><X size={20} /></button>
            <h2>{editingSample ? 'Edit Sample Details' : 'Add New Print Material'}</h2>
            
            <form onSubmit={editingSample ? handleSaveEditSample : handleAddSample} className="stack-md mt-16">
              
              <div>
                <label className="label">Material Name *</label>
                <input
                  type="text"
                  className="input-field"
                  value={sampleName}
                  onChange={(e) => setSampleName(e.target.value)}
                  placeholder="e.g. 350 GSM Velvet Matte Board"
                  required
                />
              </div>

              <div className="row gap-md">
                <div className="flex-2">
                  <label className="label">Category *</label>
                  <select
                    className="input-field"
                    value={sampleCategory}
                    onChange={(e) => setSampleCategory(e.target.value)}
                    required
                  >
                    <option value="Paper Stock">Paper Stock</option>
                    <option value="Special Finish">Special Finish</option>
                    <option value="Business Card Materials">Business Card Materials</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="label">Current Stock *</label>
                  <input
                    type="number"
                    className="input-field"
                    value={sampleStock}
                    onChange={(e) => setSampleStock(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="label">Material Description</label>
                <textarea
                  className="input-field textarea"
                  placeholder="Specify board grain, feel, weight, or special laminations highlights..."
                  value={sampleDescription}
                  onChange={(e) => setSampleDescription(e.target.value)}
                />
              </div>

              {editingSample && (
                <div>
                  <label className="checkbox-container">
                    <input
                      type="checkbox"
                      checked={sampleActive}
                      onChange={(e) => setSampleActive(e.target.checked)}
                    />
                    <span className="checkbox-label">Material Active for Customers to Request</span>
                  </label>
                </div>
              )}

              <div className="row end gap-md mt-16">
                <button 
                  type="button" 
                  className="btn btn-ghost" 
                  onClick={() => { setEditingSample(null); setAddingSample(false); resetSampleForm(); }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingSample}>
                  {savingSample ? 'Saving Material...' : 'Save Material'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
}
