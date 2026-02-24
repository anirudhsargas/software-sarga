# Quick Start: Using the New Salary System

## For Admins: Configure Employee Salary

1. Go to **Staff Management** page
2. Click the **Edit** button (pencil icon) on an employee
3. Scroll down to "Salary & Compensation" section
4. Select **Salary Type**:
   - **Monthly** → Enter Base Monthly Salary
   - **Daily** → Enter Daily Rate
5. Click **Update Details**
6. The employee is now configured!

---

## For Front Office: Record Salary Payments

### View Employee Dashboard
1. From Staff Management, click **Dashboard** icon for employee
2. Or search and navigate to employee detail page
3. Click on **Salary Management** tab

### Record a Payment
1. Click **Pay Salary** button
2. Fill in the form:
   - **Payment Amount*** - The amount being paid (e.g., ₹10,000)
   - **Payment Date*** - When the payment was made (defaults to today)
   - **Payment Method** - Cash / UPI / Cheque / Account Transfer
   - **Reference Number** - (if not cash) UTR or Cheque number
   - **Notes** - Any additional details
3. Click **Pay Now**
4. Payment is recorded in the transaction log

### View Payment Status
- **Paid** badge: Total received >= monthly salary
- **Partial** badge: Still pending some amount
- See exact pending amount in "Pending Payment" box
- Review all transactions in "Recent Payment Transactions" cards below

---

## Understanding the Status

### Monthly Salary Employees
- Status changes to **Paid** once total received = net salary
- Salary resets next month
- Can make multiple small payments throughout month

### Daily Salary Employees
- Each payment is independent
- No rollover of pending amounts
- Payments logged for documentation

---

## Example Workflow

**Setup:** Rahul (Monthly Staff, ₹25,000/month)

| Date | Amount | Method | Pending | Status |
|------|--------|--------|---------|--------|
| Jan 5 | ₹10,000 | Cash | ₹15,000 | Partial |
| Jan 15 | ₹8,000 | UPI | ₹7,000 | Partial |
| Jan 31 | ₹7,000 | Cash | ₹0 | Paid |

---

## Troubleshooting

**Q: Why can't I edit salary fields in payment form?**
A: Salary is configured by Admin in Staff Management. Front Office only records payments, not salary settings.

**Q: Why did my pending amount reset?**
A: New month started. Monthly salary cycles reset on 1st of each month.

**Q: Can daily staff have pending amounts?**
A: No. Daily staff payments are independent. Each payment is final.

**Q: How do I see all payments made to an employee?**
A: Open employee dashboard → Salary Management tab → "Recent Payment Transactions" section shows last 20 payments.

---

## Tips & Best Practices

✅ Always record payment date correctly (when money was given, not when entered)
✅ Use notes field for any special circumstances
✅ Reference number is required for non-cash payments
✅ Check pending amount before final payment
✅ Admin should verify salary type is set before Front Office tries to pay
✅ Keep at least ₹5 buffer for rounding if using decimal amounts

---

## Supported Payment Methods

| Method | Reference Required | Examples |
|--------|------------------|----------|
| Cash | No | Just notes |
| UPI | Yes | UTR Number |
| Cheque | Yes | Cheque Number |
| Account Transfer | Yes | Transaction ID/UTR |

---

## API for Integration

All endpoints require Bearer token authentication:

```bash
# Get employee salary info
GET /api/staff/:id/salary-info

# Record a payment
POST /api/staff/:id/pay-salary
{
  "payment_amount": 10000,
  "payment_date": "2025-01-15",
  "payment_method": "Cash",
  "reference_number": "",
  "notes": "First installment",
  "base_salary": 25000,
  "bonus": 0,
  "deduction": 0,
  "payment_month": "2025-01-01"
}

# Update staff salary config
PUT /api/staff/:id
{
  "salary_type": "Monthly",
  "base_salary": 25000
}
```

---

## Database Tables

**sarga_staff** - Stores salary type and rates (Admin configures)
- `salary_type` - Monthly or Daily
- `base_salary` - For monthly staff
- `daily_rate` - For daily staff

**sarga_staff_salary_payments** - Logs each payment transaction
- `payment_date` - When payment was made
- `payment_amount` - Amount of this transaction
- `payment_method` - How it was paid
- `reference_number` - For non-cash payments
- `notes` - Admin notes

---

## FAQs

**Q: Can I split a monthly salary across multiple days?**
A: Yes! That's the whole point. Record each payment separately with its date.

**Q: What if an employee gets salary + bonus?**
A: Admin configures base salary, then adds bonus field when recording payment.

**Q: Can I edit a payment after recording?**
A: Not in current version. Contact admin if error needs correction.

**Q: Does the system validate pending amount?**
A: No. Front Office can overpay if needed (for penalties, adjustments, etc.)

**Q: How far back can I record a payment?**
A: Any date is accepted. Choose correct payment_date for accurate monthly tracking.

---

## Need Help?

- Check "Pending Payment" amount shown at top of form
- Review "Recent Payment Transactions" to verify previous payments
- Ask Admin to verify salary type is configured
- Contact tech support with employee ID and transaction date
