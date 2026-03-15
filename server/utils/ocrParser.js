const { createWorker } = require('tesseract.js');
const { fromPath } = require('pdf2pic');
const { PDFParse } = require('pdf-parse');
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

async function extractTextFromPdf(pdfPath) {
    const buffer = await fs.readFile(pdfPath);
    const parser = new PDFParse({ data: buffer });
    try {
        const parsedText = await parser.getText();
        let parsedTables = null;
        try {
            parsedTables = await parser.getTable();
        } catch (_) {
            parsedTables = null;
        }

        return {
            text: String(parsedText?.text || ''),
            pages: Array.isArray(parsedText?.pages) ? parsedText.pages.map((p) => String(p?.text || '')) : [],
            total: Number(parsedText?.total || 0),
            tables: parsedTables
        };
    } finally {
        // Ensure parser resources are released when available.
        if (typeof parser.destroy === 'function') {
            await parser.destroy().catch(() => { });
        }
    }
}

function splitIntoPages(text) {
    const raw = String(text || '');
    const formFeedPages = raw.split(/\f+/).map(p => p.trim()).filter(Boolean);
    if (formFeedPages.length > 0) return formFeedPages;

    // Fallback split by explicit page markers found in many generated PDFs.
    const markerPages = raw.split(/\n\s*page\s+\d+\s*(?:of\s+\d+)?\s*\n/gi).map(p => p.trim()).filter(Boolean);
    if (markerPages.length > 0) return markerPages;

    return [raw.trim()].filter(Boolean);
}

function isLikelyHeader(line) {
    const l = String(line || '').toLowerCase();
    return /(description|item|particular|product)/.test(l)
        && /(qty|quantity)/.test(l)
        && /(rate|price|amount)/.test(l);
}

function inferLayoutFromPage(lines) {
    for (const line of lines) {
        if (!isLikelyHeader(line)) continue;
        const normalized = line.toLowerCase();
        const qtyIndex = Math.max(normalized.indexOf('qty'), normalized.indexOf('quantity'));
        const itemIndex = Math.max(
            normalized.indexOf('description'),
            normalized.indexOf('item'),
            normalized.indexOf('particular'),
            normalized.indexOf('product')
        );
        return {
            qtyBeforeItem: qtyIndex >= 0 && itemIndex >= 0 ? qtyIndex < itemIndex : true
        };
    }
    return { qtyBeforeItem: true };
}

function parseNumber(value) {
    if (value === null || value === undefined) return NaN;
    const cleaned = String(value).replace(/[,\s₹]/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : NaN;
}

function normalizeSpace(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseNumberish(value) {
    const raw = String(value || '').trim();
    if (!raw) return NaN;
    const token = raw.match(/\d[\d,]*(?:\.\d+)?/);
    if (!token) return NaN;
    return parseNumber(token[0]);
}

function inferGstRateByHsn(hsn) {
    const code = String(hsn || '').replace(/\D/g, '');
    if (!code) return 0;

    // Common GST buckets by major HSN chapters used in print/office procurement.
    if (code.startsWith('48') || code.startsWith('49')) return 12; // Paper / printed matter
    if (code.startsWith('44')) return 18; // Wood/articles (e.g., trophies, frames)
    if (code.startsWith('39')) return 18; // Plastics/packaging
    if (code.startsWith('84') || code.startsWith('85')) return 18; // Machinery/electrical
    if (code.startsWith('73') || code.startsWith('76')) return 18; // Metal articles

    // Safe default where HSN exists but no explicit GST column is present.
    return 18;
}

function toIsoDate(raw) {
    const value = String(raw || '').trim();
    if (!value) return null;

    const months = {
        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };

    let m = value.match(/^(\d{1,2})[\/-]([A-Za-z]{3})[\/-](\d{2,4})$/);
    if (m) {
        const dd = String(m[1]).padStart(2, '0');
        const mm = months[String(m[2]).slice(0, 3).toLowerCase()] || '01';
        let yy = String(m[3]);
        if (yy.length === 2) yy = `20${yy}`;
        return `${yy}-${mm}-${dd}`;
    }

    m = value.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
    if (m) {
        const dd = String(m[1]).padStart(2, '0');
        const mm = String(m[2]).padStart(2, '0');
        let yy = String(m[3]);
        if (yy.length === 2) yy = `20${yy}`;
        return `${yy}-${mm}-${dd}`;
    }

    return null;
}

function isCompanyLine(line) {
    const l = String(line || '').trim();
    if (!l) return false;
    if (l.includes(':')) return false;
    if (/^(sales order|tax invoice|invoice|consignee|buyer|destination|terms)/i.test(l)) return false;
    return /(pvt|ltd|traders|enterprises|trophies|mementos|industries|company|stores|mart|agencies|distributors)/i.test(l)
        || (/^[A-Z0-9 .,&()\-/]{8,}$/.test(l) && /[A-Za-z]/.test(l));
}

function findVendorName(lines) {
    for (const line of lines.slice(0, 40)) {
        if (isCompanyLine(line)) return line;
    }
    return lines.find(Boolean) || '';
}

function extractFieldByLabel(lines, labelRegex, lookAhead = 2) {
    for (let i = 0; i < lines.length; i++) {
        const line = String(lines[i] || '');
        if (!labelRegex.test(line)) continue;

        const sameLine = line.split(/:\s*/).slice(1).join(':').trim();
        if (sameLine && !/^(dated|voucher|buyer|mode|terms|destination)$/i.test(sameLine)) {
            return sameLine;
        }

        for (let j = 1; j <= lookAhead; j++) {
            const next = String(lines[i + j] || '').trim();
            if (!next) continue;
            if (/^(voucher|dated|mode|terms|buyer|destination|dispatch|consignee)/i.test(next)) continue;
            return next;
        }
    }
    return null;
}

function extractTotalAmount(lines) {
    const pickMonetaryValue = (line) => {
        const text = normalizeSpace(line);
        if (!text) return null;

        const nums = text.match(/\d[\d,]*(?:\.\d+)?/g) || [];
        if (nums.length === 0) return null;

        const values = nums.map(parseNumber).filter((n) => Number.isFinite(n) && n > 0);
        if (values.length === 0) return null;

        // If currency marker exists, prefer the largest value on the line (usually final payable amount).
        if (/[₹]|rs\.?/i.test(text)) {
            return Math.max(...values);
        }

        // For lines containing quantities (e.g. '273 Nos'), avoid selecting the quantity as amount.
        if (/\bnos\b/i.test(text)) {
            const large = values.filter((v) => v >= 1000 || String(v).includes('.'));
            if (large.length > 0) return Math.max(...large);
            return null;
        }

        return values[values.length - 1];
    };

    const strong = [/grand total/i, /invoice total/i, /total amount/i, /amount due/i, /net amount/i];
    for (const pattern of strong) {
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = normalizeSpace(lines[i]);
            if (!line || !pattern.test(line)) continue;
            const n = pickMonetaryValue(line);
            if (Number.isFinite(n) && n > 0) return n;

            // Sometimes the amount sits on the next line (e.g., 'Total 273 Nos' then '₹ 61,831.21').
            for (let look = 1; look <= 3; look++) {
                const near = pickMonetaryValue(lines[i + look]);
                if (Number.isFinite(near) && near > 0) return near;
            }
        }
    }

    // Last fallback: generic total line, but ignore table rows and discount columns.
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = normalizeSpace(lines[i]);
        if (!line) continue;
        if (!/\btotal\b/i.test(line)) continue;
        if (/^\d+\s+/.test(line)) continue;
        const n = pickMonetaryValue(line);
        if (Number.isFinite(n) && n > 0) return n;

        for (let look = 1; look <= 3; look++) {
            const near = pickMonetaryValue(lines[i + look]);
            if (Number.isFinite(near) && near > 0) return near;
        }
    }

    return null;
}

function findSalesTableHeaderIndex(lines) {
    const starts = findSalesTableHeaderStarts(lines);
    return starts.length > 0 ? starts[0] : -1;
}

function findSalesTableHeaderStarts(lines) {
    const starts = [];

    for (let i = 0; i < lines.length; i++) {
        const windowLines = [];
        for (let j = i; j < Math.min(lines.length, i + 10); j++) {
            const l = normalizeSpace(lines[j]).toLowerCase();
            if (l) windowLines.push(l);
        }
        if (windowLines.length === 0) continue;

        const hasDescription = windowLines.some((l) => l.includes('description of goods') || l === 'description' || l.includes('description'));
        const hasHsn = windowLines.some((l) => l.includes('hsn/sac') || l === 'hsn' || l.includes('hsn'));
        const hasQty = windowLines.some((l) => l === 'quantity' || l.includes('quantity'));
        const hasRate = windowLines.some((l) => l === 'rate' || l.includes('rate'));
        const hasAmount = windowLines.some((l) => l === 'amount' || l.includes('amount'));

        if (hasDescription && hasHsn && hasQty && hasRate && hasAmount) {
            // Rows generally begin shortly after this header block.
            starts.push(Math.min(lines.length - 1, i + 1));
            i += 8;
        }
    }

    return starts;
}

function parseSalesOrderRow(line) {
    const cleaned = normalizeSpace(line);
    if (!/^\d+\s+/.test(cleaned)) return null;

    const tokens = cleaned.split(' ');
    if (tokens.length < 8) return null;

    const serial = parseNumber(tokens[0]);
    if (!Number.isFinite(serial)) return null;

    const amount = parseNumber(tokens[tokens.length - 1]);
    if (!Number.isFinite(amount) || amount <= 0) return null;

    const nosPositions = [];
    for (let i = 0; i < tokens.length; i++) {
        if (String(tokens[i]).toLowerCase() === 'nos') nosPositions.push(i);
    }
    if (nosPositions.length < 2) return null;

    const qtyToken = tokens[nosPositions[nosPositions.length - 2] - 1];
    const rateToken = tokens[nosPositions[nosPositions.length - 1] - 1];
    const quantity = parseNumber(qtyToken);
    const rate = parseNumber(rateToken);

    let hsnIndex = -1;
    const leftBoundary = 1;
    const rightBoundary = Math.max(2, nosPositions[0]);
    for (let i = leftBoundary; i < rightBoundary; i++) {
        if (/^\d{4,8}$/.test(tokens[i])) {
            hsnIndex = i;
            break;
        }
    }
    if (hsnIndex < 0) return null;

    const description = tokens.slice(1, hsnIndex).join(' ').trim();
    const hsn = tokens[hsnIndex];

    if (!description || !Number.isFinite(quantity) || quantity <= 0) return null;

    const resolvedRate = Number.isFinite(rate) && rate > 0 ? rate : (amount / quantity);
    return {
        serial_no: serial,
        name: description,
        hsn,
        quantity,
        cost_price: resolvedRate,
        amount
    };
}

function parseSalesOrderStackedRow(lines, startIndex) {
    const serialLine = normalizeSpace(lines[startIndex]);
    if (!/^\d+$/.test(serialLine)) return null;

    const description = normalizeSpace(lines[startIndex + 1]);
    const hsn = normalizeSpace(lines[startIndex + 2]);
    if (!description || !/^[A-Za-z0-9][A-Za-z0-9 \-/()]+$/.test(description)) return null;
    if (!/^\d{4,8}$/.test(hsn)) return null;

    const scanStart = startIndex + 3;
    const scanEnd = Math.min(lines.length - 1, startIndex + 16);

    const nosValues = [];
    const allNumbers = [];
    let amount = NaN;
    let endIndex = scanStart;

    for (let i = scanStart; i <= scanEnd; i++) {
        const line = normalizeSpace(lines[i]);
        if (!line) continue;

        if (/^\d+$/.test(line) && i > scanStart) {
            break;
        }

        const nosMatch = line.match(/(?:[()/+\-]*)(\d+(?:\.\d+)?)\s*Nos\b/i);
        if (nosMatch) {
            const n = parseNumber(nosMatch[1]);
            if (Number.isFinite(n)) nosValues.push(n);
        }

        const nums = line.match(/\d[\d,]*(?:\.\d+)?/g) || [];
        nums.forEach((t) => {
            const n = parseNumber(t);
            if (Number.isFinite(n)) allNumbers.push(n);
        });

        const moneyTokens = line.match(/\d[\d,]*\.\d{2}/g) || [];
        if (moneyTokens.length > 0) {
            const maybeAmount = parseNumber(moneyTokens[moneyTokens.length - 1]);
            if (Number.isFinite(maybeAmount) && maybeAmount > 0) {
                amount = maybeAmount;
                endIndex = i;
            }
        }
    }

    const quantity = nosValues.length >= 2 ? nosValues[1] : (nosValues[0] || NaN);
    let rate = nosValues.length >= 3 ? nosValues[2] : NaN;

    if ((!Number.isFinite(rate) || rate <= 0) && Number.isFinite(amount) && Number.isFinite(quantity) && quantity > 0) {
        rate = amount / quantity;
    }

    if ((!Number.isFinite(rate) || rate <= 0) && allNumbers.length > 0) {
        const plausible = allNumbers.filter((n) => n > 1 && (!Number.isFinite(amount) || n < amount));
        if (plausible.length > 0) rate = plausible[plausible.length - 1];
    }

    if (!Number.isFinite(quantity) || quantity <= 0) return null;

    return {
        row: {
            serial_no: parseNumber(serialLine),
            name: description,
            hsn,
            quantity,
            cost_price: Number.isFinite(rate) ? rate : NaN,
            amount: Number.isFinite(amount) ? amount : NaN
        },
        nextIndex: Math.max(startIndex + 3, endIndex)
    };
}

function extractItemsByHeader(lines) {
    const headerStarts = findSalesTableHeaderStarts(lines);
    if (headerStarts.length === 0) return [];

    const items = [];
    for (const start of headerStarts) {
        for (let i = start; i < lines.length; i++) {
            const line = normalizeSpace(lines[i]);
            if (!line) continue;

            // Stop this section and allow next header section to continue parsing.
            if (/^(continued|this is a computer generated document|terms of delivery|buyer|consignee|destination|dispatch|total|grand total|amount due)/i.test(line)) {
                break;
            }

            if (!/^\d+\s+/.test(line) && !/^\d+$/.test(line)) {
                continue;
            }

            const parsed = parseSalesOrderRow(line);
            if (parsed) {
                items.push(parsed);
                continue;
            }

            const stacked = parseSalesOrderStackedRow(lines, i);
            if (stacked?.row) {
                items.push(stacked.row);
                i = stacked.nextIndex;
            }
        }
    }

    // Deduplicate same serial/description-style duplicates that can happen across parser modes.
    const unique = [];
    const seen = new Set();
    for (const item of items) {
        const key = `${normalizeSpace(item.name).toLowerCase()}|${item.hsn}|${item.quantity}|${Number(item.amount || 0).toFixed(2)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(item);
    }

    return unique;
}

function pickHeaderIndex(row, matcher) {
    for (let i = 0; i < row.length; i++) {
        const cell = normalizeSpace(row[i]).toLowerCase();
        if (matcher(cell)) return i;
    }
    return -1;
}

function extractItemsFromPdfTables(tableResult) {
    const items = [];
    const pages = Array.isArray(tableResult?.pages) ? tableResult.pages : [];

    for (const page of pages) {
        const tables = Array.isArray(page?.tables) ? page.tables : [];
        for (const table of tables) {
            if (!Array.isArray(table) || table.length < 2) continue;

            let headerIdx = -1;
            let itemCol = -1;
            let hsnCol = -1;
            let qtyCol = -1;
            let rateCol = -1;
            let amountCol = -1;

            for (let r = 0; r < Math.min(table.length, 8); r++) {
                const row = Array.isArray(table[r]) ? table[r] : [];
                const rowNorm = row.map((c) => normalizeSpace(c).toLowerCase());
                itemCol = pickHeaderIndex(rowNorm, (c) => c.includes('description'));
                hsnCol = pickHeaderIndex(rowNorm, (c) => c.includes('hsn'));
                qtyCol = pickHeaderIndex(rowNorm, (c) => c.includes('quantity') && !c.includes('avail'));
                rateCol = pickHeaderIndex(rowNorm, (c) => c === 'rate' || c.includes('rate'));
                amountCol = pickHeaderIndex(rowNorm, (c) => c === 'amount' || c.includes('amount'));
                if (itemCol >= 0 && hsnCol >= 0 && qtyCol >= 0 && rateCol >= 0 && amountCol >= 0) {
                    headerIdx = r;
                    break;
                }
            }

            if (headerIdx < 0) continue;

            for (let r = headerIdx + 1; r < table.length; r++) {
                const row = Array.isArray(table[r]) ? table[r] : [];
                if (row.length === 0) continue;

                const serialCol = pickHeaderIndex(table[headerIdx].map((c) => normalizeSpace(c).toLowerCase()), (c) => c.includes('sl no') || c.includes('si no') || c === 'sl' || c === 'si');
                const serial = serialCol >= 0 ? parseNumberish(row[serialCol]) : parseNumberish(row[0]);

                const itemName = normalizeSpace(row[itemCol]);
                const hsn = normalizeSpace(row[hsnCol]);
                const qty = parseNumberish(row[qtyCol]);
                const rate = parseNumberish(row[rateCol]);
                const amount = parseNumberish(row[amountCol]);

                const joined = normalizeSpace(row.join(' ')).toLowerCase();
                if (/\b(total|grand total|amount chargeable|output\s+sgst|output\s+cgst|input\s+sgst|input\s+cgst)\b/.test(joined)) {
                    continue;
                }

                if (!itemName || !Number.isFinite(qty) || qty <= 0) continue;

                items.push({
                    serial_no: Number.isFinite(serial) ? serial : (r - headerIdx),
                    name: itemName,
                    hsn,
                    quantity: qty,
                    cost_price: Number.isFinite(rate) && rate > 0 ? rate : (Number.isFinite(amount) && qty > 0 ? amount / qty : NaN),
                    amount: Number.isFinite(amount) ? amount : NaN,
                    gst_rate: inferGstRateByHsn(hsn)
                });
            }
        }
    }

    const unique = [];
    const seen = new Set();
    for (const item of items) {
        const key = `${normalizeSpace(item.name).toLowerCase()}|${item.hsn}|${item.quantity}|${Number(item.amount || 0).toFixed(2)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(item);
    }
    return unique;
}

function parseItemLine(line, layout) {
    const l = String(line || '').trim();
    if (!l) return null;

    if (/(subtotal|grand total|total amount|amount due|net amount|balance)/i.test(l)) {
        return null;
    }

    // Sales-order row pattern with serial + description + HSN + Avail Qty + Qty + Rate + Disc + Amount.
    const salesOrderRow = l.match(/^(\d+)\s+(.+?)\s+(\d{4,8})\s+(.+?)\s+(\d[\d,]*(?:\.\d+)?)\s*$/);
    if (salesOrderRow) {
        const name = salesOrderRow[2].trim();
        const hsn = salesOrderRow[3].trim();
        const middle = salesOrderRow[4];
        const amount = parseNumber(salesOrderRow[5]);

        const nosValues = [];
        const nosRegex = /(?:[()/+\-]*)(\d+(?:\.\d+)?)\s*Nos\b/gi;
        let nm;
        while ((nm = nosRegex.exec(middle)) !== null) {
            nosValues.push(parseNumber(nm[1]));
        }

        // In this layout Nos values are often: [available_qty, quantity, rate]
        let qty = NaN;
        let rate = NaN;
        if (nosValues.length >= 2) {
            qty = nosValues[1];
        } else if (nosValues.length === 1) {
            qty = nosValues[0];
        }
        if (nosValues.length >= 3) {
            rate = nosValues[2];
        }
        if (!Number.isFinite(rate) || rate <= 0) {
            const decimalTokens = (middle.match(/\d+\.\d+/g) || []).map(parseNumber).filter((v) => Number.isFinite(v) && v > 0);
            if (decimalTokens.length > 0) {
                rate = decimalTokens[0];
            }
        }
        if ((!Number.isFinite(rate) || rate <= 0) && Number.isFinite(amount) && Number.isFinite(qty) && qty > 0) {
            rate = amount / qty;
        }

        if (name && Number.isFinite(qty) && qty > 0) {
            return {
                name,
                hsn,
                quantity: qty,
                cost_price: Number.isFinite(rate) && rate > 0 ? rate : NaN,
                amount: Number.isFinite(amount) ? amount : NaN
            };
        }
    }

    // Prefer table-like rows split by multiple spaces or tabs.
    const cols = l.split(/\t+|\s{2,}/).map(c => c.trim()).filter(Boolean);
    if (cols.length >= 3) {
        const maybeQtyA = parseNumber(cols[0]);
        const maybePriceLast = parseNumber(cols[cols.length - 1]);
        const maybeQtyB = parseNumber(cols[1]);

        if (layout.qtyBeforeItem && Number.isFinite(maybeQtyA) && Number.isFinite(maybePriceLast)) {
            const name = cols.slice(1, cols.length - 1).join(' ').trim();
            if (name.length > 1) {
                return { name, quantity: maybeQtyA, cost_price: maybePriceLast, amount: maybePriceLast * maybeQtyA };
            }
        }

        if (!layout.qtyBeforeItem && Number.isFinite(maybeQtyB) && Number.isFinite(maybePriceLast)) {
            const name = cols[0];
            if (name.length > 1) {
                return { name, quantity: maybeQtyB, cost_price: maybePriceLast, amount: maybePriceLast * maybeQtyB };
            }
        }
    }

    // Regex fallback patterns for loosely spaced lines.
    let itemMatch;
    if (layout.qtyBeforeItem) {
        itemMatch = l.match(/^(\d+(?:\.\d+)?)\s+(.+?)\s+(\d[\d,]*(?:\.\d+)?)\s*$/);
        if (itemMatch) {
            return {
                name: itemMatch[2].trim(),
                quantity: parseNumber(itemMatch[1]),
                cost_price: parseNumber(itemMatch[3]),
                amount: parseNumber(itemMatch[1]) * parseNumber(itemMatch[3])
            };
        }
    } else {
        itemMatch = l.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s+(\d[\d,]*(?:\.\d+)?)\s*$/);
        if (itemMatch) {
            return {
                name: itemMatch[1].trim(),
                quantity: parseNumber(itemMatch[2]),
                cost_price: parseNumber(itemMatch[3]),
                amount: parseNumber(itemMatch[2]) * parseNumber(itemMatch[3])
            };
        }
    }

    return null;
}

// Perform OCR on an image
async function recognizeImage(imagePath) {
    const worker = await createWorker('eng');
    const { data: { text } } = await worker.recognize(imagePath);
    await worker.terminate();
    return text;
}

// Basic Regex-based Parser to extract Invoice Data
function parseInvoiceText(text, options = {}) {
    const pages = Array.isArray(options.pages) && options.pages.length > 0
        ? options.pages.map((p) => String(p || '').trim()).filter(Boolean)
        : splitIntoPages(text);
    const firstPageLines = (pages[0] || '').split('\n').map(l => l.trim()).filter(Boolean);
    const layout = inferLayoutFromPage(firstPageLines);
    const lines = pages.flatMap(p => p.split('\n').map(l => l.trim()).filter(Boolean));

    // Fallback default values
    let vendor_name = '';
    let vendor_phone = '';
    let items = [];

    // Try to find vendor name (usually first few lines)
    vendor_name = findVendorName(lines);

    const bill_number = extractFieldByLabel(lines, /voucher\s*no\.?/i, 3);
    const bill_date_raw = extractFieldByLabel(lines, /dated\b/i, 3);
    const bill_date = toIsoDate(bill_date_raw);

    // Try to find phone numbers (10 digits)
    const phoneRegex = /(?:\+91|0)?\s*[6-9]\d{9}/;
    for (const line of lines) {
        const match = line.match(phoneRegex);
        if (match) {
            vendor_phone = match[0];
            break;
        }
    }

    // Header-driven extraction first (for Sales Order style tables).
    const tableItems = extractItemsFromPdfTables(options.tables);
    const headerItems = tableItems.length > 0 ? tableItems : extractItemsByHeader(lines);
    if (headerItems.length > 0) {
        items = headerItems.map((parsed) => ({
            serial_no: Number.isFinite(Number(parsed.serial_no)) ? Number(parsed.serial_no) : '',
            name: parsed.name,
            quantity: parsed.quantity,
            cost_price: parsed.cost_price,
            amount: Number.isFinite(parsed.amount) ? parsed.amount : parsed.quantity * parsed.cost_price,
            hsn: parsed.hsn || '',
            gst_rate: Number.isFinite(Number(parsed.gst_rate)) ? Number(parsed.gst_rate) : inferGstRateByHsn(parsed.hsn),
            item_type: 'Retail',
            source_code: '',
            model_name: '',
            size_code: ''
        }));
    } else {
        // Fallback heuristic parser.
        for (const line of lines) {
            const parsed = parseItemLine(line, layout);
            if (!parsed) continue;

            if (parsed.name.length > 2 && parsed.quantity > 0 && parsed.cost_price > 0) {
                items.push({
                    serial_no: Number.isFinite(Number(parsed.serial_no)) ? Number(parsed.serial_no) : '',
                    name: parsed.name,
                    quantity: parsed.quantity,
                    cost_price: parsed.cost_price,
                    amount: Number.isFinite(parsed.amount) ? parsed.amount : parsed.quantity * parsed.cost_price,
                    hsn: parsed.hsn || '',
                    gst_rate: inferGstRateByHsn(parsed.hsn),
                    item_type: 'Retail',
                    source_code: '',
                    model_name: '',
                    size_code: ''
                });
            }
        }
    }

    const totalFromLines = extractTotalAmount(lines);
    const totalFromItems = items.reduce((sum, i) => sum + (Number.isFinite(i.amount) ? i.amount : 0), 0);

    // If heuristic failed to find any items, just return raw text so the user can at least see it
    return {
        vendor_name,
        vendor_contact: vendor_phone,
        bill_number: bill_number || '',
        bill_date: bill_date || '',
        total_amount: Number.isFinite(totalFromLines) ? totalFromLines : totalFromItems,
        page_count: Number(options.pageCount || pages.length || 0),
        items,
        raw_text: pages.join('\n \n') || text // Keep page-wise text separated by space/newline
    };
}

// Main Orchestrator
async function extractBillData(filePath, mimeType) {
    const isPdf = mimeType === 'application/pdf';
    let text = '';
    let pageTexts = [];
    let pageCount = 0;
    let tableData = null;
    const tempImages = [];
    const outputDir = path.dirname(filePath);

    try {
        if (isPdf) {
            // Fast path: use embedded PDF text first (no Ghostscript dependency).
            const parsedPdf = await extractTextFromPdf(filePath);
            text = String(parsedPdf?.text || '');
            pageTexts = Array.isArray(parsedPdf?.pages) ? parsedPdf.pages : [];
            pageCount = Number(parsedPdf?.total || pageTexts.length || 0);
            tableData = parsedPdf?.tables || null;
            const hasUsefulText = text.replace(/\s+/g, '').length > 80;

            if (!hasUsefulText) {
                // Fallback for scanned/image PDFs.
                const images = await convertPdfToImages(filePath, outputDir);
                tempImages.push(...images);
                for (const imgPath of images) {
                    text += await recognizeImage(imgPath) + '\n\n';
                }
            }
        } else {
            text = await recognizeImage(filePath);
        }

        const parsedData = parseInvoiceText(text, {
            pages: pageTexts,
            pageCount,
            tables: tableData
        });
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
