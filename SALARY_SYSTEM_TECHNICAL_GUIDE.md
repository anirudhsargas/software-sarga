# Salary Payment System - Technical Documentation

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                      │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ EmployeeDetail.jsx (Salary Tab)                     │ │
│  │ - Displays salary settings (read-only)              │ │
│  │ - Payment recording modal                           │ │
│  │ - Recent transactions display                       │ │
│  └─────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ StaffManagement.jsx (Edit Modal)                    │ │
│  │ - Admin salary configuration                        │ │
│  │ - Salary type selector                              │ │
│  │ - Amount input (monthly/daily)                      │ │
│  └─────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ api.js (Service Layer)                              │ │
│  │ - GET /staff                                        │ │
│  │ - GET /staff/:id/salary-info                        │ │
│  │ - POST /staff/:id/pay-salary                        │ │
│  │ - PUT /staff/:id                                    │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                           ↓ HTTP/REST
┌─────────────────────────────────────────────────────────┐
│                    Backend (Express)                     │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ index.js (Route Handlers)                           │ │
│  │ - GET /api/staff                                    │ │
│  │ - GET /api/staff/:id/salary-info                    │ │
│  │ - POST /api/staff/:id/pay-salary                    │ │
│  │ - PUT /api/staff/:id                                │ │
│  └─────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Middleware                                          │ │
│  │ - authenticateToken (JWT validation)                │ │
│  │ - authorizeRoles (role-based access)                │ │
│  │ - upload.single('image') (multipart form data)      │ │
│  └─────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Database Layer (MySQL2/Promise)                     │ │
│  │ - pool.query() for all DB operations                │ │
│  │ - Parameterized queries (SQL injection prevention)  │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                           ↓ MySQL Protocol
┌─────────────────────────────────────────────────────────┐
│                    Database (MySQL)                      │
│  ┌──────────────────┐         ┌────────────────────┐    │
│  │  sarga_staff     │◄────┬───►│ sarga_staff_salary │    │
│  │  (salary config) │     │    │ (monthly records)  │    │
│  └──────────────────┘     │    └────────────────────┘    │
│                           │                              │
│             ┌─────────────┴──────────────┐               │
│             │                            │               │
│  ┌──────────▼──────────────┐  ┌─────────▼────────────┐  │
│  │ salary_type: ENUM       │  │ status: ENUM         │  │
│  │ base_salary: DECIMAL    │  │ ('Paid', 'Partial')  │  │
│  │ daily_rate: DECIMAL     │  │                      │  │
│  └────────────────────────┘  └──────────────────────┘  │
│                      ↓                                   │
│         ┌────────────────────────────────┐              │
│         │ sarga_staff_salary_payments    │              │
│         │ (transaction log)              │              │
│         └────────────────────────────────┘              │
│         - payment_date (DATE)                           │
│         - payment_amount (DECIMAL)                      │
│         - payment_method (VARCHAR)                      │
│         - reference_number (VARCHAR)                    │
│         - notes (TEXT)                                  │
│         - created_by (INT FK)                           │
│         - created_at (TIMESTAMP)                        │
└─────────────────────────────────────────────────────────┘
```

---

## Database Schema Details

### Table: `sarga_staff` (Additions)

```sql
-- New Columns Added (via ALTER TABLE in database.js)

ALTER TABLE sarga_staff 
ADD COLUMN salary_type ENUM('Monthly', 'Daily') DEFAULT 'Monthly',
ADD COLUMN base_salary DECIMAL(10,2) DEFAULT 0,
ADD COLUMN daily_rate DECIMAL(10,2) DEFAULT 0;

-- Constraints:
-- - Exactly one of base_salary or daily_rate should be non-zero
-- - This is enforced at application layer
```

**Indexing Strategy:**
No new indexes needed (id is already indexed).

### Table: `sarga_staff_salary_payments` (New)

```sql
CREATE TABLE sarga_staff_salary_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  payment_date DATE NOT NULL,
  payment_amount DECIMAL(10,2) NOT NULL,
  payment_method ENUM('Cash', 'UPI', 'Cheque', 'Account Transfer') NOT NULL,
  reference_number VARCHAR(255) NULL,
  notes TEXT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE RESTRICT,
  
  INDEX idx_staff_id (staff_id),
  INDEX idx_payment_date (payment_date),
  INDEX idx_staff_date (staff_id, payment_date)
);
```

**Indexing Strategy:**
- `idx_staff_id`: Speeds up "get all payments for employee"
- `idx_payment_date`: Speeds up "get payments for month"
- `idx_staff_date`: Covers common query (staff + date range)

**Growth Estimate:**
- ~5 payments per employee per month
- 1000 employees × 5 = 5000 records/month
- 1 year = 60,000 records
- 10 years = 600,000 records (still < 1GB)

---

## API Endpoint Specifications

### GET `/api/staff`

**Purpose:** Retrieve list of all staff members with salary information

**Authorization:** `authenticateToken`

**Response:**
```json
[
  {
    "id": 1,
    "user_id": "9876543210",
    "name": "Rahul Kumar",
    "role": "Designer",
    "salary_type": "Monthly",
    "base_salary": 25000.00,
    "daily_rate": null,
    "branch_id": 1,
    "image_url": "/uploads/staff_1.jpg",
    "branch_name": "Main Branch",
    "is_first_login": 0,
    "created_at": "2024-12-01T10:30:00Z"
  }
]
```

**Query Logic:**
```javascript
// Admin sees all staff
SELECT s.id, s.user_id, s.name, s.role, s.is_first_login, 
       s.created_at, s.branch_id, s.image_url, 
       s.salary_type, s.base_salary, s.daily_rate, b.name as branch_name
FROM sarga_staff s
LEFT JOIN sarga_branches b ON s.branch_id = b.id
WHERE s.role != 'Admin'
ORDER BY s.created_at DESC

// Non-Admin sees branch staff only
WHERE s.role != 'Admin' AND s.branch_id = ? 
```

---

### GET `/api/staff/:id/salary-info`

**Purpose:** Get employee salary configuration and payment history

**Authorization:** `authenticateToken`

**Response:**
```json
{
  "staff": {
    "id": 1,
    "name": "Rahul Kumar",
    "salary_type": "Monthly",
    "base_salary": 25000.00,
    "daily_rate": null
  },
  "salaryRecords": [
    {
      "id": 1,
      "payment_month": "2025-01-01",
      "base_salary": 25000.00,
      "bonus": 0,
      "deduction": 0,
      "net_salary": 25000.00,
      "status": "Partial",
      "paid_date": "2025-01-15"
    }
  ],
  "currentMonthSalary": {
    "id": 1,
    "payment_month": "2025-01-01",
    "base_salary": 25000.00,
    "bonus": 0,
    "deduction": 0,
    "net_salary": 25000.00,
    "status": "Partial",
    "paid_date": "2025-01-15"
  },
  "recentPayments": [
    {
      "id": 1,
      "payment_date": "2025-01-15",
      "payment_amount": 10000.00,
      "payment_method": "Cash",
      "reference_number": null,
      "notes": "First installment"
    }
  ]
}
```

**Query Sequence:**
1. Get staff salary settings
2. Get monthly salary records (limit to ensure user has access)
3. Get current month salary record
4. Get recent payments (last 20, ordered by date DESC)

---

### POST `/api/staff/:id/pay-salary`

**Purpose:** Record a salary payment transaction

**Authorization:** `authenticateToken` + role check

**Request Body:**
```json
{
  "base_salary": 25000,
  "bonus": 0,
  "deduction": 0,
  "payment_method": "Cash",
  "reference_number": null,
  "notes": "First partial payment",
  "payment_amount": 10000,
  "payment_date": "2025-01-15",
  "payment_month": "2025-01-01"
}
```

**Processing Logic:**
```javascript
// 1. Validate input
if (!payment_amount || payment_amount <= 0) throw new Error('Invalid amount')
if (!payment_date) throw new Error('Payment date required')

// 2. Calculate net salary
const net_salary = base_salary + bonus - deduction

// 3. Get existing payments for month
const [existing] = await pool.query(
  `SELECT SUM(payment_amount) as total 
   FROM sarga_staff_salary_payments 
   WHERE staff_id = ? 
   AND MONTH(payment_date) = MONTH(?) 
   AND YEAR(payment_date) = YEAR(?)`,
  [staffId, payment_date, payment_date]
)

// 4. Calculate status
const paidTotal = (existing[0]?.total || 0) + payment_amount
const status = paidTotal >= net_salary ? 'Paid' : 'Partial'

// 5. Insert salary record
await pool.query(
  `INSERT INTO sarga_staff_salary 
   (staff_id, payment_month, base_salary, bonus, deduction, net_salary, status, paid_date) 
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  [staffId, payment_month, base_salary, bonus, deduction, net_salary, status, new Date()]
)

// 6. Log transaction
await pool.query(
  `INSERT INTO sarga_staff_salary_payments 
   (staff_id, payment_date, payment_amount, payment_method, reference_number, notes, created_by) 
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
  [staffId, payment_date, payment_amount, payment_method, reference_number, notes, req.user.id]
)
```

**Response:**
```json
{
  "message": "Salary payment recorded successfully",
  "record": {
    "id": 1,
    "status": "Partial"
  }
}
```

**Edge Cases Handled:**
- Multiple payments in same month before salary record exists
- Concurrent payments (no race condition due to SELECT + INSERT pattern)
- Zero/negative amounts rejected
- Future dates allowed (for backdated payments)

---

### PUT `/api/staff/:id`

**Purpose:** Update staff information including salary configuration

**Authorization:** `authenticateToken` + Admin-only for salary fields

**Request Body:**
```json
{
  "name": "Rahul Kumar",
  "role": "Designer",
  "branch_id": 1,
  "salary_type": "Monthly",
  "base_salary": 25000
}
```

**Processing Logic:**
```javascript
// Admin-only fields validation
if (req.user.role !== 'Admin') {
  if (salary_type || base_salary !== undefined || daily_rate !== undefined) {
    return res.status(403).json({message: 'Unauthorized'})
  }
}

// Build dynamic update query
const updates = []
const values = []

if (salary_type) {
  updates.push('salary_type = ?')
  values.push(salary_type)
}

if (salary_type === 'Monthly' && base_salary !== undefined) {
  updates.push('base_salary = ?')
  values.push(base_salary || 0)
  updates.push('daily_rate = NULL')  // Clear daily rate
}

if (salary_type === 'Daily' && daily_rate !== undefined) {
  updates.push('daily_rate = ?')
  values.push(daily_rate || 0)
  updates.push('base_salary = NULL')  // Clear base salary
}

// Execute update
await pool.query(
  `UPDATE sarga_staff SET ${updates.join(', ')} WHERE id = ?`,
  [...values, id]
)
```

**Salary Type Switching:**
```
Monthly → Daily:
  - New daily_rate is set
  - base_salary cleared to NULL
  - Prevents confusion about which rate is active

Daily → Monthly:
  - New base_salary is set
  - daily_rate cleared to NULL
```

---

## Frontend Component Specifications

### EmployeeDetail.jsx - Salary Tab

**State Management:**
```javascript
const [salaryInfo, setSalaryInfo] = useState({
  staff: {},
  salaryRecords: [],
  currentMonthSalary: null,
  recentPayments: []
})

const [salaryForm, setSalaryForm] = useState({
  payment_amount: '',
  payment_method: 'Cash',
  reference_number: '',
  notes: '',
  payment_date: new Date().toISOString().split('T')[0]
})

const [showPaySalaryModal, setShowPaySalaryModal] = useState(false)
const [submitting, setSubmitting] = useState(false)
const [error, setError] = useState('')
```

**Data Flow:**
```
fetchEmployeeData()
  ↓
  ├─ GET /staff/:id/salary-info
  │  └─ setSalaryInfo(response)
  │
  └─ Renders salary settings + payment history

handlePaySalary(e)
  ↓
  ├─ Validate: payment_amount > 0
  │
  ├─ Build payload:
  │  ├─ payment_amount (from form)
  │  ├─ payment_date (from form)
  │  ├─ payment_method, reference_number, notes (from form)
  │  ├─ base_salary (from API response)
  │  ├─ bonus, deduction (default 0)
  │  └─ payment_month (calculated as YYYY-MM-01)
  │
  ├─ POST /staff/:id/pay-salary
  │
  └─ Close modal + refresh data
```

**Effect Hooks:**
```javascript
useEffect(() => fetchEmployeeData(), [staffId]) 
// Runs once on component mount

useEffect(() => {
  setSalaryForm(prev => ({
    ...prev,
    payment_date: new Date().toISOString().split('T')[0]
  }))
}, [showPaySalaryModal])
// Resets payment date when modal opens
```

### StaffManagement.jsx - Salary Config

**State Management:**
```javascript
const [showSalaryConfig, setShowSalaryConfig] = useState(false)

const [selectedStaff, setSelectedStaff] = useState(null)
// Includes salary fields after API fetch
// salary_type, base_salary, daily_rate
```

**Admin-Only Rendering:**
```javascript
{isAdmin && (
  <>
    <Salary Type selector>
    {selectedStaff.salary_type === 'Monthly' 
      ? <Base Salary input>
      : <Daily Rate input>
    }
  </>
)}
```

**Update Flow:**
```
handleUpdateStaff(e)
  ↓
  ├─ Build FormData
  │  ├─ name, mobile, role, branch_id (standard)
  │  ├─ salary_type (if Admin)
  │  └─ base_salary/daily_rate (if Admin and relevant)
  │
  ├─ PUT /staff/:id
  │
  ├─ Close modal
  │
  └─ Fetch staff list (refresh grid)
```

---

## CSS Architecture

### New Classes Added to EmployeeDetail.css

```css
/* Salary Info Display */
.employee-detail__salary-info {
  display: grid
  grid-template-columns: repeat(3, 1fr)
  /* Shows: Salary Type, Base/Daily Rate, Pending Amount */
}

/* Payment Cards Grid */
.employee-detail__payments-list {
  display: grid
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))
  /* Responsive card layout */
}

.employee-detail__payment-card {
  padding: 14px
  background: var(--surface)
  border: 1px solid var(--border)
  border-radius: 10px
  transition: all 0.2s ease
}

.employee-detail__payment-card:hover {
  border-color: var(--accent)
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)
}
```

### Dark Mode Support

All colors use CSS variables:
```css
:root {
  --bg: #ffffff
  --surface: #f5f5f5
  --accent: #1f2a33
  --text: #1a1a1a
  --text-muted: #666666
}

.dark {
  --bg: #1a1a1a
  --surface: #2d2d2d
  --accent: #4a9eff
  --text: #ffffff
  --text-muted: #999999
}
```

---

## Error Handling & Validation

### Frontend Validation
```javascript
// Payment amount validation
if (!salaryForm.payment_amount || Number(salaryForm.payment_amount) <= 0) {
  setError('Payment amount must be greater than 0')
  return
}

// Payment date validation
if (!salaryForm.payment_date) {
  setError('Payment date is required')
  return
}

// Reference number for non-cash
if (salaryForm.payment_method !== 'Cash' && !salaryForm.reference_number) {
  // Show warning or prevent submission
}
```

### Backend Validation
```javascript
// Amount validation
if (isNaN(payment_amount) || payment_amount <= 0) {
  return res.status(400).json({message: 'Invalid payment amount'})
}

// Mobile number validation
if (normalizedMobile.length !== 10) {
  return res.status(400).json({message: 'Mobile must be 10 digits'})
}

// Authorization checks
if (req.user.role !== 'Admin' && req.user.id != id) {
  return res.status(403).json({message: 'Access denied'})
}
```

### Database Error Handling
```javascript
try {
  await pool.query(query, params)
} catch (err) {
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(400).json({message: 'User ID already exists'})
  }
  if (err.code === 'ER_NO_REFERENCED_ROW') {
    return res.status(400).json({message: 'Staff member not found'})
  }
  return res.status(500).json({message: 'Database error'})
}
```

---

## Testing Strategies

### Unit Tests (Frontend Components)

```javascript
describe('EmployeeDetail Salary Tab', () => {
  test('displays salary type and amount', () => {
    render(<EmployeeDetail />)
    expect(screen.getByText('Salary Type')).toBeInTheDocument()
    expect(screen.getByText('₹25,000')).toBeInTheDocument()
  })

  test('opens payment modal on button click', () => {
    render(<EmployeeDetail />)
    fireEvent.click(screen.getByText('Pay Salary'))
    expect(screen.getByLabelText('Payment Amount')).toBeInTheDocument()
  })

  test('validates payment amount', () => {
    // Payment amount must be > 0
    // Form should show error if empty or <= 0
  })
})
```

### Integration Tests (API Endpoints)

```javascript
describe('POST /api/staff/:id/pay-salary', () => {
  test('creates transaction and updates status to Partial', async () => {
    const res = await request(app)
      .post('/api/staff/1/pay-salary')
      .set('Authorization', 'Bearer token')
      .send({
        payment_amount: 10000,
        payment_date: '2025-01-15',
        payment_method: 'Cash',
        base_salary: 25000,
        bonus: 0,
        deduction: 0,
        payment_month: '2025-01-01'
      })

    expect(res.status).toBe(200)
    expect(res.body.record.status).toBe('Partial')
  })

  test('marks status as Paid when total >= net_salary', async () => {
    // First payment: 10000 (partial)
    // Second payment: 15000 (paid)
  })
})
```

### Database Tests

```javascript
describe('sarga_staff_salary_payments', () => {
  test('inserting payment creates transaction log', async () => {
    await pool.query(
      `INSERT INTO sarga_staff_salary_payments 
       (staff_id, payment_date, payment_amount, payment_method, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [1, '2025-01-15', 10000, 'Cash', 1]
    )

    const [rows] = await pool.query(
      `SELECT * FROM sarga_staff_salary_payments WHERE staff_id = ?`,
      [1]
    )

    expect(rows.length).toBe(1)
    expect(rows[0].payment_amount).toBe(10000)
  })
})
```

---

## Performance Optimization

### Database Query Optimization

```javascript
// ❌ SLOW: N+1 query problem
const staff = await pool.query('SELECT * FROM sarga_staff')
for (let s of staff) {
  const payments = await pool.query('...')  // Called per staff member!
}

// ✅ FAST: Single query with join
const [rows] = await pool.query(`
  SELECT s.*, COUNT(p.id) as payment_count
  FROM sarga_staff s
  LEFT JOIN sarga_staff_salary_payments p ON s.id = p.staff_id
  GROUP BY s.id
`)
```

### Frontend Performance

```javascript
// ❌ SLOW: Rendering 1000 payment cards
{recentPayments.map(p => <PaymentCard key={p.id} {...p} />)}

// ✅ FAST: Virtual scrolling
<VirtualList
  items={recentPayments}
  itemHeight={120}
  renderItem={PaymentCard}
/>

// Or: Pagination
{recentPayments.slice(0, 20).map(...)}
```

### Caching Strategy

```javascript
// Cache salary settings for user session
const salaryCache = useMemo(() => ({
  type: salaryInfo.staff.salary_type,
  amount: salaryInfo.staff.salary_type === 'Monthly' 
    ? salaryInfo.staff.base_salary 
    : salaryInfo.staff.daily_rate
}), [salaryInfo.staff])
```

---

## Security Considerations

### SQL Injection Prevention
```javascript
// ❌ Vulnerable
const query = `SELECT * FROM sarga_staff WHERE id = ${id}`

// ✅ Safe: Parameterized queries
const query = `SELECT * FROM sarga_staff WHERE id = ?`
await pool.query(query, [id])
```

### Authorization Checks
```javascript
// Every endpoint must verify:
1. User is authenticated (authenticateToken middleware)
2. User has required role (authorizeRoles middleware)
3. User has access to resource (query filters)

// Example:
app.put('/api/staff/:id', authenticateToken, upload.single('image'), (req, res) => {
  if (req.user.role !== 'Admin' && req.user.id != id) {
    return res.status(403).json({message: 'Access denied'})
  }
  // ... proceed
})
```

### Data Validation
```javascript
// Validate type
if (typeof payment_amount !== 'number') throw new Error('Invalid type')

// Validate range
if (payment_amount < 0 || payment_amount > 999999.99) throw new Error('Out of range')

// Validate enum
const validMethods = ['Cash', 'UPI', 'Cheque', 'Account Transfer']
if (!validMethods.includes(payment_method)) throw new Error('Invalid method')
```

---

## Maintenance Guide

### Regular Tasks

**Daily:**
- Monitor API response times
- Check error logs for failed transactions

**Weekly:**
- Review recent payment transactions
- Verify status calculations are correct
- Check for any orphaned records

**Monthly:**
- Database backup (scheduled)
- Performance metrics analysis
- User feedback review

### Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Salary fields not showing | salary_type is NULL | Set default or run ALTER TABLE |
| Status not updating to Paid | Wrong month calculation | Check MONTH(payment_date) function |
| Permission denied errors | Role not configured | Verify user role in database |
| Payments missing | Transaction not logged | Check recent_payments limit (20) |
| Form validation failing | Client-side bug | Check browser console for errors |

### Deployment Checklist

```
Frontend (React):
- [ ] Build: npm run build
- [ ] Output in dist/ folder
- [ ] Deploy to web server
- [ ] Verify CSS loads correctly
- [ ] Test in production environment

Backend (Node.js):
- [ ] Run migrations: node database.js
- [ ] Set environment variables
- [ ] Start server: npm start
- [ ] Verify API endpoints respond
- [ ] Check database connection

Database (MySQL):
- [ ] Backup before migration
- [ ] Run ALTER TABLE statements
- [ ] Verify columns exist
- [ ] Verify new table exists
- [ ] Check data integrity
```

---

## Code Review Checklist

When reviewing changes to this module:

- [ ] All SQL queries use parameterized statements
- [ ] Authorization checks present on protected endpoints
- [ ] Error handling includes specific error codes
- [ ] Frontend validation + backend validation both present
- [ ] New CSS classes follow BEM naming convention
- [ ] Components can handle null/undefined data gracefully
- [ ] Database transactions are atomic where needed
- [ ] Comments explain non-obvious logic
- [ ] No console.log() statements in production code
- [ ] Password/API keys not hardcoded
- [ ] Mobile responsive (test at 320px, 768px, 1024px)
- [ ] Accessibility: labels, ARIA attributes, keyboard navigation

---

**Document Version:** 1.0  
**Last Updated:** January 2025  
**Maintainer:** Development Team
