import React, { useState } from 'react';
import { useShortcuts } from '../../context/ShortcutContext';
import {
  X,
  UserPlus,
  ShoppingCart,
  CreditCard,
  Package,
  QrCode,
  BookOpen,
  UploadCloud,
  Users,
  DollarSign,
  Search,
  CheckCircle,
  BarChart2,
  FileText
} from 'lucide-react';
import toast from 'react-hot-toast';
import './Shortcuts.css';

export default function QuickActionModals() {
  const { activeModal, closeModal, openModal } = useShortcuts();

  if (!activeModal || activeModal === 'shortcuts_cheat_sheet') return null;

  return (
    <div className="shortcut-overlay" onClick={closeModal}>
      {activeModal === 'add_customer' && <AddCustomerModal onClose={closeModal} />}
      {activeModal === 'new_order' && <NewOrderModal onClose={closeModal} />}
      {activeModal === 'payment' && <PaymentModal onClose={closeModal} />}
      {activeModal === 'inventory' && <InventoryModal onClose={closeModal} />}
      {activeModal === 'scan_item' && <ScanItemModal onClose={closeModal} />}
      {activeModal === 'daily_book' && <DailyBookModal onClose={closeModal} />}
      {activeModal === 'upload_bills' && <UploadBillsModal onClose={closeModal} />}
      {activeModal === 'staff_management' && <StaffManagementModal onClose={closeModal} />}
      {activeModal === 'expense_management' && <ExpenseManagementModal onClose={closeModal} />}
      {activeModal === 'command_palette' && <CommandPaletteModal onClose={closeModal} onSelect={openModal} />}
      {activeModal === 'reports' && <ReportsModal onClose={closeModal} />}
    </div>
  );
}

/* 1. Add Customer Modal (Alt + C) */
function AddCustomerModal({ onClose }) {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    company: '',
    customerType: 'Retail',
    address: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name || !form.phone) {
      toast.error('Please fill Customer Name and Phone Number');
      return;
    }
    toast.success(`Customer "${form.name}" added successfully!`);
    onClose();
  };

  return (
    <div className="shortcut-modal" onClick={(e) => e.stopPropagation()}>
      <div className="shortcut-modal__header">
        <div className="shortcut-modal__title-box">
          <div className="shortcut-modal__icon">
            <UserPlus size={22} color="#3b82f6" />
          </div>
          <div>
            <h3 className="shortcut-modal__title">Add New Customer</h3>
            <p className="shortcut-modal__subtitle">Quick Registration (Shortcut: <kbd>Alt</kbd> + <kbd>C</kbd>)</p>
          </div>
        </div>
        <button className="shortcut-modal__close" onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="shortcut-modal__body">
          <div className="quick-form-grid">
            <div className="quick-form-group">
              <label className="quick-form-label">Full Name *</label>
              <input
                type="text"
                className="quick-form-input"
                placeholder="e.g. Ramesh Kumar"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
                required
              />
            </div>
            <div className="quick-form-group">
              <label className="quick-form-label">Phone Number *</label>
              <input
                type="tel"
                className="quick-form-input"
                placeholder="+91 98765 43210"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                required
              />
            </div>
            <div className="quick-form-group">
              <label className="quick-form-label">Email Address</label>
              <input
                type="email"
                className="quick-form-input"
                placeholder="customer@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="quick-form-group">
              <label className="quick-form-label">Company / Business Name</label>
              <input
                type="text"
                className="quick-form-input"
                placeholder="e.g. Acme Prints Ltd"
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
              />
            </div>
            <div className="quick-form-group">
              <label className="quick-form-label">Customer Category</label>
              <select
                className="quick-form-select"
                value={form.customerType}
                onChange={(e) => setForm({ ...form, customerType: e.target.value })}
              >
                <option value="Retail">Retail Customer</option>
                <option value="Wholesale">Wholesale Client</option>
                <option value="Corporate">Corporate / B2B</option>
                <option value="VIP">VIP Partner</option>
              </select>
            </div>
            <div className="quick-form-group quick-form-group--full">
              <label className="quick-form-label">Delivery Address</label>
              <textarea
                className="quick-form-textarea"
                placeholder="Street address, city, pin code..."
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
          </div>
        </div>
        <div className="shortcut-modal__footer">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-sm">
            Save Customer
          </button>
        </div>
      </form>
    </div>
  );
}

/* 2. New Order Modal (Alt + N) */
function NewOrderModal({ onClose }) {
  const [order, setOrder] = useState({
    customer: 'Select Customer',
    product: 'Custom Visiting Cards',
    quantity: 500,
    price: 1200,
    paperType: '300 GSM Matte',
    urgent: false,
    notes: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const orderNo = 'ORD-' + Math.floor(100000 + Math.random() * 900000);
    toast.success(`Order ${orderNo} created for ₹${order.price}!`);
    onClose();
  };

  return (
    <div className="shortcut-modal" onClick={(e) => e.stopPropagation()}>
      <div className="shortcut-modal__header">
        <div className="shortcut-modal__title-box">
          <div className="shortcut-modal__icon">
            <ShoppingCart size={22} color="#10b981" />
          </div>
          <div>
            <h3 className="shortcut-modal__title">Create New Order</h3>
            <p className="shortcut-modal__subtitle">Quick POS / Job Entry (Shortcut: <kbd>Alt</kbd> + <kbd>N</kbd>)</p>
          </div>
        </div>
        <button className="shortcut-modal__close" onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="shortcut-modal__body">
          <div className="quick-form-grid">
            <div className="quick-form-group">
              <label className="quick-form-label">Select Customer</label>
              <select
                className="quick-form-select"
                value={order.customer}
                onChange={(e) => setOrder({ ...order, customer: e.target.value })}
              >
                <option value="Walk-in Customer">Walk-in Customer</option>
                <option value="Perambur Press">Perambur Press</option>
                <option value="Apex Media Solutions">Apex Media Solutions</option>
                <option value="Sri Printing Works">Sri Printing Works</option>
              </select>
            </div>
            <div className="quick-form-group">
              <label className="quick-form-label">Product / Service</label>
              <select
                className="quick-form-select"
                value={order.product}
                onChange={(e) => setOrder({ ...order, product: e.target.value })}
              >
                <option value="Custom Visiting Cards">Custom Visiting Cards</option>
                <option value="Flex Banner 10x4">Flex Banner 10x4</option>
                <option value="A4 Product Catalog (16 Pg)">A4 Product Catalog (16 Pg)</option>
                <option value="Custom Photo Sheet Album">Custom Photo Sheet Album</option>
                <option value="Brochure Trifold">Brochure Trifold</option>
              </select>
            </div>
            <div className="quick-form-group">
              <label className="quick-form-label">Quantity</label>
              <input
                type="number"
                className="quick-form-input"
                value={order.quantity}
                onChange={(e) => setOrder({ ...order, quantity: Number(e.target.value) })}
              />
            </div>
            <div className="quick-form-group">
              <label className="quick-form-label">Paper / Material Stock</label>
              <input
                type="text"
                className="quick-form-input"
                value={order.paperType}
                onChange={(e) => setOrder({ ...order, paperType: e.target.value })}
              />
            </div>
            <div className="quick-form-group">
              <label className="quick-form-label">Total Amount (₹)</label>
              <input
                type="number"
                className="quick-form-input"
                value={order.price}
                onChange={(e) => setOrder({ ...order, price: Number(e.target.value) })}
              />
            </div>
            <div className="quick-form-group" style={{ justifyContent: 'center' }}>
              <label className="quick-form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '1.2rem' }}>
                <input
                  type="checkbox"
                  checked={order.urgent}
                  onChange={(e) => setOrder({ ...order, urgent: e.target.checked })}
                />
                <span style={{ color: '#ef4444', fontWeight: 600 }}>Mark as Urgent / Priority Order</span>
              </label>
            </div>
          </div>
        </div>
        <div className="shortcut-modal__footer">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-sm">
            Place Order
          </button>
        </div>
      </form>
    </div>
  );
}

/* 3. Payment Modal (Alt + P) */
function PaymentModal({ onClose }) {
  const [pay, setPay] = useState({
    orderId: 'ORD-98214',
    amount: 3450,
    method: 'UPI / QR Code',
    reference: 'TXN' + Math.floor(100000 + Math.random() * 900000),
    status: 'Received'
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    toast.success(`Payment of ₹${pay.amount} logged via ${pay.method}!`);
    onClose();
  };

  return (
    <div className="shortcut-modal" onClick={(e) => e.stopPropagation()}>
      <div className="shortcut-modal__header">
        <div className="shortcut-modal__title-box">
          <div className="shortcut-modal__icon">
            <CreditCard size={22} color="#8b5cf6" />
          </div>
          <div>
            <h3 className="shortcut-modal__title">Record Payment</h3>
            <p className="shortcut-modal__subtitle">Quick Entry (Shortcut: <kbd>Alt</kbd> + <kbd>P</kbd>)</p>
          </div>
        </div>
        <button className="shortcut-modal__close" onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="shortcut-modal__body">
          <div className="quick-form-grid">
            <div className="quick-form-group">
              <label className="quick-form-label">Associated Order #</label>
              <input
                type="text"
                className="quick-form-input"
                value={pay.orderId}
                onChange={(e) => setPay({ ...pay, orderId: e.target.value })}
                autoFocus
              />
            </div>
            <div className="quick-form-group">
              <label className="quick-form-label">Payment Amount (₹)</label>
              <input
                type="number"
                className="quick-form-input"
                value={pay.amount}
                onChange={(e) => setPay({ ...pay, amount: Number(e.target.value) })}
              />
            </div>
            <div className="quick-form-group">
              <label className="quick-form-label">Payment Mode</label>
              <select
                className="quick-form-select"
                value={pay.method}
                onChange={(e) => setPay({ ...pay, method: e.target.value })}
              >
                <option value="UPI / QR Code">GPay / PhonePe / UPI</option>
                <option value="Cash">Cash Payment</option>
                <option value="Credit/Debit Card">Credit / Debit Card</option>
                <option value="Net Banking">Bank Transfer / NEFT</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>
            <div className="quick-form-group">
              <label className="quick-form-label">Transaction / Ref Number</label>
              <input
                type="text"
                className="quick-form-input"
                value={pay.reference}
                onChange={(e) => setPay({ ...pay, reference: e.target.value })}
              />
            </div>
          </div>
        </div>
        <div className="shortcut-modal__footer">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-sm">
            Save Payment Record
          </button>
        </div>
      </form>
    </div>
  );
}

/* 4. Inventory Modal (Alt + I) */
function InventoryModal({ onClose }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [items, setItems] = useState([
    { id: 1, name: 'Art Paper 300 GSM (A3)', category: 'Paper Stock', qty: 1200, unit: 'Sheets', reorder: 500, status: 'In Stock' },
    { id: 2, name: 'CYMK Offset Printing Ink Set', category: 'Inks & Toners', qty: 14, unit: 'Cans', reorder: 20, status: 'Low Stock' },
    { id: 3, name: 'Vinyl Matte Banner Roll (4ft x 100ft)', category: 'Media Rolls', qty: 8, unit: 'Rolls', reorder: 5, status: 'In Stock' },
    { id: 4, name: 'Lamination Film Glossy 100m', category: 'Lamination', qty: 3, unit: 'Rolls', reorder: 5, status: 'Low Stock' },
    { id: 5, name: 'Spiral Binding Coils 12mm', category: 'Binding', qty: 450, unit: 'Pieces', reorder: 100, status: 'In Stock' }
  ]);

  const filtered = items.filter((i) =>
    i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    i.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="shortcut-modal shortcut-modal--wide" onClick={(e) => e.stopPropagation()}>
      <div className="shortcut-modal__header">
        <div className="shortcut-modal__title-box">
          <div className="shortcut-modal__icon">
            <Package size={22} color="#f59e0b" />
          </div>
          <div>
            <h3 className="shortcut-modal__title">Inventory & Stock Manager</h3>
            <p className="shortcut-modal__subtitle">Quick Stock Audit (Shortcut: <kbd>Alt</kbd> + <kbd>I</kbd>)</p>
          </div>
        </div>
        <button className="shortcut-modal__close" onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      <div className="shortcut-modal__body">
        <div className="quick-stat-grid">
          <div className="quick-stat-card">
            <span className="quick-stat-card__title">Total Material Items</span>
            <span className="quick-stat-card__value">48 Active</span>
          </div>
          <div className="quick-stat-card">
            <span className="quick-stat-card__title">Low Stock Alerts</span>
            <span className="quick-stat-card__value" style={{ color: '#ef4444' }}>2 Items</span>
          </div>
          <div className="quick-stat-card">
            <span className="quick-stat-card__title">Total Stock Value</span>
            <span className="quick-stat-card__value">₹2,45,800</span>
          </div>
        </div>

        <div className="shortcut-search-bar" style={{ marginBottom: '1rem' }}>
          <Search className="shortcut-search-icon" size={18} />
          <input
            type="text"
            className="shortcut-search-input"
            placeholder="Search stock paper, inks, media rolls..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoFocus
          />
        </div>

        <table className="quick-table">
          <thead>
            <tr>
              <th>Item Name</th>
              <th>Category</th>
              <th>In Stock</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.name}</strong></td>
                <td>{item.category}</td>
                <td>{item.qty} {item.unit}</td>
                <td>
                  <span
                    style={{
                      padding: '0.2rem 0.5rem',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      background: item.status === 'In Stock' ? '#dcfce7' : '#fee2e2',
                      color: item.status === 'In Stock' ? '#15803d' : '#b91c1c'
                    }}
                  >
                    {item.status}
                  </span>
                </td>
                <td>
                  <button
                    className="btn btn-outline btn-sm"
                    style={{ padding: '0.2rem 0.6rem', fontSize: '0.78rem' }}
                    onClick={() => toast.success(`Stock level reordered for ${item.name}`)}
                  >
                    + Add Stock
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="shortcut-modal__footer">
        <button className="btn btn-secondary btn-sm" onClick={onClose}>
          Close Inventory
        </button>
      </div>
    </div>
  );
}

/* 5. Scan Item Modal (Alt + S) */
function ScanItemModal({ onClose }) {
  const [barcode, setBarcode] = useState('');
  const [scannedResult, setScannedResult] = useState(null);

  const handleScan = (e) => {
    e.preventDefault();
    if (!barcode) return;
    setScannedResult({
      code: barcode,
      name: 'Flex Banner Material 13oz',
      price: '₹45 / sq ft',
      location: 'Rack B-04',
      stock: '12 Rolls'
    });
    toast.success(`Barcode ${barcode} Scanned Successfully!`);
  };

  return (
    <div className="shortcut-modal" onClick={(e) => e.stopPropagation()}>
      <div className="shortcut-modal__header">
        <div className="shortcut-modal__title-box">
          <div className="shortcut-modal__icon">
            <QrCode size={22} color="#06b6d4" />
          </div>
          <div>
            <h3 className="shortcut-modal__title">Barcode / QR Scanner</h3>
            <p className="shortcut-modal__subtitle">Quick Item Lookup (Shortcut: <kbd>Alt</kbd> + <kbd>S</kbd>)</p>
          </div>
        </div>
        <button className="shortcut-modal__close" onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      <div className="shortcut-modal__body">
        <div
          style={{
            height: '160px',
            borderRadius: '12px',
            background: '#0f172a',
            color: '#38bdf8',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            border: '2px dashed #0284c7',
            marginBottom: '1.25rem'
          }}
        >
          <QrCode size={48} style={{ animation: 'pulse 1.5s infinite ease-in-out' }} />
          <span style={{ fontSize: '0.88rem', color: '#94a3b8' }}>
            Point your Barcode Scanner or type Serial Number below
          </span>
        </div>

        <form onSubmit={handleScan} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            type="text"
            className="quick-form-input"
            placeholder="Scan barcode or enter serial # (e.g. PRT-88492)..."
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            autoFocus
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn btn-primary btn-sm">
            Scan Code
          </button>
        </form>

        {scannedResult && (
          <div
            style={{
              padding: '1rem',
              borderRadius: '10px',
              background: 'var(--bg-secondary, #f8fafc)',
              border: '1px solid #38bdf8'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0284c7', fontWeight: 700, marginBottom: '0.5rem' }}>
              <CheckCircle size={18} />
              <span>Item Located: {scannedResult.name}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', fontSize: '0.85rem' }}>
              <div><strong>Code:</strong> {scannedResult.code}</div>
              <div><strong>Price:</strong> {scannedResult.price}</div>
              <div><strong>Stock:</strong> {scannedResult.stock}</div>
            </div>
          </div>
        )}
      </div>

      <div className="shortcut-modal__footer">
        <button className="btn btn-secondary btn-sm" onClick={onClose}>
          Close Scanner
        </button>
      </div>
    </div>
  );
}

/* 6. Daily Book Modal (Alt + B) */
function DailyBookModal({ onClose }) {
  return (
    <div className="shortcut-modal shortcut-modal--wide" onClick={(e) => e.stopPropagation()}>
      <div className="shortcut-modal__header">
        <div className="shortcut-modal__title-box">
          <div className="shortcut-modal__icon">
            <BookOpen size={22} color="#ec4899" />
          </div>
          <div>
            <h3 className="shortcut-modal__title">Daily Book & Cash Register</h3>
            <p className="shortcut-modal__subtitle">Today's Financial Summary (Shortcut: <kbd>Alt</kbd> + <kbd>B</kbd>)</p>
          </div>
        </div>
        <button className="shortcut-modal__close" onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      <div className="shortcut-modal__body">
        <div className="quick-stat-grid">
          <div className="quick-stat-card">
            <span className="quick-stat-card__title">Total Cash In Today</span>
            <span className="quick-stat-card__value" style={{ color: '#10b981' }}>+ ₹18,450</span>
          </div>
          <div className="quick-stat-card">
            <span className="quick-stat-card__title">Total Expenses Paid</span>
            <span className="quick-stat-card__value" style={{ color: '#ef4444' }}>- ₹3,200</span>
          </div>
          <div className="quick-stat-card">
            <span className="quick-stat-card__title">Net Day Balance</span>
            <span className="quick-stat-card__value">₹15,250</span>
          </div>
        </div>

        <h4 style={{ fontSize: '0.9rem', marginBottom: '0.75rem', color: '#475569' }}>Today's Recent Transactions</h4>
        <table className="quick-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Particulars / Party</th>
              <th>Type</th>
              <th>Mode</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>10:15 AM</td>
              <td>Sri Printing Works - Advance Payment</td>
              <td><span style={{ color: '#10b981', fontWeight: 600 }}>Cash In</span></td>
              <td>UPI GPay</td>
              <td>₹4,500</td>
            </tr>
            <tr>
              <td>11:40 AM</td>
              <td>Paper Supplier (Ramesh Traders)</td>
              <td><span style={{ color: '#ef4444', fontWeight: 600 }}>Cash Out</span></td>
              <td>Cash</td>
              <td>₹3,200</td>
            </tr>
            <tr>
              <td>02:10 PM</td>
              <td>Walk-in Visiting Cards Order</td>
              <td><span style={{ color: '#10b981', fontWeight: 600 }}>Cash In</span></td>
              <td>Cash</td>
              <td>₹1,200</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="shortcut-modal__footer">
        <button
          className="btn btn-outline btn-sm"
          onClick={() => toast.success('Daily Book Statement downloaded!')}
        >
          Download Day Statement PDF
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>
          Close Day Book
        </button>
      </div>
    </div>
  );
}

/* 7. Upload Bills Modal (Alt + U) */
function UploadBillsModal({ onClose }) {
  const [bill, setBill] = useState({ supplier: '', amount: '', category: 'Material Purchase' });

  const handleUpload = (e) => {
    e.preventDefault();
    toast.success(`Bill from "${bill.supplier || 'Vendor'}" uploaded successfully!`);
    onClose();
  };

  return (
    <div className="shortcut-modal" onClick={(e) => e.stopPropagation()}>
      <div className="shortcut-modal__header">
        <div className="shortcut-modal__title-box">
          <div className="shortcut-modal__icon">
            <UploadCloud size={22} color="#6366f1" />
          </div>
          <div>
            <h3 className="shortcut-modal__title">Upload Vendor Bills & Receipts</h3>
            <p className="shortcut-modal__subtitle">Bill Management (Shortcut: <kbd>Alt</kbd> + <kbd>U</kbd>)</p>
          </div>
        </div>
        <button className="shortcut-modal__close" onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      <form onSubmit={handleUpload}>
        <div className="shortcut-modal__body">
          <div
            style={{
              padding: '2rem 1rem',
              border: '2px dashed #818cf8',
              borderRadius: '12px',
              textAlign: 'center',
              background: 'rgba(99, 102, 241, 0.05)',
              marginBottom: '1.25rem',
              cursor: 'pointer'
            }}
            onClick={() => toast.success('File selector opened')}
          >
            <UploadCloud size={36} color="#6366f1" style={{ marginBottom: '0.5rem' }} />
            <p style={{ margin: 0, fontWeight: 600 }}>Click or Drag & Drop Bill / Invoice File</p>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>Supports PDF, JPG, PNG up to 10MB</p>
          </div>

          <div className="quick-form-grid">
            <div className="quick-form-group">
              <label className="quick-form-label">Vendor / Supplier Name</label>
              <input
                type="text"
                className="quick-form-input"
                placeholder="e.g. Zenith Paper Mill"
                value={bill.supplier}
                onChange={(e) => setBill({ ...bill, supplier: e.target.value })}
                required
              />
            </div>
            <div className="quick-form-group">
              <label className="quick-form-label">Bill Amount (₹)</label>
              <input
                type="number"
                className="quick-form-input"
                placeholder="₹ 8,500"
                value={bill.amount}
                onChange={(e) => setBill({ ...bill, amount: e.target.value })}
                required
              />
            </div>
            <div className="quick-form-group quick-form-group--full">
              <label className="quick-form-label">Expense Category</label>
              <select
                className="quick-form-select"
                value={bill.category}
                onChange={(e) => setBill({ ...bill, category: e.target.value })}
              >
                <option value="Material Purchase">Material Purchase (Paper / Ink)</option>
                <option value="Machine Maintenance">Machine Maintenance & Spares</option>
                <option value="Electricity & Power">Electricity & Power Utility</option>
                <option value="Transport & Freight">Transport & Freight Charge</option>
              </select>
            </div>
          </div>
        </div>
        <div className="shortcut-modal__footer">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-sm">
            Save Bill
          </button>
        </div>
      </form>
    </div>
  );
}

/* 8. Staff Management Modal (Alt + M) */
function StaffManagementModal({ onClose }) {
  const staffMembers = [
    { id: 1, name: 'Anand Kumar', role: 'Chief Press Operator', status: 'Present', time: '09:00 AM' },
    { id: 2, name: 'Priya Sharma', role: 'Graphic Designer', status: 'Present', time: '09:15 AM' },
    { id: 3, name: 'Karthik Raja', role: 'Finishing & Binding', status: 'On Leave', time: '-' },
    { id: 4, name: 'Suresh Babu', role: 'Delivery Agent', status: 'Present', time: '09:30 AM' }
  ];

  return (
    <div className="shortcut-modal shortcut-modal--wide" onClick={(e) => e.stopPropagation()}>
      <div className="shortcut-modal__header">
        <div className="shortcut-modal__title-box">
          <div className="shortcut-modal__icon">
            <Users size={22} color="#14b8a6" />
          </div>
          <div>
            <h3 className="shortcut-modal__title">Staff Management & Roster</h3>
            <p className="shortcut-modal__subtitle">Attendance & Shift Tracker (Shortcut: <kbd>Alt</kbd> + <kbd>M</kbd>)</p>
          </div>
        </div>
        <button className="shortcut-modal__close" onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      <div className="shortcut-modal__body">
        <div className="quick-stat-grid">
          <div className="quick-stat-card">
            <span className="quick-stat-card__title">Total Employees</span>
            <span className="quick-stat-card__value">4 Staff</span>
          </div>
          <div className="quick-stat-card">
            <span className="quick-stat-card__title">Present Today</span>
            <span className="quick-stat-card__value" style={{ color: '#10b981' }}>3 Present</span>
          </div>
          <div className="quick-stat-card">
            <span className="quick-stat-card__title">Absences</span>
            <span className="quick-stat-card__value" style={{ color: '#f59e0b' }}>1 On Leave</span>
          </div>
        </div>

        <table className="quick-table">
          <thead>
            <tr>
              <th>Employee Name</th>
              <th>Role</th>
              <th>Clock-in Time</th>
              <th>Status</th>
              <th>Mark Attendance</th>
            </tr>
          </thead>
          <tbody>
            {staffMembers.map((m) => (
              <tr key={m.id}>
                <td><strong>{m.name}</strong></td>
                <td>{m.role}</td>
                <td>{m.time}</td>
                <td>
                  <span
                    style={{
                      padding: '0.2rem 0.5rem',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      background: m.status === 'Present' ? '#dcfce7' : '#fef3c7',
                      color: m.status === 'Present' ? '#15803d' : '#b45309'
                    }}
                  >
                    {m.status}
                  </span>
                </td>
                <td>
                  <button
                    className="btn btn-outline btn-sm"
                    style={{ padding: '0.2rem 0.6rem', fontSize: '0.78rem' }}
                    onClick={() => toast.success(`Attendance updated for ${m.name}`)}
                  >
                    Toggle Status
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="shortcut-modal__footer">
        <button className="btn btn-secondary btn-sm" onClick={onClose}>
          Close Staff Manager
        </button>
      </div>
    </div>
  );
}

/* 9. Expense Management Modal (Alt + E) */
function ExpenseManagementModal({ onClose }) {
  const [exp, setExp] = useState({ title: '', category: 'Tea & Refreshments', amount: '', paidBy: 'Cash' });

  const handleSave = (e) => {
    e.preventDefault();
    toast.success(`Expense "${exp.title}" of ₹${exp.amount} logged!`);
    onClose();
  };

  return (
    <div className="shortcut-modal" onClick={(e) => e.stopPropagation()}>
      <div className="shortcut-modal__header">
        <div className="shortcut-modal__title-box">
          <div className="shortcut-modal__icon">
            <DollarSign size={22} color="#f43f5e" />
          </div>
          <div>
            <h3 className="shortcut-modal__title">Expense Management</h3>
            <p className="shortcut-modal__subtitle">Log Shop Expenses (Shortcut: <kbd>Alt</kbd> + <kbd>E</kbd>)</p>
          </div>
        </div>
        <button className="shortcut-modal__close" onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      <form onSubmit={handleSave}>
        <div className="shortcut-modal__body">
          <div className="quick-form-grid">
            <div className="quick-form-group">
              <label className="quick-form-label">Expense Title / Reason *</label>
              <input
                type="text"
                className="quick-form-input"
                placeholder="e.g. Shop Tea & Snacks"
                value={exp.title}
                onChange={(e) => setExp({ ...exp, title: e.target.value })}
                autoFocus
                required
              />
            </div>
            <div className="quick-form-group">
              <label className="quick-form-label">Expense Category</label>
              <select
                className="quick-form-select"
                value={exp.category}
                onChange={(e) => setExp({ ...exp, category: e.target.value })}
              >
                <option value="Tea & Refreshments">Tea & Snacks</option>
                <option value="Delivery / Courier">Delivery / Courier</option>
                <option value="Shop Maintenance">Shop Cleaning / Repairs</option>
                <option value="Stationery & Misc">Stationery & Misc</option>
              </select>
            </div>
            <div className="quick-form-group">
              <label className="quick-form-label">Amount (₹) *</label>
              <input
                type="number"
                className="quick-form-input"
                placeholder="₹ 250"
                value={exp.amount}
                onChange={(e) => setExp({ ...exp, amount: e.target.value })}
                required
              />
            </div>
            <div className="quick-form-group">
              <label className="quick-form-label">Paid Via</label>
              <select
                className="quick-form-select"
                value={exp.paidBy}
                onChange={(e) => setExp({ ...exp, paidBy: e.target.value })}
              >
                <option value="Cash">Cash Drawer</option>
                <option value="UPI">Petty Cash / UPI</option>
                <option value="Card">Business Card</option>
              </select>
            </div>
          </div>
        </div>
        <div className="shortcut-modal__footer">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-sm">
            Record Expense
          </button>
        </div>
      </form>
    </div>
  );
}

/* 10. Command Palette Modal (Alt + /) */
function CommandPaletteModal({ onClose, onSelect }) {
  const [query, setQuery] = useState('');
  const commands = [
    { id: 'add_customer', name: 'Add New Customer', icon: '👤', key: 'Alt + C' },
    { id: 'new_order', name: 'Create New Order', icon: '🛒', key: 'Alt + N' },
    { id: 'payment', name: 'Record Payment', icon: '💳', key: 'Alt + P' },
    { id: 'inventory', name: 'Check Stock & Inventory', icon: '📦', key: 'Alt + I' },
    { id: 'scan_item', name: 'Barcode / QR Scan Item', icon: '🔍', key: 'Alt + S' },
    { id: 'daily_book', name: 'View Daily Ledger Book', icon: '📖', key: 'Alt + B' },
    { id: 'upload_bills', name: 'Upload Vendor Receipt/Bill', icon: '🧾', key: 'Alt + U' },
    { id: 'staff_management', name: 'Staff Attendance Roster', icon: '👥', key: 'Alt + M' },
    { id: 'expense_management', name: 'Log Shop Expense', icon: '💰', key: 'Alt + E' },
    { id: 'reports', name: 'View Financial Summary', icon: '📊', key: 'Alt + R' },
    { id: 'shortcuts_cheat_sheet', name: 'Keyboard Shortcuts Cheat Sheet', icon: '⌨️', key: 'Alt + K' }
  ];

  const filtered = commands.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase()) ||
    c.key.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="shortcut-modal" onClick={(e) => e.stopPropagation()}>
      <div className="shortcut-modal__header">
        <div className="shortcut-modal__title-box">
          <div className="shortcut-modal__icon">
            <Search size={22} color="#3b82f6" />
          </div>
          <div>
            <h3 className="shortcut-modal__title">Command Palette</h3>
            <p className="shortcut-modal__subtitle">Type to launch any action instantly (Shortcut: <kbd>Alt</kbd> + <kbd>/</kbd>)</p>
          </div>
        </div>
        <button className="shortcut-modal__close" onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      <div className="shortcut-modal__body">
        <div className="shortcut-search-bar" style={{ marginBottom: '1rem' }}>
          <Search className="shortcut-search-icon" size={18} />
          <input
            type="text"
            className="shortcut-search-input"
            placeholder="Type a command (e.g. New Order, Customer, Payment)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '320px', overflowY: 'auto' }}>
          {filtered.map((cmd) => (
            <div
              key={cmd.id}
              className="shortcut-item-card"
              onClick={() => {
                onClose();
                onSelect(cmd.id);
              }}
            >
              <div className="shortcut-item-card__info">
                <span className="shortcut-item-card__icon">{cmd.icon}</span>
                <span className="shortcut-item-card__name">{cmd.name}</span>
              </div>
              <kbd>{cmd.key}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* 11. Reports Modal (Alt + R) */
function ReportsModal({ onClose }) {
  return (
    <div className="shortcut-modal shortcut-modal--wide" onClick={(e) => e.stopPropagation()}>
      <div className="shortcut-modal__header">
        <div className="shortcut-modal__title-box">
          <div className="shortcut-modal__icon">
            <BarChart2 size={22} color="#8b5cf6" />
          </div>
          <div>
            <h3 className="shortcut-modal__title">Quick Business Reports</h3>
            <p className="shortcut-modal__subtitle">Executive Analytics (Shortcut: <kbd>Alt</kbd> + <kbd>R</kbd>)</p>
          </div>
        </div>
        <button className="shortcut-modal__close" onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      <div className="shortcut-modal__body">
        <div className="quick-stat-grid">
          <div className="quick-stat-card">
            <span className="quick-stat-card__title">Monthly Sales</span>
            <span className="quick-stat-card__value">₹4,85,000</span>
          </div>
          <div className="quick-stat-card">
            <span className="quick-stat-card__title">Active Orders</span>
            <span className="quick-stat-card__value">24 Jobs</span>
          </div>
          <div className="quick-stat-card">
            <span className="quick-stat-card__title">Gross Margin</span>
            <span className="quick-stat-card__value" style={{ color: '#10b981' }}>64.2%</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          <button className="btn btn-outline btn-sm" onClick={() => toast.success('Sales Report Downloaded')}>
            <FileText size={16} style={{ marginRight: 6 }} /> Export Sales Report (PDF)
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => toast.success('Tax Statement Downloaded')}>
            <FileText size={16} style={{ marginRight: 6 }} /> GST & Tax Summary (Excel)
          </button>
        </div>
      </div>

      <div className="shortcut-modal__footer">
        <button className="btn btn-secondary btn-sm" onClick={onClose}>
          Close Reports
        </button>
      </div>
    </div>
  );
}
