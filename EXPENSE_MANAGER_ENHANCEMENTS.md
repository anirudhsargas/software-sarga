# Expense Manager Enhancements Complete Guide

## ✅ COMPLETED Tasks

### 1. Fixed CSS Visibility Issues
**File**: `client/src/pages/ExpenseManager.css` (completely rewritten, 582 lines)

**Critical Fixes**:
- ✅ Removed all `.em-page .btn*` overrides that caused invisible white text on light backgrounds in dark mode
- ✅ Added `color-scheme: dark` for date/month/datetime inputs → native pickers now visible
- ✅ Form labels changed from `color: var(--muted)` to `color: var(--text)` → fully readable
- ✅ Type badges → high-contrast colors for both light/dark modes
- ✅ KPI values → explicit hex colors instead of CSS variables
- ✅ Description cell width → increased from 220px to 300px
- ✅ Dark mode breakdown bar → uses `#60a5fa` instead of invisible beige
- ✅ Error banner → proper light/dark styling
- ✅ All amount cells → brighter red (#f87171) in dark mode

### 2. Database Schema Updates
**File**: `server/database.js`

Added two new tables:

```sql
-- Vendor/Utility Add Requests (Front Office can request new vendors/utilities)
CREATE TABLE sarga_vendor_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_type ENUM('Vendor', 'Utility') NOT NULL,
    name VARCHAR(150) NOT NULL,
    contact_person VARCHAR(150),
    phone VARCHAR(20),
    address TEXT,
    gstin VARCHAR(50),
    branch_id INT DEFAULT NULL,
    requested_by INT NOT NULL,
    request_reason TEXT,
    status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
    reviewed_by INT DEFAULT NULL,
    reviewed_at DATETIME DEFAULT NULL,
    rejection_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL,
    FOREIGN KEY (requested_by) REFERENCES sarga_staff(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

-- Payment Frequency Tracking (for suggesting admin to add as default category)
CREATE TABLE sarga_payment_suggestions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payee_name VARCHAR(150) NOT NULL,
    payment_category VARCHAR(100),
    occurrence_count INT DEFAULT 1,
    total_amount_paid DECIMAL(14, 2) DEFAULT 0,
    last_payment_date DATETIME,
    suggested_as_vendor TINYINT(1) DEFAULT 0,
    suggestion_dismissed TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_payee (payee_name, payment_category)
);
```

### 3. Server API Routes Added
**File**: `server/routes/expenses.js` (added 230+ lines)

**New Endpoints**:

#### Vendor/Utility Requests:
- `GET /api/vendor-requests` - Get all requests (Admin/Accountant see all, Front Office sees only theirs)
  - Query param: `?status=Pending|Approved|Rejected`
- `POST /api/vendor-requests` - Create new vendor/utility request
  - Body: `{ request_type, name, contact_person, phone, address, gstin, branch_id, request_reason }`
- `PUT /api/vendor-requests/:id/review` - Approve/Reject request (Admin/Accountant only)
  - Body: `{ status: 'Approved'|'Rejected', rejection_reason }`
  - When approved, automatically creates the vendor in `sarga_vendors` table

#### Payment Suggestions:
- `GET /api/payment-suggestions` - Get payment suggestions (Admin/Accountant only)
  - Query param: `?min_occurrences=3` (default 3)
  - Returns payees that appear multiple times in "Other" payments
- `PUT /api/payment-suggestions/:id/convert` - Mark as converted to vendor
- `PUT /api/payment-suggestions/:id/dismiss` - Dismiss suggestion

#### Tracking Function:
- `trackPaymentFrequency(payeeName, category, amount)` - Exported function
  - Automatically tracks "Other" payment frequency
  - Uses `INSERT ... ON DUPLICATE KEY UPDATE` to increment counters

### 4. Payment Tracking Integration
**File**: `server/routes/payments.js`

Added automatic tracking when "Other" payments are created:
```javascript
// Track payment frequency for "Other" payments to suggest adding as vendor
if (type === 'Other' || type === 'Miscellaneous') {
    const expensesRouter = require('./expenses');
    if (expensesRouter.trackPaymentFrequency) {
        await expensesRouter.trackPaymentFrequency(payee_name, type, amount);
    }
}
```

### 5. Removed Old Payments Page
**File**: `client/src/pages/Dashboard.jsx`

- ✅ Removed `import Payments from './Payments';`
- ✅ Removed "Payment" menu item (Front Office)
- ✅ Removed "Payments" menu item (Admin, Accountant)
- ✅ Removed `<Route path="payments" element={<Payments />} />`
- ✅ Changed Accountant default dashboard from `<Payments />` to `<ExpenseManager />`
- ✅ Moved Expense Manager to show for all roles: Front Office, Admin, Accountant

---

## 🚧 NEXT SESSION - Add to ExpenseManager.jsx

### Task 2: Add Vendor/Utility Request Feature

**Add new state** (around line 50):
```javascript
// Vendor/Utility Requests
const [requests, setRequests] = useState([]);
const [requestCount, setRequestCount] = useState(0);
const [showRequestModal, setShowRequestModal] = useState(false);
const [requestForm, setRequestForm] = useState({
    request_type: 'Vendor',
    name: '',
    contact_person: '',
    phone: '',
    address: '',
    gstin: '',
    branch_id: null,
    request_reason: ''
});
const [showRequestsListModal, setShowRequestsListModal] = useState(false);
const [selectedRequest, setSelectedRequest] = useState(null);
```

**Add fetch function** (after existing fetch functions):
```javascript
const fetchVendorRequests = async () => {
    try {
        const res = await api.get('/api/vendor-requests', {
            params: user.role === 'Front Office' ? {} : { status: 'Pending' }
        });
        setRequests(res.data);
        setRequestCount(res.data.filter(r => r.status === 'Pending').length);
    } catch (err) {
        console.error('Failed to load vendor requests:', err);
    }
};

const submitVendorRequest = async (e) => {
    e.preventDefault();
    try {
        await api.post('/api/vendor-requests', requestForm);
        showSuccess(`${requestForm.request_type} request submitted successfully`);
        setShowRequestModal(false);
        setRequestForm({
            request_type: 'Vendor',
            name: '',
            contact_person: '',
            phone: '',
            address: '',
            gstin: '',
            branch_id: null,
            request_reason: ''
        });
        await fetchVendorRequests();
    } catch (err) {
        showError(err.response?.data?.error || 'Failed to submit request');
    }
};

const reviewRequest = async (requestId, status, reason = '') => {
    try {
        await api.put(`/api/vendor-requests/${requestId}/review`, {
            status,
            rejection_reason: reason
        });
        showSuccess(`Request ${status.toLowerCase()} successfully`);
        await fetchVendorRequests();
        await fetchVendors(); // Refresh vendors list if approved
        setSelectedRequest(null);
    } catch (err) {
        showError(err.response?.data?.error || 'Failed to review request');
    }
};
```

**Add to useEffect** (load requests):
```javascript
useEffect(() => {
    fetchDashboard();
    fetchVendors();
    fetchVendorRequests(); // ADD THIS
}, [month, branchFilter]);
```

**Add button in header** (for Front Office):
```jsx
<div className="em-header__actions">
    {user.role === 'Front Office' && (
        <button className="btn btn-ghost btn-sm" onClick={() => setShowRequestModal(true)}>
            <PlusCircle size={16} />
            Request Vendor/Utility
        </button>
    )}
    {['Admin', 'Accountant'].includes(user.role) && requestCount > 0 && (
        <button className="btn btn-ghost btn-sm" onClick={() => setShowRequestsListModal(true)}>
            <Bell size={16} />
            {requestCount} Pending Request{requestCount !== 1 ? 's' : ''}
        </button>
    )}
    {/* ... existing buttons ... */}
</div>
```

**Add modals at bottom** (before closing </div>):

```jsx
{/* Vendor/Utility Request Modal (Front Office) */}
{showRequestModal && (
    <div className="modal-backdrop" onClick={() => setShowRequestModal(false)}>
        <div className="em-modal" onClick={e => e.stopPropagation()}>
            <div className="em-modal__header">
                <h2>Request New {requestForm.request_type}</h2>
                <button className="btn btn-icon" onClick={() => setShowRequestModal(false)}>
                    <X size={18} />
                </button>
            </div>
            <form onSubmit={submitVendorRequest}>
                <div className="em-modal__body">
                    <div className="em-form-grid">
                        <div className="em-form-group em-form-group--full">
                            <label>Type *</label>
                            <select className="em-input" value={requestForm.request_type}
                                onChange={e => setRequestForm({...requestForm, request_type: e.target.value})}>
                                <option value="Vendor">Vendor</option>
                                <option value="Utility">Utility</option>
                            </select>
                        </div>
                        <div className="em-form-group em-form-group--full">
                            <label>Name *</label>
                            <input className="em-input" value={requestForm.name} required
                                onChange={e => setRequestForm({...requestForm, name: e.target.value})}
                                placeholder="Enter vendor/utility name" />
                        </div>
                        <div className="em-form-group">
                            <label>Contact Person</label>
                            <input className="em-input" value={requestForm.contact_person}
                                onChange={e => setRequestForm({...requestForm, contact_person: e.target.value})}
                                placeholder="Contact name" />
                        </div>
                        <div className="em-form-group">
                            <label>Phone</label>
                            <input className="em-input" value={requestForm.phone}
                                onChange={e => setRequestForm({...requestForm, phone: e.target.value})}
                                placeholder="Contact phone" />
                        </div>
                        <div className="em-form-group em-form-group--full">
                            <label>Address</label>
                            <textarea className="em-input" rows={2} value={requestForm.address}
                                onChange={e => setRequestForm({...requestForm, address: e.target.value})}
                                placeholder="Full address (optional)" />
                        </div>
                        <div className="em-form-group">
                            <label>GSTIN</label>
                            <input className="em-input" value={requestForm.gstin}
                                onChange={e => setRequestForm({...requestForm, gstin: e.target.value})}
                                placeholder="GST number (optional)" />
                        </div>
                        <div className="em-form-group">
                            <label>Branch</label>
                            <select className="em-input" value={requestForm.branch_id || ''}
                                onChange={e => setRequestForm({...requestForm, branch_id: e.target.value || null})}>
                                <option value="">All Branches</option>
                                {branches.map(b => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="em-form-group em-form-group--full">
                            <label>Reason for Request</label>
                            <textarea className="em-input" rows={2} value={requestForm.request_reason}
                                onChange={e => setRequestForm({...requestForm, request_reason: e.target.value})}
                                placeholder="Why do you need this vendor/utility added?" />
                        </div>
                    </div>
                </div>
                <div className="em-modal__footer">
                    <button type="button" className="btn btn-ghost btn-sm"
                        onClick={() => setShowRequestModal(false)}>Cancel</button>
                    <button type="submit" className="btn btn-primary btn-sm">Submit Request</button>
                </div>
            </form>
        </div>
    </div>
)}

{/* Vendor Requests List Modal (Admin/Accountant) */}
{showRequestsListModal && (
    <div className="modal-backdrop" onClick={() => setShowRequestsListModal(false)}>
        <div className="em-modal" onClick={e => e.stopPropagation()} style={{maxWidth: '900px'}}>
            <div className="em-modal__header">
                <h2>Vendor/Utility Requests</h2>
                <button className="btn btn-icon" onClick={() => setShowRequestsListModal(false)}>
                    <X size={18} />
                </button>
            </div>
            <div className="em-modal__body">
                <div className="em-table-wrap">
                    <table className="em-table">
                        <thead>
                            <tr>
                                <th>Type</th>
                                <th>Name</th>
                                <th>Contact</th>
                                <th>Requested By</th>
                                <th>Date</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {requests.map(req => (
                                <tr key={req.id}>
                                    <td><span className={`em-type-badge em-type-badge--${req.request_type.toLowerCase()}`}>
                                        {req.request_type}</span></td>
                                    <td style={{fontWeight: 600}}>{req.name}</td>
                                    <td>{req.phone || '—'}</td>
                                    <td>{req.requested_by_name}</td>
                                    <td>{new Date(req.created_at).toLocaleDateString()}</td>
                                    <td><span className={`em-type-badge em-type-badge--${
                                        req.status === 'Pending' ? 'other' : 
                                        req.status === 'Approved' ? 'payment' : 'purchase'
                                    }`}>{req.status}</span></td>
                                    <td>
                                        {req.status === 'Pending' && (
                                            <div style={{display: 'flex', gap: '6px'}}>
                                                <button className="btn btn-primary btn-sm"
                                                    onClick={() => reviewRequest(req.id, 'Approved')}>
                                                    <Check size={14} /> Approve
                                                </button>
                                                <button className="btn btn-ghost btn-sm"
                                                    onClick={() => {
                                                        const reason = prompt('Rejection reason (optional):');
                                                        if (reason !== null) reviewRequest(req.id, 'Rejected', reason);
                                                    }}>
                                                    <X size={14} /> Reject
                                                </button>
                                            </div>
                                        )}
                                        {req.status !== 'Pending' && (
                                            <span style={{fontSize: '12px', color: 'var(--muted)'}}>
                                                Reviewed by {req.reviewed_by_name}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
)}
```

**Add imports** (top of file):
```javascript
import { ..., PlusCircle, Bell, Check } from 'lucide-react';
```

---

### Task 3 & 5: Add "Other Payments" Tab + Clean Payment Modal

**Add new tab** to tabs array (around line 80):
```javascript
const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'vendors', label: 'Vendors', icon: Building },
    { id: 'rent', label: 'Rent', icon: Home },
    { id: 'utilities', label: 'Utilities', icon: Zap },
    { id: 'all', label: 'All Expenses', icon: List },
    { id: 'other', label: 'Other Payments', icon: PlusCircle }, // ADD THIS
];
```

**Add state for "Other Payments"**:
```javascript
const [otherPayments, setOtherPayments] = useState([]);
const [showOtherPaymentModal, setShowOtherPaymentModal] = useState(false);
const [otherPaymentForm, setOtherPaymentForm] = useState({
    payee_name: '',
    amount: '',
    payment_method: 'Cash',
    payment_date: new Date().toISOString().slice(0, 16),
    description: '',
    branch_id: null
});
const [paymentSuggestions, setPaymentSuggestions] = useState([]);
```

**Add fetch function**:
```javascript
const fetchPaymentSuggestions = async () => {
    if (!['Admin', 'Accountant'].includes(user.role)) return;
    try {
        const res = await api.get('/api/payment-suggestions', { params: { min_occurrences: 3 } });
        setPaymentSuggestions(res.data);
    } catch (err) {
        console.error('Failed to load payment suggestions:', err);
    }
};

const createOtherPayment = async (e) => {
    e.preventDefault();
    try {
        await api.post('/api/payments', {
            ...otherPaymentForm,
            type: 'Other',
            cash_amount: otherPaymentForm.payment_method === 'Cash' ? otherPaymentForm.amount : 0,
            upi_amount: otherPaymentForm.payment_method === 'UPI' ? otherPaymentForm.amount : 0
        });
        showSuccess('Payment recorded successfully');
        setShowOtherPaymentModal(false);
        setOtherPaymentForm({
            payee_name: '',
            amount: '',
            payment_method: 'Cash',
            payment_date: new Date().toISOString().slice(0, 16),
            description: '',
            branch_id: null
        });
        await fetchAllExpenses(); // Refresh expense list
        await fetchPaymentSuggestions(); // Refresh suggestions
    } catch (err) {
        showError(err.response?.data?.error || 'Failed to record payment');
    }
};
```

**Add tab content** (in the render section, after "all" tab):
```jsx
{/* Other Payments Tab */}
{activeTab === 'other' && (
    <div className="em-section">
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
            <h3 className="em-section-title">
                <PlusCircle size={20} />
                Other Payments
            </h3>
            <button className="btn btn-primary btn-sm" onClick={() => setShowOtherPaymentModal(true)}>
                <Plus size={16} />
                Record Payment
            </button>
        </div>

        {/* Payment Suggestions (Admin/Accountant only) */}
        {['Admin', 'Accountant'].includes(user.role) && paymentSuggestions.length > 0 && (
            <div className="em-card" style={{marginBottom: '20px', borderLeft: '4px solid #f59e0b'}}>
                <div className="em-card__title">
                    <Lightbulb size={18} style={{color: '#f59e0b'}} />
                    Smart Suggestions
                </div>
                <p style={{fontSize: '13px', color: 'var(--muted)', marginBottom: '12px'}}>
                    These payees appear multiple times in "Other" payments. Consider adding them as vendors.
                </p>
                <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                    {paymentSuggestions.slice(0, 5).map(sug => (
                        <div key={sug.id} className="em-list__item" style={{padding: '10px', background: 'var(--surface)'}}>
                            <div className="em-list__info">
                                <div className="em-list__name">{sug.payee_name}</div>
                                <div className="em-list__meta">
                                    {sug.occurrence_count} payment{sug.occurrence_count !== 1 ? 's' : ''} · 
                                    Total: {fmt(sug.total_amount_paid)}
                                </div>
                            </div>
                            <button className="btn btn-primary btn-sm"
                                onClick={async () => {
                                    if (confirm(`Add "${sug.payee_name}" as a vendor?`)) {
                                        try {
                                            await api.post('/api/vendors', {
                                                name: sug.payee_name,
                                                type: 'Vendor',
                                                branch_id: null
                                            });
                                            await api.put(`/api/payment-suggestions/${sug.id}/convert`);
                                            showSuccess(`${sug.payee_name} added as vendor`);
                                            await fetchVendors();
                                            await fetchPaymentSuggestions();
                                        } catch (err) {
                                            showError('Failed to add vendor');
                                        }
                                    }
                                }}>
                                Add as Vendor
                            </button>
                            <button className="btn btn-icon"
                                onClick={async () => {
                                    await api.put(`/api/payment-suggestions/${sug.id}/dismiss`);
                                    await fetchPaymentSuggestions();
                                }}>
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* Recent Other Payments */}
        <div className="em-table-wrap">
            <table className="em-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Payee</th>
                        <th>Description</th>
                        <th>Method</th>
                        <th>Amount</th>
                        {user.role === 'Admin' && <th>Actions</th>}
                    </tr>
                </thead>
                <tbody>
                    {allExpenses.filter(e => e.type === 'Other').map(exp => (
                        <tr key={exp.id}>
                            <td>{new Date(exp.payment_date).toLocaleDateString()}</td>
                            <td style={{fontWeight: 600}}>{exp.payee_name}</td>
                            <td className="em-desc-cell">{exp.description || '—'}</td>
                            <td>{exp.payment_method}</td>
                            <td className="em-amount-cell">{fmt(exp.amount)}</td>
                            {user.role === 'Admin' && (
                                <td>
                                    <button className="btn btn-icon" onClick={() => deleteExpense(exp.id)}>
                                        <Trash2 size={14} />
                                    </button>
                                </td>
                            )}
                        </tr>
                    ))}
                    {allExpenses.filter(e => e.type === 'Other').length === 0 && (
                        <tr><td colSpan="6" className="em-empty-text">No other payments recorded</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    </div>
)}
```

**Add clean payment modal** (at bottom):
```jsx
{/* Clean "Other Payment" Modal */}
{showOtherPaymentModal && (
    <div className="modal-backdrop" onClick={() => setShowOtherPaymentModal(false)}>
        <div className="em-modal" onClick={e => e.stopPropagation()}>
            <div className="em-modal__header">
                <h2>Record Other Payment</h2>
                <button className="btn btn-icon" onClick={() => setShowOtherPaymentModal(false)}>
                    <X size={18} />
                </button>
            </div>
            <form onSubmit={createOtherPayment}>
                <div className="em-modal__body">
                    {error && <div className="em-error">{error}</div>}
                    <div className="em-form-grid">
                        <div className="em-form-group em-form-group--full">
                            <label>Payee Name *</label>
                            <input className="em-input" value={otherPaymentForm.payee_name} required
                                onChange={e => setOtherPaymentForm({...otherPaymentForm, payee_name: e.target.value})}
                                placeholder="Who are you paying?" />
                        </div>
                        <div className="em-form-group">
                            <label>Amount *</label>
                            <input type="number" className="em-input" value={otherPaymentForm.amount} required
                                onChange={e => setOtherPaymentForm({...otherPaymentForm, amount: e.target.value})}
                                placeholder="0.00" step="0.01" />
                        </div>
                        <div className="em-form-group">
                            <label>Payment Method *</label>
                            <select className="em-input" value={otherPaymentForm.payment_method}
                                onChange={e => setOtherPaymentForm({...otherPaymentForm, payment_method: e.target.value})}>
                                <option value="Cash">Cash</option>
                                <option value="UPI">UPI</option>
                                <option value="Cheque">Cheque</option>
                                <option value="Bank Transfer">Bank Transfer</option>
                            </select>
                        </div>
                        <div className="em-form-group">
                            <label>Payment Date *</label>
                            <input type="datetime-local" className="em-input" value={otherPaymentForm.payment_date} required
                                onChange={e => setOtherPaymentForm({...otherPaymentForm, payment_date: e.target.value})} />
                        </div>
                        <div className="em-form-group">
                            <label>Branch</label>
                            <select className="em-input" value={otherPaymentForm.branch_id || ''}
                                onChange={e => setOtherPaymentForm({...otherPaymentForm, branch_id: e.target.value || null})}>
                                <option value="">All Branches</option>
                                {branches.map(b => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="em-form-group em-form-group--full">
                            <label>Description</label>
                            <textarea className="em-input" rows={3} value={otherPaymentForm.description}
                                onChange={e => setOtherPaymentForm({...otherPaymentForm, description: e.target.value})}
                                placeholder="What is this payment for?" />
                        </div>
                    </div>
                </div>
                <div className="em-modal__footer">
                    <button type="button" className="btn btn-ghost btn-sm"
                        onClick={() => setShowOtherPaymentModal(false)}>Cancel</button>
                    <button type="submit" className="btn btn-primary btn-sm">Record Payment</button>
                </div>
            </form>
        </div>
    </div>
)}
```

**Add imports**:
```javascript
import { ..., Lightbulb } from 'lucide-react';
```

**Call fetchPaymentSuggestions** in useEffect:
```javascript
useEffect(() => {
    fetchDashboard();
    fetchVendors();
    fetchVendorRequests();
    fetchPaymentSuggestions(); // ADD THIS
}, [month, branchFilter]);
```

---

## 🎯 Final Result

After implementing the above changes:

1. ✅ **UI is fully visible** — All text readable in both light & dark modes
2. ✅ **No separate Payments page** — Everything in Expense Manager
3. ✅ **Front Office can request** new vendors/utilities
4. ✅ **Admin/Accountant review** and approve/reject requests
5. ✅ **Smart suggestions** — System detects repeated "Other" payments and suggests adding as vendor
6. ✅ **Clean payment modal** — Big, focused screen with only essential fields
7. ✅ **All payments tracked** — "Other" payment frequency automatically monitored

---

## 🔄 To Apply Next Session

1. Start server: `cd "d:\software sarga\server"; npm start`
2. Start client: `cd "d:\software sarga\client"; npm run dev`
3. Login and test Expense Manager
4. Copy the code sections from **Tasks 2, 3, 5** above into ExpenseManager.jsx
5. Test all features:
   - Front Office → Request new vendor
   - Admin → Review and approve request
   - Any role → Record "Other" payment
   - Admin → See smart suggestions after 3+ repeated payments
   - Admin → Convert suggestion to vendor

---

## Database Migration Command

Run this to create the new tables:
```bash
cd "d:\software sarga\server"
node -e "require('./database').initDb().then(() => { console.log('✅ Database updated'); process.exit(0); }).catch(e => { console.error(e); process.exit(1); })"
```
