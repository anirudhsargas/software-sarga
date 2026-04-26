"""
PaddleOCR Service for Sarga Prints

Provides enhanced OCR capabilities for bill/invoice extraction.
Uses PaddleOCR for better text extraction accuracy compared to Tesseract.
"""

import os
import logging
import base64
import io
from flask import Blueprint, request, jsonify
from paddleocr import PaddleOCR
from PIL import Image
import numpy as np

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

bp = Blueprint('ocr', __name__, url_prefix='/ocr')

# Initialize PaddleOCR (lazy loading to avoid startup delay)
_ocr_instance = None

def get_ocr_instance():
    """Get or create PaddleOCR instance (singleton pattern)"""
    global _ocr_instance
    if _ocr_instance is None:
        logger.info("Initializing PaddleOCR...")
        try:
            _ocr_instance = PaddleOCR(
                use_angle_cls=True,
                lang='en',
                use_gpu=False,  # Set to True if GPU is available
                show_log=False
            )
            logger.info("PaddleOCR initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize PaddleOCR: {e}")
            raise
    return _ocr_instance

@bp.route('/extract-text', methods=['POST'])
def extract_text():
    """
    Extract text from an image using PaddleOCR.
    
    Expected JSON payload:
    {
        "image": "base64_encoded_image_string",
        "return_details": false  # Optional, return bounding boxes if true
    }
    
    Returns:
    {
        "success": true,
        "text": "extracted text",
        "details": [...]  # Optional, if return_details=true
    }
    """
    try:
        data = request.get_json()
        if not data or 'image' not in data:
            return jsonify({"error": "No image data provided"}), 400
        
        image_data = data['image']
        return_details = data.get('return_details', False)
        
        # Decode base64 image
        if image_data.startswith('data:image'):
            # Remove data URL prefix
            image_data = image_data.split(',')[1]
        
        image_bytes = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(image_bytes))
        
        # Convert to numpy array for PaddleOCR
        image_np = np.array(image)
        
        # Run OCR
        ocr = get_ocr_instance()
        result = ocr.ocr(image_np, cls=True)
        
        # Extract text
        extracted_text = []
        details = []
        
        if result and result[0]:
            for line in result[0]:
                if line and len(line) >= 2:
                    bbox = line[0]
                    text_info = line[1]
                    text = text_info[0] if text_info else ""
                    confidence = text_info[1] if len(text_info) > 1 else 0.0
                    
                    extracted_text.append(text)
                    
                    if return_details:
                        details.append({
                            "text": text,
                            "confidence": confidence,
                            "bbox": bbox
                        })
        
        full_text = '\n'.join(extracted_text)
        
        response = {
            "success": True,
            "text": full_text
        }
        
        if return_details:
            response["details"] = details
        
        logger.info(f"OCR extraction completed: {len(extracted_text)} lines extracted")
        return jsonify(response)
        
    except Exception as e:
        logger.error(f"OCR extraction failed: {e}")
        return jsonify({"error": str(e)}), 500

@bp.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    try:
        # Try to initialize OCR to check if it's working
        ocr = get_ocr_instance()
        return jsonify({
            "status": "ok",
            "service": "paddleocr",
            "initialized": ocr is not None
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "service": "paddleocr",
            "error": str(e)
        }), 500
