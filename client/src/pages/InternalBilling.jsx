import React, { useEffect, useState, useMemo, useRef } from 'react';
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

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const [branchRes, products, custRes] = await Promise.all([
        api.get('/branches'),
        localDb.getProducts(),
        api.get('/customers', { params: { client_type: 'internal', limit: 1000 } })
      ]);
      
      setBranches(branchRes.data || []);
      setHierarchy(products || []);
      
      const custData = custRes.data?.data || custRes.data || [];
      setInternalCustomers(custData);
      
      if (products?.length > 0) {
        setSelectedCategoryId(products[0].id);
      }
    } catch (err) {
      console.error('Failed to load initial data', err);
      toast.error('Failed to load master data');
    } finally {
      setLoading(false);
    }
  };

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

  const addProductToBill = (prod) => {
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
  };

  const addQuickItem = () => {
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
  };

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

  const handleQrInput = (e) => {
    const val = e.target.value;
    setQrInput(val);
    const code = val.trim().toUpperCase();
    processScannedCode(code);
  };

  const processScannedCode = (code) => {
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
  };

  const removeLine = (id) => setOrderLines(prev => prev.filter(l => l.id !== id));
  
  const totalAmount = orderLines.reduce((s, l) => s + (l.total_amount || 0), 0);

  const handleSubmit = async () => {
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
  };

  if (loading) return <div className="panel flex-center" style={{ minHeight: 400 }}><Loader2 className="animate-spin" size={32} /></div>;

  return (
    <div className="stack-lg">
      <div className="panel appearance-none" style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)', color: 'white', border: 'none', padding: '24px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="stack-xs">
            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 14 }}>
              <Receipt size={32} /> Internal Operations
            </h1>
            <p style={{ opacity: 0.9, margin: 0, fontSize: '1rem' }}>Manage internal departmental billing and usage analytics</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="badge" style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', padding: '6px 14px', fontSize: '0.9rem' }}>
               <Building2 size={16} style={{ marginRight: 8 }} />
               {branches.find(b => String(b.id) === String(myBranchId))?.name || 'Main Branch'}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, backgroundColor: 'var(--bg-secondary)', padding: 6, borderRadius: 16, width: 'fit-content', border: '1px solid var(--border)' }}>
        <button 
          className={`btn ${moduleTab === 'entry' ? 'btn-primary' : 'btn-ghost'}`} 
          style={{ borderRadius: 12, padding: '10px 24px', flex: 1, minWidth: 160, display: 'flex', gap: 10, fontWeight: 700 }}
          onClick={() => setModuleTab('entry')}
        >
          <Plus size={18} /> Billing Entry
        </button>
        <button 
          className={`btn ${moduleTab === 'reports' ? 'btn-primary' : 'btn-ghost'}`} 
          style={{ borderRadius: 12, padding: '10px 24px', flex: 1, minWidth: 160, display: 'flex', gap: 10, fontWeight: 700 }}
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
        <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, alignItems: 'start' }}>
          <div className="stack-md">
            <div className="panel stack-md" style={{ borderTop: '4px solid var(--primary)' }}>
              <div style={{ display: 'flex', gap: 24 }}>
                <div className="stack-xs" style={{ flex: 1 }}>
                  <label className="label">Transfer Type</label>
                  <div style={{ display: 'flex', backgroundColor: 'var(--bg-secondary)', borderRadius: 12, padding: 4, gap: 4 }}>
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
                  <div style={{ display: 'flex', backgroundColor: 'var(--bg-secondary)', borderRadius: 12, padding: 4, gap: 4 }}>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="stack-xs">
                  <label className="label">Select Branch</label>
                  {branchSelectionType === 'own' ? (
                     <div className="input-field flex-center-y" style={{ background: 'var(--bg-secondary)', fontWeight: 600 }}>
                       <Building2 size={14} style={{ marginRight: 8 }} />
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
                  <div className="input-field flex-center-y" style={{ background: 'var(--bg-secondary)', color: 'var(--primary)', fontWeight: 700 }}>
                     {targetCustomer?.name || '...'}
                  </div>
                </div>
              </div>
            </div>

            <div className="panel stack-md">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ShoppingBag size={18} /> Add Items
                </h3>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ position: 'relative', width: 200 }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                    <input 
                      ref={qrInputRef}
                      className="input-field" 
                      placeholder="Scan QR or code..." 
                      style={{ paddingLeft: 32, height: 36 }}
                      value={qrInput}
                      onChange={handleQrInput}
                    />
                  </div>
                  <button 
                    type="button" 
                    className="btn btn-ghost btn-icon" 
                    style={{ height: 36, width: 36, backgroundColor: 'var(--bg-secondary)' }}
                    onClick={() => setShowScanner(true)}
                  >
                    <Camera size={18} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr', gap: 12 }}>
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
                <div className="panel appearance-none stack-sm" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--primary)', borderRadius: 12, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div className="stack-xs">
                      <span style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>Configure Selection</span>
                      <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>{selectedProduct.name}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase' }}>Unit Price</div>
                      <div style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '1.1rem' }}>₹{selectedProduct.sell_price}</div>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
                    <div className="stack-xs" style={{ width: 120 }}>
                      <label className="label-sm">Quantity</label>
                      <input 
                        type="number" 
                        className="input-field" 
                        value={qty} 
                        onChange={e => setQty(e.target.value)} 
                        min="1" 
                        autoFocus 
                        style={{ height: 44, fontSize: '1.1rem', fontWeight: 700 }}
                      />
                    </div>
                    <div className="stack-xs" style={{ flex: 1 }}>
                      <label className="label-sm">Total for this item</label>
                      <div className="input-field flex-center-y" style={{ height: 44, background: 'var(--bg-3)', fontWeight: 800, fontSize: '1.2rem', color: 'var(--primary)' }}>
                        ₹{(Number(selectedProduct.sell_price) * (Number(qty) || 1)).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary" style={{ height: 44, padding: '0 24px', fontWeight: 700 }} onClick={() => addProductToBill(selectedProduct)}>
                        <Plus size={18} style={{ marginRight: 8 }} /> Add To Bill
                      </button>
                      <button className="btn btn-ghost" style={{ height: 44, width: 44, padding: 0 }} onClick={() => setSelectedProduct(null)}>
                        <X size={20} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                 <div className="stack-xs">
                   <label className="label-sm">Quick Manual Entry</label>
                   <div style={{ display: 'flex', gap: 12 }}>
                      <input className="input-field" style={{ flex: 2 }} placeholder="Item name..." value={quickName} onChange={e => setQuickName(e.target.value)} />
                      <div style={{ display: 'flex', flex: 1.5, gap: 8 }}>
                        <input type="number" className="input-field" placeholder="Price" value={quickAmount} onChange={e => setQuickAmount(e.target.value)} />
                        <input type="number" className="input-field" placeholder="Qty" value={qty} onChange={e => setQty(e.target.value)} min="1" />
                      </div>
                      <button className="btn btn-ghost btn-primary-hover" style={{ width: 44, height: 44 }} onClick={addQuickItem} title="Quick Add">
                        <Check size={20} />
                      </button>
                   </div>
                 </div>
              </div>
            </div>

            <div className="panel stack-sm" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-secondary)' }}>
                <h4 style={{ margin: 0, fontWeight: 700 }}>Line Items ({orderLines.length})</h4>
                <span style={{ fontWeight: 800, color: 'var(--primary)' }}>Total: ₹{totalAmount.toLocaleString()}</span>
              </div>
              <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                {orderLines.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                    <Package size={48} style={{ opacity: 0.1, marginBottom: 16 }} />
                    <p>No items added yet. Use the selectors above to add products.</p>
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: 'var(--bg-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: 1 }}>
                      <tr>
                        <th style={{ padding: '8px 16px', textAlign: 'left' }}>Item Details</th>
                        <th style={{ padding: '8px 16px', textAlign: 'right', width: 80 }}>Qty</th>
                        <th style={{ padding: '8px 16px', textAlign: 'right', width: 100 }}>Price</th>
                        <th style={{ padding: '8px 16px', textAlign: 'right', width: 100 }}>Total</th>
                        <th style={{ padding: '8px 16px', textAlign: 'center', width: 50 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderLines.map(line => (
                        <tr key={line.id} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontWeight: 600 }}>{line.product_name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{line.category} › {line.subcategory}</div>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>{line.quantity}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>₹{line.unit_price}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700 }}>₹{line.total_amount}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <button className="btn btn-ghost btn-icon" style={{ color: 'var(--danger)' }} onClick={() => removeLine(line.id)}>
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

          <div className="stack-md" style={{ position: 'sticky', top: 20 }}>
            <div className="panel stack-md" style={{ borderTop: '4px solid var(--primary)' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Summary</h3>
              <div className="stack-sm" style={{ fontSize: '0.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>Subtotal</span>
                  <span>₹{totalAmount.toLocaleString()}</span>
                </div>
                <div style={{ height: 1, backgroundColor: 'var(--border)', margin: '8px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.2rem', fontWeight: 800 }}>
                  <span>Total</span>
                  <span style={{ color: 'var(--primary)' }}>₹{totalAmount.toLocaleString()}</span>
                </div>
              </div>

              <div className="panel appearance-none" style={{ backgroundColor: 'var(--bg-secondary)', padding: 12, borderRadius: 12 }}>
                 <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                   <Info size={16} style={{ marginTop: 2, color: 'var(--primary)' }} />
                   <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                     Targeting <strong>{targetCustomer?.name}</strong>. The bill will be recorded as an internal transfer.
                   </div>
                 </div>
              </div>

              <button 
                className="btn btn-primary" 
                style={{ padding: '16px', fontSize: '1.1rem', fontWeight: 700, display: 'flex', gap: 12, width: '100%' }}
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

export default InternalBilling;
