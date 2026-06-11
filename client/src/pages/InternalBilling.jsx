import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { 
  Receipt, Building2, Plus, X, Loader2, Scan, ShoppingBag, 
  Trash2, ChevronRight, Package, CreditCard, ChevronDown, Check, Search, Info, Camera, FileText
} from 'lucide-react';
import api from '../services/api';
import auth from '../services/auth';
import toast from 'react-hot-toast';
import localDb from '../services/localDb';
import ScannerModal from '../components/ScannerModal';
import InternalUsageReport from './InternalUsageReport';
import './InternalBilling.css';

const MACHINE_TYPES = [
  { key: 'Offset', label: 'Offset', icon: '🖨️' },
  { key: 'Laser', label: 'Laser', icon: '⚡' },
  { key: 'Other', label: 'Other', icon: '📦' }
];

const InternalBilling = () => {
  const [moduleTab, setModuleTab] = useState('entry'); // 'entry' | 'reports'
  const user = auth.getUser();
  const isAdmin = user?.role === 'Admin' || user?.role === 'Accountant';
  const myBranchId = user?.branch_id;

  // Selection states
  const [branchSelectionType, setBranchSelectionType] = useState('own'); // 'own' | 'other'
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState(isAdmin ? '' : myBranchId);
  const [machineType, setMachineType] = useState('Offset');
  
  // Data states
  const [hierarchy, setHierarchy] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [internalCustomers, setInternalCustomers] = useState([]);
  
  // Product selection states
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [qty, setQty] = useState(1);
  
  // Quick enter state
  const [quickName, setQuickName] = useState('');
  const [quickAmount, setQuickAmount] = useState('');

  // Bill lines
  const [orderLines, setOrderLines] = useState([]);

  // Scanning state
  const [qrInput, setQrInput] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const qrInputRef = useRef(null);
  const prevBranchesRef = useRef(null);
  const prevHierarchyRef = useRef(null);
  const prevCustomersRef = useRef(null);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const fetchInitialData = useCallback(async () => {
    try {
      setLoading(true);
      const [branchRes, products, custRes] = await Promise.all([
        api.get('/branches'),
        localDb.getProducts(),
        api.get('/customers', { params: { client_type: 'internal', limit: 1000 } })
      ]);
      
      const newBranches = branchRes.data || [];
      if (JSON.stringify(newBranches) !== JSON.stringify(prevBranchesRef.current)) {
        prevBranchesRef.current = newBranches;
        setBranches(newBranches);
      }
      
      const newHierarchy = products || [];
      if (JSON.stringify(newHierarchy) !== JSON.stringify(prevHierarchyRef.current)) {
        prevHierarchyRef.current = newHierarchy;
        setHierarchy(newHierarchy);
      }
      
      const custData = custRes.data?.data || custRes.data || [];
      if (JSON.stringify(custData) !== JSON.stringify(prevCustomersRef.current)) {
        prevCustomersRef.current = custData;
        setInternalCustomers(custData);
      }
      
      if (products?.length > 0) {
        setSelectedCategoryId(products[0].id);
      }
    } catch (err) {
      console.error('Failed to load initial data', err);
      toast.error('Failed to load master data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Branch filtering logic
  const filteredBranches = useMemo(() => {
    if (branchSelectionType === 'own') {
      return branches.filter(b => String(b.id) === String(myBranchId));
    }
    return branches.filter(b => String(b.id) !== String(myBranchId));
  }, [branches, branchSelectionType, myBranchId]);

  useEffect(() => {
    if (branchSelectionType === 'own') {
      setSelectedBranchId(myBranchId);
    } else if (filteredBranches.length > 0 && !filteredBranches.find(b => String(b.id) === String(selectedBranchId))) {
      setSelectedBranchId(filteredBranches[0].id);
    }
  }, [branchSelectionType, filteredBranches, myBranchId, selectedBranchId]);

  // Derive target internal customer
  const targetCustomer = useMemo(() => {
    if (!selectedBranchId) return null;
    const branch = branches.find(b => String(b.id) === String(selectedBranchId));
    if (!branch) return null;

    const searchName = `${branch.name} - ${machineType}`.toLowerCase();
    const match = internalCustomers.find(c => 
      c.name.toLowerCase().includes(searchName) || 
      (String(c.branch_id) === String(selectedBranchId) && c.name.toLowerCase().includes(machineType.toLowerCase()))
    );

    return match || { id: 'NEW', name: `${branch.name} - ${machineType}`, branch_id: selectedBranchId };
  }, [selectedBranchId, machineType, branches, internalCustomers]);

  // Product hierarchy navigation
  const categories = hierarchy || [];
  const selectedCategory = categories.find(c => String(c.id) === String(selectedCategoryId));
  const subcategories = selectedCategory?.subcategories || [];
  const selectedSubcategory = subcategories.find(s => String(s.id) === String(selectedSubcategoryId));
  const products = selectedSubcategory?.products || [];

  useEffect(() => {
    if (subcategories.length > 0 && !subcategories.find(s => String(s.id) === String(selectedSubcategoryId))) {
      setSelectedSubcategoryId(subcategories[0].id);
    }
  }, [selectedCategoryId, subcategories, selectedSubcategoryId]);

  const addProductToBill = useCallback((prod) => {
    if (!prod) return;
    const price = parseFloat(prod.sell_price) || 0;
    const line = {
      id: `${prod.id}-${Date.now()}`,
      product_id: prod.id,
      product_name: prod.name,
      category: selectedCategory?.name || '',
      subcategory: selectedSubcategory?.name || '',
      quantity: Number(qty) || 1,
      unit_price: price,
      total_amount: price * (Number(qty) || 1),
      book_type: machineType
    };
    setOrderLines(prev => [...prev, line]);
    setQty(1);
    setSelectedProduct(null);
    toast.success(`Added ${prod.name}`);
  }, [selectedCategory, selectedSubcategory, qty, machineType]);

  const addQuickItem = useCallback(() => {
    if (!quickName.trim()) { toast.error('Enter item name'); return; }
    const amt = parseFloat(quickAmount);
    if (isNaN(amt) || amt <= 0) { toast.error('Enter valid amount'); return; }

    const line = {
      id: `quick-${Date.now()}`,
      product_id: null,
      product_name: quickName,
      category: 'Internal',
      subcategory: 'Quick',
      quantity: Number(qty) || 1,
      unit_price: amt,
      total_amount: amt * (Number(qty) || 1),
      book_type: machineType
    };
    setOrderLines(prev => [...prev, line]);
    setQuickName('');
    setQuickAmount('');
    toast.success(`Added ${quickName}`);
  }, [quickName, quickAmount, qty, machineType]);

  const qrLookupMap = useMemo(() => {
    const map = new Map();
    hierarchy.forEach(cat => {
      (cat.subcategories || []).forEach(sub => {
        (sub.products || []).forEach(prod => {
          const code = String(prod.product_code || '').trim().toUpperCase();
          if (code) map.set(code, { product: prod, catId: cat.id, subId: sub.id });
        });
      });
    });
    return map;
  }, [hierarchy]);

  const handleQrInput = useCallback((e) => {
    const val = e.target.value;
    setQrInput(val);
    const code = val.trim().toUpperCase();
    processScannedCode(code);
  }, [processScannedCode]);

  const processScannedCode = useCallback((code) => {
    if (!code) return;
    if (qrLookupMap.has(code)) {
      const entry = qrLookupMap.get(code);
      setSelectedCategoryId(entry.catId);
      setSelectedSubcategoryId(entry.subId);
      setSelectedProduct(entry.product);
      setQty(1);
      setQrInput('');
      return true;
    }
    return false;
  }, [qrLookupMap]);

  const removeLine = (id) => setOrderLines(prev => prev.filter(l => l.id !== id));
  
  const totalAmount = useMemo(() => orderLines.reduce((s, l) => s + (l.total_amount || 0), 0), [orderLines]);

  const handleSubmit = useCallback(async () => {
    if (!targetCustomer) { toast.error('Target customer not identified'); return; }
    if (orderLines.length === 0) { toast.error('Add at least one item'); return; }

    const payload = {
      customer_id: targetCustomer.id === 'NEW' ? null : targetCustomer.id,
      customer_name: targetCustomer.name,
      customer_mobile: null,
      is_internal: 1,
      internal_department: `${machineType}-${selectedBranchId}`,
      total_amount: totalAmount,
      net_amount: totalAmount,
      bill_amount: totalAmount,
      advance_paid: totalAmount,
      payment_method: 'Internal',
      order_lines: orderLines.map(l => ({
        product_id: l.product_id,
        product_name: l.product_name,
        quantity: l.quantity,
        unit_price: l.unit_price,
        total_amount: l.total_amount,
        description: `${l.category} > ${l.subcategory}`
      })),
      book_type: machineType,
      branch_id: myBranchId,
      target_branch_id: selectedBranchId
    };

    setSaving(true);
    try {
      await api.post('/customer-payments', payload);
      toast.success('Internal bill recorded successfully');
      setOrderLines([]);
    } catch (err) {
      console.error('Submit failed', err);
      toast.error(err.response?.data?.message || 'Failed to save internal bill');
    } finally {
      setSaving(false);
    }
  }, [targetCustomer, orderLines, totalAmount, machineType, selectedBranchId, myBranchId]);

  if (loading) return <div className="panel flex-center loading-container"><Loader2 className="animate-spin" size={32} /></div>;

  return (
    <div className="stack-lg">
      <div className="internal-ops-header">
        <div className="internal-ops-header__content">
          <div className="stack-xs">
            <h1><Receipt size={32} /> Internal Operations</h1>
            <p>Manage internal departmental billing and usage analytics</p>
          </div>
          <div className="internal-ops-header__badge">
            <div className="badge badge--white-transparent">
               <Building2 size={16} />
               {branches.find(b => String(b.id) === String(myBranchId))?.name || 'Main Branch'}
            </div>
          </div>
        </div>
      </div>

      <div className="module-tabs">
        <button 
          className={`btn ${moduleTab === 'entry' ? 'btn-primary' : 'btn-ghost'} module-tab`} 
          onClick={() => setModuleTab('entry')}
        >
          <Plus size={18} /> Billing Entry
        </button>
        <button 
          className={`btn ${moduleTab === 'reports' ? 'btn-primary' : 'btn-ghost'} module-tab`} 
          onClick={() => setModuleTab('reports')}
        >
          <FileText size={18} /> Usage Reports
        </button>
      </div>

      {moduleTab === 'reports' ? (
        <div className="fade-in">
          <InternalUsageReport />
        </div>
      ) : (
        <div className="fade-in internal-billing-grid">
          <div className="stack-md">
            <div className="panel stack-md panel--primary-border">
              <div className="form-row--2">
                <div className="stack-xs" style={{ flex: 1 }}>
                  <label className="label">Transfer Type</label>
                  <div className="mode-switch">
                    <button 
                      className={`btn ${branchSelectionType === 'own' ? 'btn-primary' : 'btn-ghost'}`} 
                      style={{ flex: 1, height: 40 }}
                      onClick={() => setBranchSelectionType('own')}
                    >
                      Own Branch
                    </button>
                    <button 
                      className={`btn ${branchSelectionType === 'other' ? 'btn-primary' : 'btn-ghost'}`} 
                      style={{ flex: 1, height: 40 }}
                      onClick={() => setBranchSelectionType('other')}
                    >
                      Other Branch
                    </button>
                  </div>
                </div>

                <div className="stack-xs" style={{ flex: 1 }}>
                  <label className="label">Target Machine/Dept</label>
                  <div className="mode-switch">
                    {MACHINE_TYPES.map(m => (
                      <button 
                        key={m.key}
                        className={`btn ${machineType === m.key ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ flex: 1, height: 40, padding: '0 8px' }}
                        onClick={() => setMachineType(m.key)}
                      >
                        <span style={{ marginRight: 6 }}>{m.icon}</span> {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="form-row--2">
                <div className="stack-xs">
                  <label className="label">Select Branch</label>
                  {branchSelectionType === 'own' ? (
                     <div className="input-field flex-center-y input-field--readonly">
                       <Building2 size={14} />
                       {branches.find(b => String(b.id) === String(myBranchId))?.name || 'My Branch'}
                     </div>
                  ) : (
                    <select 
                      className="input-field" 
                      value={selectedBranchId} 
                      onChange={e => setSelectedBranchId(e.target.value)}
                    >
                      {filteredBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  )}
                </div>
                <div className="stack-xs">
                  <label className="label">Billing Name (Calculated)</label>
                  <div className="input-field flex-center-y input-field--readonly input-field--primary">
                     {targetCustomer?.name || '...'}
                  </div>
                </div>
              </div>
            </div>

            <div className="panel stack-md">
              <div className="panel-header panel-header--with-actions">
                <h3><ShoppingBag size={18} /> Add Items</h3>
                <div className="qr-input-group">
                  <div className="qr-input-wrapper">
                    <Search size={14} className="search-input-icon search-input-icon--small" />
                    <input 
                      ref={qrInputRef}
                      className="input-field input-field--qr" 
                      placeholder="Scan QR or code..." 
                      value={qrInput}
                      onChange={handleQrInput}
                    />
                  </div>
                  <button 
                    type="button" 
                    className="btn btn-ghost btn-icon btn-icon--square" 
                    onClick={() => setShowScanner(true)}
                  >
                    <Camera size={18} />
                  </button>
                </div>
              </div>

              <div className="form-row--3">
                <div className="stack-xs">
                  <label className="label-sm">Category</label>
                  <select 
                    className="input-field" 
                    value={selectedCategoryId} 
                    onChange={e => {
                      setSelectedCategoryId(e.target.value);
                      const cat = categories.find(c => String(c.id) === String(e.target.value));
                      if (cat?.subcategories?.length > 0) {
                        setSelectedSubcategoryId(cat.subcategories[0].id);
                      } else {
                        setSelectedSubcategoryId('');
                      }
                      setSelectedProduct(null);
                    }}
                  >
                     <option value="">Select category...</option>
                     {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="stack-xs">
                  <label className="label-sm">Subcategory</label>
                  <select 
                    className="input-field" 
                    value={selectedSubcategoryId} 
                    onChange={e => {
                      setSelectedSubcategoryId(e.target.value);
                      setSelectedProduct(null);
                    }}
                    disabled={!selectedSubcategoryId}
                  >
                     <option value="">Select subcategory...</option>
                     {subcategories.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="stack-xs">
                  <label className="label-sm">Product</label>
                  <select 
                    className="input-field" 
                    value={selectedProduct?.id || ''} 
                    onChange={e => {
                      const prod = products.find(p => String(p.id) === String(e.target.value));
                      setSelectedProduct(prod || null);
                      if (prod) setQty(1);
                    }}
                    disabled={!selectedSubcategoryId}
                  >
                      <option value="">Select product...</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name} (₹{p.sell_price})</option>)}
                  </select>
                </div>
              </div>

              {selectedProduct && (
                <div className="panel panel--selected-product stack-sm">
                  <div className="selected-product-header">
                    <div className="stack-xs">
                      <span className="selected-product-label">Configure Selection</span>
                      <span className="selected-product-name">{selectedProduct.name}</span>
                    </div>
                    <div className="selected-product-price">
                      <div className="selected-product-price__label">Unit Price</div>
                      <div className="selected-product-price__value">₹{selectedProduct.sell_price}</div>
                    </div>
                  </div>
                  
                  <div className="product-action-row">
                    <div className="stack-xs" style={{ width: 120 }}>
                      <label className="label-sm">Quantity</label>
                      <input 
                        type="number" 
                        className="input-field input-field--quantity" 
                        value={qty} 
                        onChange={e => setQty(e.target.value)} 
                        min="1" 
                        autoFocus 
                      />
                    </div>
                    <div className="stack-xs" style={{ flex: 1 }}>
                      <label className="label-sm">Total for this item</label>
                      <div className="input-field flex-center-y input-field--total">
                        ₹{(Number(selectedProduct.sell_price) * (Number(qty) || 1)).toLocaleString()}
                      </div>
                    </div>
                    <div className="product-action-buttons">
                      <button className="btn btn-primary btn--standard" onClick={() => addProductToBill(selectedProduct)}>
                        <Plus size={18} /> Add To Bill
                      </button>
                      <button className="btn btn-ghost btn-icon--square" onClick={() => setSelectedProduct(null)}>
                        <X size={20} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="quick-entry-section">
                 <div className="stack-xs">
                   <label className="label-sm">Quick Manual Entry</label>
                   <div className="quick-entry-row">
                      <input className="input-field quick-entry-name" placeholder="Item name..." value={quickName} onChange={e => setQuickName(e.target.value)} />
                      <div className="quick-entry-inputs">
                        <input type="number" className="input-field" placeholder="Price" value={quickAmount} onChange={e => setQuickAmount(e.target.value)} />
                        <input type="number" className="input-field" placeholder="Qty" value={qty} onChange={e => setQty(e.target.value)} min="1" />
                      </div>
                      <button className="btn btn-ghost btn-primary-hover btn-icon--square" onClick={addQuickItem} title="Quick Add">
                        <Check size={20} />
                      </button>
                   </div>
                 </div>
              </div>
            </div>

            <div className="panel stack-sm panel--line-items">
              <div className="line-items-header">
                <h4>Line Items ({orderLines.length})</h4>
                <span className="line-items-total">Total: ₹{totalAmount.toLocaleString()}</span>
              </div>
              <div className="line-items-body">
                {orderLines.length === 0 ? (
                  <div className="line-items-empty">
                    <Package size={48} />
                    <p>No items added yet. Use the selectors above to add products.</p>
                  </div>
                ) : (
                  <table className="table line-items-table">
                    <thead>
                      <tr>
                        <th>Item Details</th>
                        <th className="text-right" style={{ width: 80 }}>Qty</th>
                        <th className="text-right" style={{ width: 100 }}>Price</th>
                        <th className="text-right" style={{ width: 100 }}>Total</th>
                        <th className="text-center" style={{ width: 50 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderLines.map(line => (
                        <tr key={line.id}>
                          <td>
                            <div className="font-semibold">{line.product_name}</div>
                            <div className="text-xs muted">{line.category} › {line.subcategory}</div>
                          </td>
                          <td className="text-right">{line.quantity}</td>
                          <td className="text-right">₹{line.unit_price}</td>
                          <td className="text-right font-bold">₹{line.total_amount}</td>
                          <td className="text-center">
                            <button className="btn btn-ghost btn-icon text-danger" onClick={() => removeLine(line.id)}>
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          <div className="stack-md summary-panel">
            <div className="panel stack-md panel--primary-border">
              <h3>Summary</h3>
              <div className="stack-sm summary-details">
                <div className="summary-row">
                  <span className="summary-label">Subtotal</span>
                  <span>₹{totalAmount.toLocaleString()}</span>
                </div>
                <div className="summary-divider"></div>
                <div className="summary-row summary-row--total">
                  <span>Total</span>
                  <span className="summary-total-value">₹{totalAmount.toLocaleString()}</span>
                </div>
              </div>

              <div className="panel panel--info">
                 <div className="info-row">
                   <Info size={16} />
                   <div className="info-text">
                     Targeting <strong>{targetCustomer?.name}</strong>. The bill will be recorded as an internal transfer.
                   </div>
                 </div>
              </div>

              <button 
                className="btn btn-primary btn--full btn--large btn-with-icon" 
                disabled={saving || orderLines.length === 0}
                onClick={handleSubmit}
              >
                {saving ? <Loader2 className="animate-spin" size={20} /> : <CreditCard size={20} />}
                Record Internal Bill
              </button>
            </div>
          </div>
        </div>
      )}

      <ScannerModal 
        isOpen={showScanner} 
        onClose={() => setShowScanner(false)} 
        onScan={(code) => {
          const found = processScannedCode(code);
          if (!found) toast.error('Product not found for this code');
          setShowScanner(false);
        }}
      />
    </div>
  );
};

export default React.memo(InternalBilling);
