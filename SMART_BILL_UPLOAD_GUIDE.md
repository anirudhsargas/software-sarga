# Smart Bill Upload Feature - Complete Implementation Guide

## Overview
The Smart Bill Upload feature automates the process of uploading bills and invoices to the Expense Manager. It uses OCR (Optical Character Recognition) and AI-powered suggestions to automatically extract bill details, categorize expenses, and suggest inventory items.

## Key Features Implemented

### 1. **Automatic Text Extraction**
- **OCR Technology**: Uses Tesseract.js for image recognition
- **PDF Support**: Automatically extracts text from PDF documents
- **Image Formats**: Supports PNG, JPG, JPEG, WebP, and PDF
- **Confidence Scoring**: Provides accuracy metrics for extracted data

### 2. **Intelligent Data Extraction**
Automatically extracts from bills:
- **Amount**: Identifies and parses bill amount/total
- **Bill Number**: Finds invoice/bill reference number
- **Bill Date**: Parses dates in multiple formats (DD/MM/YYYY, MM/DD/YYYY, text format)
- **Vendor Name**: Identifies vendor/supplier information
- **Tax Amount**: Extracts GST/VAT/Tax information
- **Line Items**: Captures product descriptions and quantities
- **Keywords**: Identifies product types mentioned in the bill

### 3. **Smart Category Suggestions**
The system suggests which expense category the bill belongs to:
- **Vendor Purchases** - Paper, ink, stationery supplies
- **Utilities** - Electricity, water bills
- **Transport** - Shipping, delivery costs
- **Rent** - Property lease bills
- **Office Expenses** - Office supplies and maintenance
- **Miscellaneous** - Any other expenses

Each suggestion includes a confidence score (0-100%).

### 4. **Automatic Inventory Matching**
When products are detected in the bill, the system suggests:
- Matching products from your inventory
- Product categories (Paper & Stationery, Consumables, Labels, etc.)
- Unit type and pricing
- One-click option to add quantity to stock

### 5. **Product Linking & Stock Management**
- Link products mentioned in bills directly to inventory
- Automatically create inventory movement records
- Track purchase costs and quantities
- Maintain audit trail of bill-to-inventory relationships

## Technical Components

### Backend Files

#### 1. `server/helpers/billExtraction.js` (NEW)
Core extraction engine with functions:
- `extractTextFromDocument(filePath)` - Main extraction dispatcher
- `extractTextFromPdf(filePath)` - PDF text extraction
- `extractTextFromImage(filePath)` - OCR via Tesseract
- `parseExtractedText(rawText)` - Structured data parsing
- `suggestExpenseCategories(suggestions)` - Category inference
- `suggestInventoryItems(suggestions)` - Product matching
- `processBillDocument(filePath)` - Complete pipeline

**Dependencies:**
- `tesseract.js` - OCR engine
- `pdf-parse` - PDF extraction
- `sharp` - Image processing
- `axios` - HTTP requests

#### 2. `server/routes/expenses-extended.js` (UPDATED)
Three new endpoints:

**POST `/bills-documents/extract-details`**
```javascript
// Upload file and get extraction + suggestions
// Headers: multipart/form-data
// Returns: {
//   success: true,
//   suggestions: {
//     extracted_data: { amount, bill_number, bill_date, vendor_name, tax, items, ... },
//     category_suggestions: [ { type, related_tab, score }, ... ],
//     inventory_suggestions: [ { name, category, unit, confidence }, ... ],
//     raw_text: "...",
//     confidence: 0.85
//   }
// }
```

**GET `/bills-documents/suggest-products`**
```javascript
// Get matching inventory products
// Query params: keyword, category
// Returns: [ { id, name, category, unit, available, unit_price }, ... ]
```

**POST `/bills-documents/:id/link-product`**
```javascript
// Link extracted product to bill and optionally add to inventory
// Body: { product_id, quantity, unit_price, add_to_inventory }
// Creates movement record in sarga_inventory_movements
```

### Frontend Files

#### 1. `client/src/pages/expense-manager/SmartBillUpload.jsx` (NEW)
React component with multi-step workflow:

**Steps:**
1. **Upload** - Drag & drop or file picker
2. **Suggestions** - Review and edit extracted data
3. **Linking** (optional) - Connect products to inventory
4. **Confirming** - Success notification

**State Management:**
- File handling with drag & drop
- Multi-step form progression
- Real-time data updates
- Loading states and error handling

**Features:**
- Auto-populate form fields from extracted data
- Edit any field before submission
- Visual confidence indicators
- Product suggestion cards
- Category confidence scoring

#### 2. `client/src/pages/expense-manager/SmartBillUpload.css` (NEW)
Complete styling for:
- Upload area with drag & drop feedback
- Multi-step modal layout
- Form inputs and validation states
- Suggestion chips and cards
- Success confirmation screen
- Responsive mobile design

#### 3. `client/src/pages/expense-manager/BillsDocsTab.jsx` (UPDATED)
Integrated Smart Bill Upload:
- Added "Smart Upload" button next to traditional upload
- Sparkles icon to indicate AI-powered feature
- Modal opens SmartBillUpload component
- Success callback refreshes bill list
- Error handling integration

## Installation & Setup

### Step 1: Install Dependencies
```bash
cd server
npm install tesseract.js pdf-parse sharp axios
```

The following packages were added:
- `tesseract.js@5.x` - OCR engine
- `pdf-parse@1.x` - PDF text extraction
- `sharp@0.x` - Image processing
- `axios@1.x` - HTTP client

### Step 2: Verify Backend Routes
The new endpoints are automatically mounted in the Express app through `expenses-extended.js` import in `index.js`.

### Step 3: Restart Server
```bash
cd server
npm start
# or if running with nodemon
nodemon index.js
```

The server will load the new routes and be ready for smart bill uploads.

### Step 4: Verify Frontend
The SmartBillUpload component is already integrated into BillsDocsTab.jsx and will appear as a new "Smart Upload" button.

## Usage Guide

### For End Users

#### Basic Workflow:
1. Click **"Smart Upload"** button in Bills & Documents tab
2. Drag & drop a bill image/PDF or click to select
3. Click **"Extract Details"** and wait for processing
4. Review extracted information:
   - Amount, bill number, date auto-populated
   - Vendor name filled in
   - Suggested expense category shown
5. Edit any field if needed
6. Optional: Click **"Add to Stock"** on suggested products
7. Click **"Upload Bill"** to save

#### Tips:
- High-quality bill images work best
- Ensure bill shows amount and date clearly
- Include vendor company name for better categorization
- Check suggested amounts and dates before confirming
- Use product suggestions to keep inventory updated

### For Developers

#### Customizing Category Detection:
Edit `server/helpers/billExtraction.js`, function `suggestExpenseCategories()`:
```javascript
// Add example:
if (lowerText.includes('your-keyword')) {
  categories.push({ type: 'Category Name', related_tab: 'tab_name', score: 0.90 });
}
```

#### Adding Product Mappings:
Edit `suggestInventoryItems()` function:
```javascript
const productMappings = {
  'your_keyword': [
    { name: 'Product Name', category: 'Category', unit: 'Unit' },
    // ... more products
  ]
};
```

#### Customizing OCR Settings:
Edit Tesseract configuration in `extractTextFromImage()`:
```javascript
const result = await Tesseract.recognize(filePath, 'eng', {
  logger: (m) => console.log('[Tesseract]', m.status),
  // Add more options here
});
```

## Database Integration

### Existing Tables Used
- `sarga_bills_documents` - Stores bill metadata and file paths
- `sarga_inventory` - Product catalog for matching
- `sarga_inventory_movements` - Audit trail when products added

### New Fields (if applicable)
`sarga_bills_documents` columns utilized:
- `product_id` - Link to inventory (filled when product linked)
- `product_quantity` - Qty mentioned in bill
- `product_unit_price` - Unit price from bill

### Inventory Sync
When a product is linked from a bill:
1. Creates entry in `sarga_inventory_movements`
2. Records movement_type = 'Purchase'
3. References bill document as source
4. Maintains full audit trail

## API Examples

### Extract Bill Details
```bash
curl -X POST http://localhost:5000/bills-documents/extract-details \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@invoice.pdf"
```

Response:
```json
{
  "extracted_data": {
    "amount": 5000,
    "bill_number": "INV-001",
    "bill_date": "2024-03-01",
    "vendor_name": "ABC Paper Supplies",
    "tax": 500,
    "items": [
      { "description": "A4 Paper 500 sheets", "raw": "..." }
    ]
  },
  "category_suggestions": [
    { "type": "Vendor", "related_tab": "vendors", "score": 0.95 }
  ],
  "inventory_suggestions": [
    { "name": "A4 Paper 500 sheets", "category": "Paper", "unit": "Pack" }
  ],
  "confidence": 0.87
}
```

### Suggest Products
```bash
curl http://localhost:5000/bills-documents/suggest-products?keyword=paper \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Link Product to Bill
```bash
curl -X POST http://localhost:5000/bills-documents/123/link-product \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "product_id": 5,
    "quantity": 10,
    "unit_price": 500,
    "add_to_inventory": true
  }'
```

## Performance Considerations

### OCR Processing
- First image: ~5-10 seconds (model download)
- Subsequent images: ~2-5 seconds
- PDF extraction: <1 second
- Caching improves performance

### Concurrent Uploads
- System handles multiple uploads
- Each processed independently
- No blocking operations
- Consider rate limiting for high volume

### File Sizes
- Max file size: 10MB (configurable in multer)
- Large PDFs (100+ pages) may take longer
- High-resolution images increase processing time

## Troubleshooting

### Issue: "Could not extract text from document"
**Solution:**
- Ensure image is clear and well-lit
- Try higher resolution bill scan
- Check file format is supported
- Verify file size < 10MB

### Issue: "Tesseract kernel not found"
**Solution:**
- Tesseract.js auto-downloads on first use
- Wait for ~5 seconds on first extraction
- Check internet connection
- Clear browser cache if stuck

### Issue: "Product suggestions empty"
**Solution:**
- Ensure keywords in bill match product keywords
- Check inventory has products with matching categories
- Add more products to inventory
- Customize product mappings in helper

### Issue: "Extraction takes too long"
**Solution:**
- Try lower resolution image
- Split large PDFs into pages
- Check system resources (CPU/RAM)
- Consider batch processing for large volumes

## Security & Privacy

### Data Handling
- Bill text extracted only for processing
- Not stored permanently (temporary files deleted)
- OCR done server-side (no external APIs)
- User files handled securely

### Access Control
- Requires authentication (JWT token)
- User sees only their branch's bills
- Admin access to all branches
- Activity logged in audit trail

### File Upload Security
- Multer validates file type
- Storage path normalized
- Files saved in secure uploads directory
- No direct file access via URL

## Future Enhancements

### Planned Features
1. **Receipt Camera Capture** - Mobile camera integration
2. **Batch Processing** - Upload multiple bills at once
3. **Custom Categories** - User-defined expense categories
4. **Cost Analysis** - Compare vendor prices over time
5. **Invoice Matching** - Auto-match bills to purchases
6. **Machine Learning** - Improve suggestions over time
7. **Email Integration** - Receive bills via email
8. **Workflow Automation** - Auto-approve matched bills

### API Integration Opportunities
- Integrate with Shopify/WooCommerce for pricing
- Connect to accounting software (Tally, QuickBooks)
- Export to GST compliance tools
- Real-time vendor rate tracking

## Support & Documentation

### Quick Links
- OCR Guide: `billExtraction.js` comments
- Frontend Component: `SmartBillUpload.jsx`
- API Routes: `expenses-extended.js`
- Styling: `SmartBillUpload.css`

### Getting Help
- Check error messages in browser console
- Review server logs for extraction errors
- Test with sample bills in `uploads/` directory
- Enable debug logging in Tesseract

## Summary

The Smart Bill Upload feature transforms expense management from manual data entry to automated, intelligent processing. By leveraging OCR and semantic analysis, it:

✅ **Saves Time** - Auto-extract bill details in seconds
✅ **Reduces Errors** - Consistent data entry with suggestions
✅ **Improves Accuracy** - Multiple validation layers
✅ **Enhances Workflow** - One-click stock updates
✅ **Maintains Audit Trail** - Complete bill-to-inventory tracking

Users can now upload bills by simply taking photos or PDFs, review AI-generated suggestions, and instantly update both expense records and inventory levels—all from a single interface.
