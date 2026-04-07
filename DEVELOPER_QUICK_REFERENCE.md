# 🛠️ Developer Quick Reference - SARGA
**Common tasks, patterns, and solutions**

---

## 🚀 Getting Started

### Initial Setup
```bash
# Backend setup
cd server
npm install
# Configure .env with database credentials
node index.js          # Runs on port 3000 (or configured PORT)

# Frontend setup (in new terminal)
cd client
npm install
npm run dev            # Vite dev server with HMR (http://localhost:5173)
```

### Environment Variables
Create `server/.env`:
```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=sarga
API_PORT=3000
NODE_ENV=development
VITE_API_BASE_URL=http://localhost:3000
```

---

## 📂 File Organization Patterns

### Adding a New Feature

**1. Backend Route**
`server/routes/feature-name.js`
```javascript
const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /api/feature-name
router.get('/', requireAuth, (req, res) => {
  try {
    // Implementation
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

**2. Register Route in `server/index.js`**
```javascript
const featureRoutes = require('./routes/feature-name');
app.use('/api/feature-name', featureRoutes);
```

**3. Frontend Component**
`client/src/pages/FeatureName.jsx`
```javascript
import { useEffect, useState } from 'react';
import { api } from '../services/api';

export default function FeatureName() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await api.get('/feature-name');
      setData(response.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading...</div>;
  return <div>{/* Render data */}</div>;
}
```

---

## 🔑 Key Patterns & Solutions

### Pattern 1: Auto-Refetch After Navigation (Payment Flow)
**Problem:** Stale data after returning from sub-page
**Solution:** Use location state to trigger refetch

```javascript
// Page that needs refetch
const [refreshTrigger, setRefreshTrigger] = useState(0);
const location = useLocation();

useEffect(() => {
  if (location.state?.shouldRefresh) {
    setRefreshTrigger(prev => prev + 1);
  }
}, [location]);

useEffect(() => {
  fetchData();
}, [refreshTrigger]);
```

```javascript
// Sub-page that triggers refetch
const navigate = useNavigate();
const handleSavePayment = async () => {
  await api.post('/customer-payments', payload);
  navigate('/customer-details', { 
    state: { shouldRefresh: true, customerId } 
  });
};
```

**Used in:** [CustomerDetails.jsx](client/src/pages/CustomerDetails.jsx), [CustomerPayments.jsx](client/src/pages/CustomerPayments.jsx)

---

### Pattern 2: Auto-SKU Generation
**Problem:** Need unique product identifiers without manual input
**Solution:** Generate based on category + sequence number

```javascript
// Backend generation
const generateAutoSKU = (categoryName, id) => {
  // Extract first 3 alpha characters, uppercase
  const prefix = (categoryName.match(/[a-zA-Z]/g) || [])
    .slice(0, 3)
    .join('')
    .toUpperCase() || 'INV';
  
  const paddedId = String(id).padStart(4, '0');
  return `${prefix}-${paddedId}`;  // e.g., "MEM-0042"
};

// Usage in POST /inventory
const autoSKU = generateAutoSKU(categoryName, lastId + 1);
```

**Used in:** [inventory.js](server/routes/inventory.js), [vendors.js](server/routes/vendors.js)

---

### Pattern 3: Multi-Branch Scoping
**Problem:** Need to filter data by branch without repeating checks
**Solution:** Use branch middleware helper

```javascript
// In route handler
const { requireAuth, requireAdmin, getBranchId } = require('../middleware/branchFilter');

router.get('/', requireAuth, (req, res) => {
  const branchId = getBranchId(req, res);
  if (!branchId) return res.status(403).json({ error: 'Unauthorized' });
  
  // Query with branch filtering
  db.query('SELECT * FROM table WHERE branch_id = ?', [branchId], (err, rows) => {
    res.json(rows);
  });
});
```

**Used in:** [branchFilter.js](server/middleware/branchFilter.js)

---

### Pattern 4: Stock Deduction on Payment
**Problem:** Need to prevent negative stock when creating bills
**Solution:** Use GREATEST() to enforce minimum 0

```javascript
// In customerPayments route - stock deduction
const updateStockQuery = `
  UPDATE sarga_inventory 
  SET quantity = GREATEST(quantity - ?, 0)
  WHERE id = ? AND branch_id = ?
`;
db.query(updateStockQuery, [lineItem.quantity, lineItem.inventory_item_id, branchId]);
```

**Used in:** [customerPayments.js](server/routes/customerPayments.js)

---

### Pattern 5: Vendor Name De-duplication
**Problem:** Smart bill upload creates duplicate vendors with variations (e.g., with fiscal year suffixes)
**Solution:** Normalize vendor name before insert

```javascript
// Normalize: trim + collapse spaces + remove fiscal suffix + lowercase
const normalizeVendorName = (name) => {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*\(\d{4}-\d{4}\)$/, '')  // Remove fiscal suffix
    .toLowerCase();
};

// Check for existing vendor
const normalizedName = normalizeVendorName(vendorName);
const existing = db.query(
  'SELECT id FROM sarga_vendors WHERE LOWER(TRIM(name)) = ?',
  [normalizedName]
);
```

**Used in:** [expenses-extended.js](server/routes/expenses-extended.js)

---

### Pattern 6: API URL Handling
**Problem:** File URLs broken when API_URL has trailing slash
**Solution:** Strip `/api` with regex

```javascript
// In api.js
const fileBaseUrl = VITE_API_BASE_URL.replace(/\/api\/?$/, '');
const imageUrl = fileBaseUrl + response.data.image_url;

// For dashboard, use fileBaseUrl not VITE_API_URL
const dashboardImageSrc = fileBaseUrl + inventoryItem.image_url;
```

**Used in:** [api.js](client/src/services/api.js), [Billing.jsx](client/src/pages/Billing.jsx)

---

## 🧪 Testing Workflows

### Test Payment Flow (Manual)
1. Navigate to Customers dashboard
2. Click "Add Work" → Billing
3. Add 2-3 items with quantities
4. Click "Create Bill"
5. Enter payment amount
6. Click "Save Payment"
7. **Verify:** Redirected to Customer Details with updated balance

**Test File:** [DEPLOYMENT_CHECKLIST.md](../DEPLOYMENT_CHECKLIST.md#post-deployment-testing)

### Test QR Scanning
1. Go to Billing page
2. Click QR scanner input
3. Scan product QR code
4. **Verify:** Product appears in bill items with image preview

### Test Smart Bill Upload
1. Go to Expense Manager → Smart Bill Upload
2. Upload vendor PDF
3. **Verify:** Bill items extracted automatically, vendor created/linked
4. **Check:** Items appear in Inventory as new SKUs (e.g., MEM-0001)

### Database Verification
```bash
# Check stock deduction
mysql> SELECT id, quantity FROM sarga_inventory WHERE id = 1;

# Check vendor bills
mysql> SELECT * FROM sarga_vendor_bills ORDER BY created_at DESC;

# Check payment items
mysql> SELECT * FROM sarga_payment_items WHERE payment_id = ?;
```

---

## 🐛 Common Issues & Solutions

### Issue: Stale data in Customer Details after payment
**Root Cause:** Component doesn't refetch when returning from payment page
**Solution:** Add location.state refetch trigger (see Pattern 1)
**Verification:** Check for `useLocation()` hook + `shouldRefresh` trigger

---

### Issue: QR code not scanning in Billing
**Root Cause:** QR format or camera permission
**Solution:** Test with hardcoded QR string; check browser console for errors
**Files:** [Billing.jsx](client/src/pages/Billing.jsx)

---

### Issue: Smart bill upload not creating inventory items
**Root Cause:** OCR extraction failed or line_items not parsed
**Solution:** Check `/eng.traineddata` file exists; verify PDF quality
**Debug:** Log extraction output in [expenses-extended.js](server/routes/expenses-extended.js)

---

### Issue: Stock going negative
**Root Cause:** Missing `GREATEST()` in UPDATE query
**Solution:** Ensure query uses `GREATEST(quantity - ?, 0)`
**Files:** [customerPayments.js](server/routes/customerPayments.js)

---

### Issue: Duplicate vendors created
**Root Cause:** Vendor name variations not normalized (with fiscal suffix)
**Solution:** Use normalization function before insert (see Pattern 5)
**Files:** [expenses-extended.js](server/routes/expenses-extended.js)

---

### Issue: Frontend can't connect to API
**Root Cause:** VITE_API_BASE_URL misconfigured or API not running
**Solution:** 
1. Check `client/.env.local` or `vite.config.js`
2. Verify `node server/index.js` is running
3. Check browser console for CORS errors
**Files:** [api.js](client/src/services/api.js)

---

## 📊 Database Quick Commands

### Backup Database
```bash
mysqldump -u root -p sarga > sarga_backup.sql
```

### Restore Database
```bash
mysql -u root -p sarga < sarga_backup.sql
```

### Check Schema
```sql
DESCRIBE sarga_customers;
DESCRIBE sarga_jobs;
DESCRIBE sarga_inventory;
DESCRIBE sarga_vendors;
```

### Check Data Integrity
```sql
-- Verify branch scoping
SELECT COUNT(*) FROM sarga_customers WHERE branch_id IS NULL;

-- Check for orphaned records
SELECT * FROM sarga_jobs WHERE customer_id NOT IN (SELECT id FROM sarga_customers);

-- Inventory stock check
SELECT * FROM sarga_inventory WHERE quantity < 0;

-- Outstanding vendor balance
SELECT name, SUM(amount) as total FROM sarga_vendor_bills 
WHERE status != 'Paid' GROUP BY vendor_id;
```

---

## 🎨 UI/Component Patterns

### Adding a New Page
1. Create `.jsx` file in `client/src/pages/`
2. Add route in `App.jsx`
3. Import common components/services
4. Follow component structure:
```javascript
export default function PageName() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => { /* Data fetch */ }, []);
  
  if (loading) return <LoadingSpinner />;
  if (!data) return <ErrorMessage />;
  
  return (
    <div className="page-container">
      {/* JSX */}
    </div>
  );
}
```

### Styling
- Use CSS Variables for consistency: `var(--accent)`, `var(--error)`, etc.
- Component-scoped CSS: `PageName.css` in same directory
- See [OfflineTestPage.css](client/src/pages/OfflineTestPage.css) for examples

### Forms
- Use controlled inputs with `useState`
- Validate before submit
- Show loading/error states
- Handle API errors gracefully

```javascript
const [formData, setFormData] = useState({ name: '', email: '' });
const [error, setError] = useState(null);

const handleChange = (e) => setFormData({ 
  ...formData, 
  [e.target.name]: e.target.value 
});

const handleSubmit = async (e) => {
  e.preventDefault();
  try {
    await api.post('/endpoint', formData);
    // Success
  } catch (err) {
    setError(err.message);
  }
};
```

---

## 🔄 Git Workflow (if using version control)

```bash
# Before working on a feature
git pull origin main

# Create feature branch
git checkout -b feature/feature-name

# Commit changes
git add .
git commit -m "feat: brief description"

# Push to remote
git push origin feature/feature-name

# Create Pull Request, get review

# Merge after approval
git checkout main
git merge feature/feature-name
git push origin main
```

---

## 📚 Learning Resources

- React Hooks: https://react.dev/reference/react
- Express.js: https://expressjs.com/
- MySQL: https://dev.mysql.com/doc/
- Vite: https://vitejs.dev/guide/
- QR Code: https://github.com/davidshimjs/qrcodejs
- Tesseract OCR: https://github.com/naptha/tesseract.js

---

## 🎯 Development Checklist

Before pushing code:
- [ ] Code follows existing patterns
- [ ] Error handling implemented
- [ ] API validation added
- [ ] Database queries optimized
- [ ] Frontend tested in dev server
- [ ] No console errors/warnings
- [ ] Comments added for complex logic
- [ ] Tested on multiple branches (if multi-branch)
- [ ] Backward compatibility verified

---

## 🚀 Deployment Checklist

- [ ] Run `npm run lint` (client)
- [ ] Run `npm run build` (client)
- [ ] Test API endpoints
- [ ] Run full test suite ([DEPLOYMENT_CHECKLIST.md](../DEPLOYMENT_CHECKLIST.md))
- [ ] Backup database
- [ ] Deploy to staging first
- [ ] Verify in staging
- [ ] Deploy to production
- [ ] Monitor logs for errors

---

**Last Updated:** 2024  
**For detailed guides, see:** [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)
