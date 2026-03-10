const { createWorker } = require('tesseract.js');
const { fromPath } = require('pdf2pic');
const fs = require('fs').promises;
const path = require('path');

// Helper to convert PDF pages to images
async function convertPdfToImages(pdfPath, outputDir) {
    const options = {
        density: 300,
        saveFilename: 'page',
        savePath: outputDir,
        format: 'png',
        width: 2480, // A4 width at 300dpi approx
        height: 3508 // A4 height at 300dpi approx
    };

    const convert = fromPath(pdfPath, options);
    const images = [];

    // Let's assume we process up to 3 pages to avoid memory/time exhaustion on large files
    try {
        const results = await convert.bulk(-1, false); // Convert all pages
        for (const res of results) {
            if (res && res.path) {
                images.push(res.path);
            }
        }
    } catch (e) {
        console.error("PDF conversion error (checking fallback if Ghostscript missing):", e);
        throw new Error("Failed to convert PDF. Ensure Ghostscript is installed on the server.");
    }
    return images;
}

// Perform OCR on an image
async function recognizeImage(imagePath) {
    const worker = await createWorker('eng');
    const { data: { text } } = await worker.recognize(imagePath);
    await worker.terminate();
    return text;
}

// Basic Regex-based Parser to extract Invoice Data
function parseInvoiceText(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Fallback default values
    let vendor_name = '';
    let vendor_phone = '';
    let items = [];

    // Try to find vendor name (usually first few lines)
    if (lines.length > 0) {
        vendor_name = lines[0]; // Naive approach
    }

    // Try to find phone numbers (10 digits)
    const phoneRegex = /(?:\+91|0)?\s*[6-9]\d{9}/;
    for (const line of lines) {
        const match = line.match(phoneRegex);
        if (match) {
            vendor_phone = match[0];
            break;
        }
    }

    // Attempt to extract item rows
    // This is highly heuristic and depends on invoice layout.
    // We'll look for lines that have a number (qty), a word (item name), and a decimal (price).

    // Very basic line parser looking for Name, Qty, Price
    // Heuristic 1: If a line contains something that looks like 2 numbers separated by text, it's probably an item row.
    let isTableSection = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Triggers to start looking for table rows
        if (line.toLowerCase().includes('qty') || line.toLowerCase().includes('quantity') || line.toLowerCase().includes('description') || line.toLowerCase().includes('item')) {
            isTableSection = true;
            continue;
        }

        // Even if we didn't find a header, if the line matches a strong item pattern, extract it
        // Stop parsing if we hit totals
        if (line.toLowerCase().includes('total') || line.toLowerCase().includes('subtotal') || line.toLowerCase().includes('amount due')) {
            break;
        }

        // Attempt to extract line item
        // Common Pattern 1: [Qty] [Name] [Price] -> "5 Notebooks 50.00"
        let itemMatch = line.match(/^(\d+)\s+([a-zA-Z\s]+?)\s+([\d,]+\.?\d*)\s*.*$/);

        // Common Pattern 2: [Name] [Qty] [Price] -> "A4 Paper Bundle 5 250.00"
        if (!itemMatch) {
            itemMatch = line.match(/^([a-zA-Z\s]+?)\s+(\d+)\s+([\d,]+\.?\d*)\s*.*$/);
            if (itemMatch) {
                // Swap so index 1 is name, 2 is qty
                const temp = itemMatch[1];
                itemMatch[1] = itemMatch[2];
                itemMatch[2] = temp;
            }
        }

        if (itemMatch) {
            let name, qty, price;

            // Pattern 1: matched digits first
            if (!isNaN(itemMatch[1].trim())) {
                qty = parseInt(itemMatch[1].trim(), 10);
                name = itemMatch[2].trim();
            } else {
                name = itemMatch[1].trim();
                qty = parseInt(itemMatch[2].trim(), 10);
            }

            price = parseFloat(itemMatch[3].replace(/,/g, '').trim());

            // Filter out obviously bad matches
            if (name.length > 2 && qty > 0 && price > 0) {
                items.push({
                    name: name,
                    quantity: qty,
                    cost_price: price,
                    hsn: '', // Difficult to extract reliably without exact coords
                    gst_rate: 0, // Difficult to extract reliably
                    item_type: 'Retail', // Default
                    source_code: '',
                    model_name: '',
                    size_code: ''
                });
            }
        }
    }

    // If heuristic failed to find any items, just return raw text so the user can at least see it
    return {
        vendor_name,
        vendor_contact: vendor_phone,
        items,
        raw_text: text // Send raw text for debugging if needed
    };
}

// Main Orchestrator
async function extractBillData(filePath, mimeType) {
    const isPdf = mimeType === 'application/pdf';
    let text = '';
    const tempImages = [];
    const outputDir = path.dirname(filePath);

    try {
        if (isPdf) {
            const images = await convertPdfToImages(filePath, outputDir);
            tempImages.push(...images);

            for (const imgPath of images) {
                text += await recognizeImage(imgPath) + '\n\n';
            }
        } else {
            text = await recognizeImage(filePath);
        }

        const parsedData = parseInvoiceText(text);
        return parsedData;

    } finally {
        // Cleanup temp PDF converted images
        for (const imgPath of tempImages) {
            try {
                await fs.unlink(imgPath);
            } catch (e) { }
        }
    }
}

module.exports = {
    extractBillData
};
