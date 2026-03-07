# Smart Bill Upload - Quick Start Guide

## 🚀 What's New?

The Expense Manager now has **Smart Bill Upload** - an AI-powered feature that automatically extracts bill details from images and PDFs using OCR technology.

## ⚡ How to Use (Quick Version)

### Step 1: Open Expense Manager
- Navigate to **Expense Manager** → **Bills & Documents** tab

### Step 2: Click Smart Upload
- Look for the new **✨ Smart Upload** button (next to traditional upload)
- Click it to open the smart upload modal

### Step 3: Upload Your Bill
- Drag & drop a bill image/PDF, or click to select
- Supported formats: PNG, JPG, PDF (max 10MB)
- Click **"Extract Details"** button

### Step 4: Review Extracted Data
The system will automatically fill in:
- ✅ **Amount** - Total bill amount
- ✅ **Bill Number** - Invoice reference
- ✅ **Bill Date** - Date of bill
- ✅ **Vendor Name** - Company/supplier
- ✅ **Suggested Category** - Where to record expense

### Step 5: Choose Category
- Click the suggested category (shown with confidence %)
- Or enter your own category

### Step 6: Add to Stock (Optional)
- If bill contains products, you'll see **"Suggested Products"**
- Click **"Add to Stock"** on products to purchase
- Enter quantity and unit price if needed
- Check **"Add to Inventory"** to update stock

### Step 7: Submit
- Click **"Upload Bill"** to save
- Receive confirmation ✅

## 🎯 What Gets Auto-Extracted?

From your bill image/PDF, the AI automatically finds:

| Item | Examples |
|------|----------|
| **Amount** | ₹5,000 / $100 / Total Amount |
| **Bill Number** | INV-001 / #12345 / Reference |
| **Date** | Various formats supported |
| **Vendor** | Company name, supplier |
| **Tax** | GST / VAT / Tax amount |
| **Items** | Product descriptions & quantities |

## 💡 Smart Features

### 🏷️ Category Auto-Detection
The system suggests which expense category to use:
- Paper/Stationery → **Vendor**
- Electricity/Water → **Utilities**
- Delivery/Shipping → **Transport**
- Office Supplies → **Office**
- Rent/Lease → **Rent**
- Other → **Miscellaneous**

### 📦 Product Suggestions
When products are mentioned in bill:
- System suggests matching products from inventory
- One-click add to stock
- Automatically creates purchase record

### 🔍 Multiple Format Support
Works with:
- 📷 Bill photos taken with phone camera
- 📄 Scanned PDF invoices
- 📊 Digital receipts
- 🖼️ Any clear bill image

## ❓ FAQs

**Q: How accurate is the extraction?**
A: ~85-90% accurate. Always review before submitting. You can edit any field.

**Q: What if extraction fails?**
A: Ensure bill image is clear, well-lit, and legible. Try higher resolution scan.

**Q: Can I edit extracted data?**
A: Yes! All fields are editable before submission.

**Q: Does it work offline?**
A: No, requires internet connection for OCR processing.

**Q: Can I upload multiple bills at once?**
A: Currently one at a time. Batch upload coming soon.

**Q: Is my data secure?**
A: Yes, OCR processing done on your server. No external APIs. Secure file storage.

## 🔧 Troubleshooting

### "Could not extract text"
- ✓ Check bill image is clear
- ✓ Ensure good lighting
- ✓ Try higher resolution
- ✓ Verify file < 10MB

### "Extraction takes long"
- First time: May take 5-10 seconds (normal)
- Subsequent: ~2-5 seconds
- Large PDFs: May take longer

### "Product suggestions appear empty"
- Check inventory has products
- Try different bill with more products
- Add products to inventory first

## 📚 Related Features

### Traditional Upload (Still Available)
- Still have the manual upload option
- For special cases not suited for smart extraction
- Full form-filling control

### Bills Dashboard
- View all uploaded bills
- Filter by type, vendor, date
- Download/view original files
- Delete unwanted bills

### Inventory Integration
- Bills link directly to products
- Purchase records created
- Track costs and quantities
- Complete audit trail

## 🎓 Best Practices

✅ **DO:**
- Use clear, high-quality bill images
- Take photos in good lighting
- Include full bill with all details
- Review suggestions before confirming
- Add products to stock when available

❌ **DON'T:**
- Upload blurry or low-res images
- Crop off important bill details
- Skip reviewing extracted data
- Force incorrect category match
- Leave amount field empty

## 📞 Need Help?

If Smart Upload feature has issues:

1. **Check Browser Console**
   - Press F12 → Console tab
   - Look for error messages
   - Share error details if getting support

2. **Check Server Logs**
   - Server console shows extraction status
   - Look for [Tesseract] messages
   - Indicates OCR progress

3. **Try Sample Bill**
   - Use a different bill to test
   - Verify it's not a specific file issue
   - Test with PDF vs. image

4. **Restart Server**
   - If extraction hangs: `npm start`
   - Clears OCR cache
   - Resets connection pool

## 🎉 Benefits Summary

### ⏱️ Saves Time
- Auto-fill reduces 5 min to 30 seconds
- No manual data entry

### 📊 Better Records
- Consistent data entry
- Reduced typos
- Better categorization

### 📦 Stock Tracking
- Link bills to inventory
- Know what you bought and when
- Track vendor costs

### 💼 Professional
- Complete audit trail
- Proper documentation
- Easy compliance

---

**Enjoy automated bill management! 🚀**

For detailed technical documentation, see [SMART_BILL_UPLOAD_GUIDE.md](SMART_BILL_UPLOAD_GUIDE.md)
