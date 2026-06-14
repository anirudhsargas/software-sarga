import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSEO } from '../hooks/useSEO';
import { Package, Truck, Store, Check, X, Edit2, Plus, Clock, Search, AlertCircle, Eye, Mail } from 'lucide-react';
import api from '../services/api';
import './SampleRequestsCMS.css';

const staggerEnter = (el, i) => {
  if (!el) return;
  el.style.transitionDelay = `${i * 40}ms`;
  requestAnimationFrame(() => el.classList.add('animate-in'));
};

export default React.memo(function SampleRequestsCMS() {
    useSEO('Sample Requests C M S');

  const requestsRef = useRef([]);
  const samplesRef = useRef([]);

  const [requests, setRequests] = useState([]);
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('requests');

  const [reqSearch, setReqSearch] = useState('');
  const [reqFilter, setReqFilter] = useState('All');
  const [invSearch, setInvSearch] = useState('');

  const [selectedReq, setSelectedReq] = useState(null);
  const [updatingReq, setUpdatingReq] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [notes, setNotes] = useState('');

  const [editingSample, setEditingSample] = useState(null);
  const [addingSample, setAddingSample] = useState(false);

  const [sampleName, setSampleName] = useState('');
  const [sampleCategory, setSampleCategory] = useState('Paper Stock');
  const [sampleDescription, setSampleDescription] = useState('');
  const [sampleStock, setSampleStock] = useState(50);
  const [sampleActive, setSampleActive] = useState(true);
  const [savingSample, setSavingSample] = useState(false);

  const reqTableRef = useRef(null);
  const matGridRef = useRef(null);

  const setRequestsSmart = useCallback((data) => {
    const str = JSON.stringify(data);
    if (str !== JSON.stringify(requestsRef.current)) {
      requestsRef.current = data;
      setRequests(data);
    }
  }, []);

  const setSamplesSmart = useCallback((data) => {
    const str = JSON.stringify(data);
    if (str !== JSON.stringify(samplesRef.current)) {
      samplesRef.current = data;
      setSamples(data);
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [reqsRes, invRes] = await Promise.all([
        api.get('/admin/sample-requests'),
        api.get('/admin/samples/inventory')
      ]);
      setRequestsSmart(reqsRes.data.requests || []);
      setSamplesSmart(invRes.data.samples || []);
      setTimeout(() => {
        if (reqTableRef.current) {
          reqTableRef.current.querySelectorAll('tbody tr.stagger-item').forEach(staggerEnter);
        }
        if (matGridRef.current) {
          matGridRef.current.querySelectorAll('.material-card.stagger-item').forEach(staggerEnter);
        }
      }, 50);
    } catch (err) {
      console.error('Failed to load admin sample data:', err);
    } finally {
      setLoading(false);
    }
  }, [setRequestsSmart, setSamplesSmart]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleUpdateReqStatus = useCallback(async (e) => {
    e.preventDefault();
    if (!selectedReq) return;
    setUpdatingReq(true);
    try {
      await api.put(`/admin/sample-requests/${selectedReq.id}`, {
        status: newStatus,
        tracking_number: trackingNumber,
        notes: notes
      });
      import('react-hot-toast').then(m => m.default.success('Request updated successfully!'));
      setSelectedReq(null);
      fetchData();
    } catch (err) {
      console.error('Failed to update request:', err);
      alert('Failed to update request.');
    } finally {
      setUpdatingReq(false);
    }
  }, [selectedReq, newStatus, trackingNumber, notes, fetchData]);

  const handleAddSample = useCallback(async (e) => {
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
  }, [sampleName, sampleCategory, sampleDescription, sampleStock, fetchData]);

  const handleSaveEditSample = useCallback(async (e) => {
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
  }, [editingSample, sampleName, sampleCategory, sampleDescription, sampleStock, fetchData]);

  const resetSampleForm = useCallback(() => {
    setSampleName('');
    setSampleCategory('Paper Stock');
    setSampleDescription('');
    setSampleStock(50);
    setSampleActive(true);
  }, []);

  const openEditSample = useCallback((sample) => {
    setEditingSample(sample);
    setSampleName(sample.name);
    setSampleCategory(sample.category);
    setSampleDescription(sample.description || '');
    setSampleStock(sample.stock_quantity);
    setSampleActive(sample.is_active === 1);
  }, []);

  const openAddSample = useCallback(() => {
    resetSampleForm();
    setAddingSample(true);
  }, [resetSampleForm]);

  const openReqModal = useCallback((req) => {
    setSelectedReq(req);
    setNewStatus(req.status);
    setTrackingNumber(req.tracking_number || '');
    setNotes(req.notes || '');
  }, []);

  const filteredRequests = useMemo(() => requests.filter(req => {
    const matchesSearch =
      req.customer_name.toLowerCase().includes(reqSearch.toLowerCase()) ||
      req.customer_phone.includes(reqSearch) ||
      (req.id && String(req.id).includes(reqSearch));
    const matchesFilter = reqFilter === 'All' || req.status === reqFilter;
    return matchesSearch && matchesFilter;
  }), [requests, reqSearch, reqFilter]);

  const filteredSamples = useMemo(() => samples.filter(sample =>
    sample.name.toLowerCase().includes(invSearch.toLowerCase()) ||
    sample.category.toLowerCase().includes(invSearch.toLowerCase())
  ), [samples, invSearch]);

  return (
    <div className="sample-cms reveal revealed">
      <div className="page-header">
        <div>
          <h1 className="section-title">Sample Requests</h1>
          <p className="page-subtitle">Manage customer material kits and monitor inventory stock.</p>
        </div>
        <div className="cms-tabs">
          <button
            className={`cms-tab-btn ${activeTab === 'requests' ? 'active' : ''}`}
            onClick={() => setActiveTab('requests')}
          >
            Requests ({requests.length})
          </button>
          <button
            className={`cms-tab-btn ${activeTab === 'inventory' ? 'active' : ''}`}
            onClick={() => setActiveTab('inventory')}
          >
            Inventory ({samples.length})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="cms-loader">
          <div className="small-spinner"></div>
          <span>Loading...</span>
        </div>
      ) : activeTab === 'requests' ? (

        <div className="stack-md">
          <div className="filters-bar row gap-md wrap">
            <div className="flex-1" style={{ minWidth: 220 }}>
              <div className="search-wrapper">
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search by ID, name or phone..."
                  className="input-field"
                  value={reqSearch}
                  onChange={(e) => setReqSearch(e.target.value)}
                />
              </div>
            </div>
            <div style={{ width: 190 }}>
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

          <div className="table-responsive" ref={reqTableRef}>
            <table className="cms-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Method</th>
                  <th>Samples</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="text-center muted" style={{ padding: 40 }}>
                      No sample requests match your filters.
                    </td>
                  </tr>
                ) : (
                  filteredRequests.map((req, i) => (
                    <tr key={req.id} className="stagger-item" ref={el => el && staggerEnter(el, i)}>
                      <td><strong>#{req.id}</strong></td>
                      <td>
                        <div className="row gap-sm">
                          <span>{req.customer_name}</span>
                        </div>
                      </td>
                      <td>
                        <span className="text-sm">{req.customer_phone}</span>
                      </td>
                      <td>
                        <span className="method-pill">
                          {req.delivery_method === 'Pickup' ? <Store size={13} /> : <Truck size={13} />}
                          {req.delivery_method}
                        </span>
                      </td>
                      <td>
                        <span className="samples-badge">
                          <Package size={12} className="mr-4" />
                          {req.samples?.length || 0}
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge status-badge--${req.status.toLowerCase().replace(/ /g, '-')}`}>
                          {req.status}
                        </span>
                      </td>
                      <td>
                        <span className="text-sm text-muted">{new Date(req.created_at).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</span>
                      </td>
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => openReqModal(req)}
                        >
                          <Eye size={14} />
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

        <div className="stack-md">
          <div className="filters-bar row gap-md wrap items-center">
            <div className="flex-1" style={{ minWidth: 220 }}>
              <div className="search-wrapper">
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search material catalog..."
                  className="input-field"
                  value={invSearch}
                  onChange={(e) => setInvSearch(e.target.value)}
                />
              </div>
            </div>
            <button className="btn btn-primary" onClick={openAddSample}>
              <Plus size={16} />
              <span>Add Material</span>
            </button>
          </div>

          <div className="materials-grid" ref={matGridRef}>
            {filteredSamples.length === 0 ? (
              <div className="text-center muted" style={{ gridColumn: '1/-1', padding: 60 }}>
                No materials found.
              </div>
            ) : (
              filteredSamples.map((sample, i) => (
                <div
                  key={sample.id}
                  className={`material-card stagger-item ${sample.is_active === 0 ? 'inactive' : ''}`}
                  ref={el => el && staggerEnter(el, i)}
                >
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
                      <span className="text-xs muted">Stock</span>
                      <strong className={sample.stock_quantity <= 10 ? 'text-error' : 'text-success'}>
                        {sample.stock_quantity} remaining
                      </strong>
                    </div>
                    <span className={`status-dot ${sample.is_active === 1 ? 'active' : ''}`} title={sample.is_active === 1 ? 'Active' : 'Inactive'}></span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {selectedReq && (
        <div role="button" tabIndex={0} className="modal-backdrop" onClick={() => setSelectedReq(null)}>
          <div role="button" tabIndex={0} className="modal modal--large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Sample Request #{selectedReq.id}</h2>
              <button className="modal-close" onClick={() => setSelectedReq(null)}><X size={20} /></button>
            </div>
            <div className="modal-layout">
              <div className="modal-sidebar">
                <h3 className="font-semibold mb-8">Selected Materials</h3>
                <ul className="req-materials-list">
                  {selectedReq.samples?.map(sample => (
                    <li key={sample.sample_id} className="req-material-item">
                      <Package size={16} className="text-accent" />
                      <div>
                        <strong>{sample.sample_name}</strong>
                        <span className="block text-xs muted">{sample.sample_category}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="modal-main stack-md">
                <div className="details-card">
                  <h3>Customer Details</h3>
                  <div className="grid grid--2 gap-sm">
                    <div>
                      <span className="text-xs muted">Name</span>
                      <div className="font-semibold">{selectedReq.customer_name}</div>
                    </div>
                    <div>
                      <span className="text-xs muted">Phone</span>
                      <div className="font-semibold row gap-xs">
                        <span>{selectedReq.customer_phone}</span>
                      </div>
                    </div>
                    <div>
                      <span className="text-xs muted">Email</span>
                      <div className="row gap-xs">
                        <Mail size={13} className="text-muted" />
                        <span>{selectedReq.customer_email || 'Not provided'}</span>
                      </div>
                    </div>
                    <div>
                      <span className="text-xs muted">Requested On</span>
                      <div>{new Date(selectedReq.created_at).toLocaleString('en-IN')}</div>
                    </div>
                  </div>
                </div>

                <div className="details-card">
                  <h3>Delivery</h3>
                  <div className="stack-sm">
                    <div className="row gap-sm items-center">
                      <span className="method-pill">
                        {selectedReq.delivery_method === 'Pickup' ? <Store size={13} /> : <Truck size={13} />}
                        {selectedReq.delivery_method}
                      </span>
                    </div>
                    {selectedReq.delivery_method === 'Pickup' ? (
                      <div>
                        <span className="text-xs muted">Branch</span>
                        <div className="font-semibold">{selectedReq.branch_name || 'Selected branch'}</div>
                      </div>
                    ) : (
                      <div className="shipping-address">
                        <span className="text-xs muted">Address</span>
                        <div>{selectedReq.address_line1}</div>
                        {selectedReq.address_line2 && <div>{selectedReq.address_line2}</div>}
                        <div>{selectedReq.city}, {selectedReq.state} - <strong>{selectedReq.pincode}</strong></div>
                      </div>
                    )}
                  </div>
                </div>

                {selectedReq.notes && (
                  <div className="details-card">
                    <h3>Notes</h3>
                    <p className="note-text mt-8">{selectedReq.notes}</p>
                  </div>
                )}

                <div className="details-card">
                  <h3>Update Status</h3>
                  <form onSubmit={handleUpdateReqStatus} className="stack-sm mt-8">
                    <div className="row gap-md items-end wrap">
                      <div className="flex-1" style={{ minWidth: 180 }}>
                        <label className="label">Status</label>
                        <select
                          className="input-field"
                          value={newStatus}
                          onChange={(e) => setNewStatus(e.target.value)}
                          required
                        >
                          <option value="Pending">Pending</option>
                          <option value="Approved">Approved</option>
                          <option value="Dispatched">Dispatched</option>
                          <option value="Ready for Pickup">Ready for Pickup</option>
                          <option value="Completed">Completed</option>
                          <option value="Cancelled">Cancelled</option>
                        </select>
                      </div>
                      {newStatus === 'Dispatched' && (
                        <div className="flex-1" style={{ minWidth: 200 }}>
                          <label className="label">Tracking Number</label>
                          <input
                            type="text"
                            className="input-field"
                            placeholder="e.g. DTDC #12345"
                            value={trackingNumber}
                            onChange={(e) => setTrackingNumber(e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="label">Internal Notes</label>
                      <textarea
                        className="input-field textarea"
                        placeholder="Add dispatch logs or pickup notes..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                    </div>
                    <div className="row end gap-md mt-8">
                      <button type="button" className="btn btn-ghost" onClick={() => setSelectedReq(null)}>Cancel</button>
                      <button type="submit" className="btn btn-primary" disabled={updatingReq}>
                        {updatingReq ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {(editingSample || addingSample) && (
        <div role="button" tabIndex={0} className="modal-backdrop" onClick={() => { setEditingSample(null); setAddingSample(false); resetSampleForm(); }}>
          <div role="button" tabIndex={0} className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingSample ? 'Edit Material' : 'Add New Material'}</h2>
              <button className="modal-close" onClick={() => { setEditingSample(null); setAddingSample(false); resetSampleForm(); }}><X size={20} /></button>
            </div>
            <form onSubmit={editingSample ? handleSaveEditSample : handleAddSample}>
              <div className="modal-body stack-md">
                <div>
                  <label className="label">Material Name</label>
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
                  <div className="flex-2" style={{ minWidth: 0 }}>
                    <label className="label">Category</label>
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
                  <div className="flex-1" style={{ minWidth: 0 }}>
                    <label className="label">Stock</label>
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
                  <label className="label">Description</label>
                  <textarea
                    className="input-field textarea"
                    placeholder="Specify board grain, feel, weight, or special laminations..."
                    value={sampleDescription}
                    onChange={(e) => setSampleDescription(e.target.value)}
                  />
                </div>
                {editingSample && (
                  <label className="checkbox-container">
                    <input
                      type="checkbox"
                      checked={sampleActive}
                      onChange={(e) => setSampleActive(e.target.checked)}
                    />
                    <span className="checkbox-label">Active for customers to request</span>
                  </label>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => { setEditingSample(null); setAddingSample(false); resetSampleForm(); }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingSample}>
                  {savingSample ? 'Saving...' : 'Save Material'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
});
