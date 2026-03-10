const { extractBillData } = require('./utils/ocrParser');
const fs = require('fs');

async function testOCR() {
    const filePath = process.argv[2];
    if (!filePath || !fs.existsSync(filePath)) {
        console.error("Please provide a valid file path.");
        return;
    }

    try {
        console.log("Running Tesseract OCR extraction on:", filePath);
        const mimeType = filePath.endsWith('.pdf') ? 'application/pdf' : 'image/png';
        const extractedData = await extractBillData(filePath, mimeType);

        console.log("\nRAW OCR TEXT:\n", extractedData.raw_text);
        console.log("\nSuccess!! Extracted Data:");
        console.log(JSON.stringify(extractedData, null, 2));
    } catch (err) {
        console.error("OCR Error:", err);
    }
}

testOCR();
