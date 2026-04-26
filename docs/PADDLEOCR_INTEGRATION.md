# PaddleOCR Integration

## Overview

PaddleOCR has been integrated into the Sarga Prints application to enhance OCR capabilities for bill/invoice extraction. The integration provides a fallback mechanism when the primary Gemini API reaches quota limits.

## Architecture

The OCR extraction now follows this fallback chain:

1. **Gemini API** (Primary) - Best accuracy, AI-powered extraction
2. **PaddleOCR** (Fallback 1) - Enhanced local OCR with better accuracy than Tesseract
3. **Tesseract.js** (Fallback 2) - Basic local OCR

## Components

### 1. ML Service (Python Flask)

**File:** `ml-service/ocr_service.py`

- Provides `/ocr/extract-text` endpoint
- Accepts base64-encoded images
- Returns extracted text with optional bounding box details
- Uses PaddleOCR library for text extraction

**Dependencies added to `ml-service/requirements.txt`:**
```
paddleocr==2.7.0.3
paddlepaddle==2.5.2
pillow==10.1.0
```

### 2. Node.js Server Integration

**File:** `server/helpers/billExtraction.js`

- Added `extractWithPaddleOCR()` function
- Updated `processBillDocument()` to use PaddleOCR as fallback
- Configured via `ML_SERVICE_URL` environment variable

## Deployment Steps

### 1. Install Python Dependencies

Navigate to the ml-service directory and install the new dependencies:

```bash
cd ml-service
pip install -r requirements.txt
```

**Note:** PaddlePaddle installation may require additional system dependencies:
- On Linux: `sudo apt-get install python3-dev libgl1-mesa-glx`
- On Windows: No additional dependencies usually needed
- On macOS: May require Xcode command line tools

### 2. Configure Environment Variables

Add the following to your server environment (`.env` file or system environment):

```bash
# ML Service URL (default: http://localhost:5001)
ML_SERVICE_URL=http://localhost:5001
```

### 3. Start ML Service

The ML service should be running on port 5001 (or configured port):

```bash
cd ml-service
python app.py
# Or for production:
gunicorn app:app -w 4 -b 0.0.0.0:5001
```

### 4. Verify PaddleOCR Health

Check if the OCR service is running:

```bash
curl http://localhost:5001/ocr/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "paddleocr",
  "initialized": true
}
```

### 5. Restart Node.js Server

Restart the Node.js server to pick up the changes:

```bash
cd server
npm start
```

## Usage

The integration is automatic. When users upload bills via SmartBillUpload:

1. First attempt: Gemini API extraction
2. If Gemini quota exceeded: Automatically falls back to PaddleOCR
3. If PaddleOCR fails: Falls back to Tesseract.js

No code changes needed in the frontend - the fallback is handled server-side.

## Testing

### Test PaddleOCR Directly

```bash
# Convert an image to base64 and test the endpoint
base64 -i test_bill.jpg > base64.txt

curl -X POST http://localhost:5001/ocr/extract-text \
  -H "Content-Type: application/json" \
  -d '{
    "image": "data:image/jpeg;base64,'$(cat base64.txt)'",
    "return_details": true
  }'
```

### Test End-to-End

1. Upload a bill image through the SmartBillUpload modal
2. Check server logs for:
   - `[Gemini] Processing bill:` - Primary attempt
   - `[Gemini] Quota/rate limit reached. Falling back to PaddleOCR.` - Fallback triggered
   - `[PaddleOCR] Processing bill:` - PaddleOCR in use
   - `[PaddleOCR] Extraction successful` - Success

## Performance Considerations

- **First Request:** PaddleOCR loads models on first request (~2-3 seconds)
- **Subsequent Requests:** Much faster (~0.5-1 second per image)
- **Memory:** PaddleOCR uses ~200-300MB RAM when loaded
- **GPU Support:** Set `use_gpu=True` in `ocr_service.py` if GPU available for faster processing

## Troubleshooting

### PaddleOCR Initialization Fails

**Error:** `Failed to initialize PaddleOCR`

**Solutions:**
1. Check Python dependencies: `pip list | grep paddle`
2. Reinstall PaddlePaddle: `pip install --upgrade paddlepaddle`
3. For CPU-only systems, ensure no GPU dependencies are required

### ML Service Unreachable

**Error:** `PaddleOCR service error: ECONNREFUSED`

**Solutions:**
1. Verify ML service is running: `curl http://localhost:5001/health`
2. Check `ML_SERVICE_URL` environment variable
3. Ensure no firewall blocking port 5001

### Memory Issues

**Error:** Out of memory errors

**Solutions:**
1. Reduce worker count in gunicorn: `-w 2` instead of `-w 4`
2. Add memory limits to container if using Docker
3. Consider using a separate server for ML service

## Benefits of PaddleOCR

- **Better Accuracy:** Superior to Tesseract for printed text and tables
- **Multi-language Support:** Can be configured for Indian languages if needed
- **Table Detection:** Better at recognizing tabular data in invoices
- **Rotation Handling:** Automatically detects and corrects text rotation
- **No API Costs:** Local processing, no quota limits

## Future Enhancements

- [ ] Add GPU support for faster processing
- [ ] Configure for Indian regional languages (Hindi, Malayalam, etc.)
- [ ] Add confidence score filtering
- [ ] Implement batch processing for multiple bills
- [ ] Add structured data extraction (tables, key-value pairs)
