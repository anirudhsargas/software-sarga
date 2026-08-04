const CLOUDINARY_PATTERN = /^https?:\/\/res\.cloudinary\.com\//;

const loadedImageDimensions = {};

async function loadImageAsBase64(url) {
    if (!url) return null;
    try {
        if (url.startsWith('blob:') || url.startsWith('data:')) {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = url;
            });
            loadedImageDimensions[url] = { w: img.naturalWidth, h: img.naturalHeight };
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            return canvas.toDataURL('image/jpeg', 0.85);
        }

        let fetchUrl = url;
        const headers = {};

        if (!CLOUDINARY_PATTERN.test(url)) {
            const token = localStorage.getItem('token');
            if (token) headers['Authorization'] = `Bearer ${token}`;
            headers['ngrok-skip-browser-warning'] = '1';
        }

        const response = await fetch(fetchUrl, { headers });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();

        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });

        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = dataUrl;
        });
        loadedImageDimensions[url] = { w: img.naturalWidth, h: img.naturalHeight };

        return dataUrl;
    } catch {
        return null;
    }
}

function formatPrice(amount) {
    const num = Number(amount || 0);
    return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getRetailPrice(product) {
    if (product.slabs && product.slabs.length > 0) {
        return Number(product.slabs[0].unit_rate) || 0;
    }
    return Number(product.sell_price) || 0;
}

function getOffsetPrice(product) {
    if (product.slabs && product.slabs.length > 0) {
        return Number(product.slabs[0].offset_unit_rate) || 0;
    }
    return 0;
}

export async function generateCataloguePDF(products, companyInfo, options = {}) {
    const {
        showImages = true,
        showDescription = true,
        showRetailPrice = true,
        showOffsetPrice = true,
        showProductCode = true,
        showCategory = true,
        showStock = true,
        showHeader = true,
        showFooter = true,
        orientation = 'portrait',
        onProgress = () => {},
        onPage = () => {},
    } = options;

    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF({
        orientation: orientation === 'landscape' ? 'l' : 'p',
        unit: 'mm',
        format: 'a4',
        compress: true,
    });

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 7;
    const usableW = pageW - margin * 2;

    const headerH = showHeader ? 12 : 0;
    const footerH = showFooter ? 6 : 0;
    const cellGap = 3;
    const rowGap = 3;
    const cols = orientation === 'landscape' ? 6 : 3;
    const targetRows = orientation === 'landscape' ? 3 : 6;
    const colW = (usableW - (cols - 1) * cellGap) / cols;
    const contentTop = margin + headerH + 2;
    const contentBottom = pageH - margin - footerH;
    const availableH = contentBottom - contentTop;
    const rowH = (availableH - (targetRows - 1) * rowGap) / targetRows;

    // Brand color system
    const navyPrimary = [15, 23, 42];     // Deep navy #0f172a
    const goldAccent = [217, 119, 6];      // Warm gold/amber #d97706
    const offsetRed = [220, 38, 38];       // Offset price red #dc2626
    const textDark = [30, 41, 59];        // Slate dark #1e293b
    const textMuted = [100, 116, 139];    // Muted slate #64748b
    const bgLight = [248, 250, 252];      // Light studio bg #f8fafc
    const cardBorder = [226, 232, 240];   // Border slate #e2e8f0
    const stockGreen = [16, 185, 129];    // In-stock green #10b981
    const stockRed = [239, 68, 68];       // Out-of-stock red #ef4444

    // Group products by Family / Category for structured catalog display
    const groupedProducts = [];
    const categoryMap = new Map();
    products.forEach(p => {
        const catName = p.subcategory_name || p.category_name || 'Trophies & Mementos';
        if (!categoryMap.has(catName)) {
            categoryMap.set(catName, []);
        }
        categoryMap.get(catName).push(p);
    });

    categoryMap.forEach((items, catName) => {
        groupedProducts.push({ isHeader: true, title: catName });
        items.forEach(p => groupedProducts.push({ isHeader: false, ...p }));
    });

    const productsPerPage = cols * targetRows; // 18 items per page
    const totalPages = Math.ceil(products.length / productsPerPage) || 1;

    onProgress({ step: 'loading-images', message: 'Loading product images...', percent: 0 });

    let imageCache = {};
    if (showImages) {
        const imgProducts = products.filter(p => p.image_url);
        let loaded = 0;
        const total = imgProducts.length;
        const batchSize = 4;
        for (let i = 0; i < imgProducts.length; i += batchSize) {
            const batch = imgProducts.slice(i, i + batchSize);
            const results = await Promise.all(
                batch.map(async (p) => {
                    if (imageCache[p.id]) return { id: p.id, data: imageCache[p.id] };
                    const data = await loadImageAsBase64(p.image_url);
                    return { id: p.id, data };
                })
            );
            results.forEach(r => { if (r.data) imageCache[r.id] = r.data; });
            loaded += batch.length;
            onProgress({
                step: 'loading-images',
                message: `Loading studio images... ${Math.min(loaded, total)}/${total}`,
                percent: (loaded / Math.max(total, 1)) * 25,
            });
        }
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
    });

    // Pagination and card layout
    let currentPage = 0;
    let cardCount = 0;
    let currentCategory = 'Trophies & Mementos Catalogue';

    const drawHeader = (pageNum, activeCategory) => {
        if (!showHeader) return;

        // Deep navy masthead
        doc.setFillColor(...navyPrimary);
        doc.rect(margin, margin, usableW, headerH, 'F');

        // Gold accent bottom line
        doc.setFillColor(...goldAccent);
        doc.rect(margin, margin + headerH - 0.8, usableW, 0.8, 'F');

        // Company title & subtitle
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(255, 255, 255);
        doc.text(companyInfo.name || 'SARGA PRINTS', margin + 3, margin + 4.5);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(226, 232, 240);
        doc.text('Trophies & Mementos Catalogue • Perambra & Meppayur', margin + 3, margin + 8.5);

        // Running category / family header on right
        let rightX = margin + usableW - 3;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(253, 230, 138); // Soft gold text
        doc.text(activeCategory, rightX, margin + 4.5, { align: 'right' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.5);
        doc.setTextColor(148, 163, 184);
        const contactLine = [companyInfo.phone ? `Tel: ${companyInfo.phone}` : null, dateStr].filter(Boolean).join(' | ');
        if (contactLine) {
            doc.text(contactLine, rightX, margin + 8.5, { align: 'right' });
        }
    };

    const drawFooter = (pageNum, totalP) => {
        if (!showFooter) return;
        const footerY = pageH - margin - 1.5;

        doc.setDrawColor(...cardBorder);
        doc.setLineWidth(0.2);
        doc.line(margin, pageH - margin - footerH, margin + usableW, pageH - margin - footerH);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...textMuted);
        doc.text('Sarga Prints — Premium Trophies, Mementos & Awards', margin, footerY);
        doc.text(`Page ${pageNum} of ${totalP}`, margin + usableW, footerY, { align: 'right' });
    };

    // Render cards page by page
    drawHeader(1, currentCategory);

    let col = 0;
    let row = 0;

    for (let i = 0; i < products.length; i++) {
        const product = products[i];
        if (product.subcategory_name || product.category_name) {
            currentCategory = product.subcategory_name || product.category_name;
        }

        // New page check
        if (cardCount > 0 && cardCount % productsPerPage === 0) {
            drawFooter(currentPage + 1, totalPages);
            doc.addPage();
            currentPage++;
            col = 0;
            row = 0;
            drawHeader(currentPage + 1, currentCategory);
            onProgress({
                step: 'generating',
                message: `Rendering page ${currentPage + 1} of ${totalPages}...`,
                percent: 25 + (currentPage / totalPages) * 70,
            });
            onPage(currentPage + 1, totalPages);
        }

        const x = margin + col * (colW + cellGap);
        const y = contentTop + row * (rowH + rowGap);

        // 1. Card Container (White studio background with subtle border)
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(...cardBorder);
        doc.setLineWidth(0.25);
        doc.roundedRect(x, y, colW, rowH, 1.5, 1.5, 'FD');

        const pad = 2;
        const innerW = colW - pad * 2;
        const innerX = x + pad;

        // 2. Square Photo Area (Standardized studio container)
        const imgH = showImages ? Math.min(rowH * 0.48, 20) : 0;
        if (showImages) {
            const imgY = y + pad;
            doc.setFillColor(...bgLight);
            doc.setDrawColor(...cardBorder);
            doc.setLineWidth(0.15);
            doc.roundedRect(innerX, imgY, innerW, imgH, 1, 1, 'FD');

            const imgData = product.image_url ? imageCache[product.id] : null;
            if (imgData) {
                try {
                    // Center product in square/studio container
                    const imgFitSize = Math.min(innerW - 1.5, imgH - 1.5);
                    const imgOffsetX = innerX + (innerW - imgFitSize) / 2;
                    const imgOffsetY = imgY + (imgH - imgFitSize) / 2;
                    doc.addImage(imgData, 'JPEG', imgOffsetX, imgOffsetY, imgFitSize, imgFitSize, undefined, 'FAST');
                } catch {}
            } else {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(5.5);
                doc.setTextColor(...textMuted);
                doc.text('No Image', innerX + innerW / 2, imgY + imgH / 2, { align: 'center', baseline: 'middle' });
            }
        }

        // 3. Card Details Layout
        const textY = y + pad + (showImages ? imgH + 2.2 : 2.5);

        // Retail Price String
        const retailPrice = getRetailPrice(product);
        const offsetPrice = getOffsetPrice(product);
        const priceStr = showRetailPrice && retailPrice > 0 ? `Rs. ${formatPrice(retailPrice)}` : '';
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);

        const priceWidth = priceStr ? doc.getTextWidth(priceStr) + 1.5 : 0;

        // Product Name (Bold, scaled for 18-per-sheet PDF card)
        doc.setTextColor(...textDark);
        doc.setFontSize(7.5);
        const nameStr = String(product.name || '');
        const nameLines = doc.splitTextToSize(nameStr, innerW - priceWidth);
        doc.text(nameLines[0] || nameStr, innerX, textY);

        // Visual Anchor Price (Top Right / Distinctive Gold Accent)
        if (priceStr) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(...goldAccent);
            doc.text(priceStr, innerX + innerW, textY, { align: 'right' });
        }

        // Compact Secondary Info Line (SKU, Offset Price, Stock Badge)
        let subY = textY + 3.2;

        // SKU Code
        if (showProductCode && product.product_code) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(5.5);
            doc.setTextColor(...textMuted);
            doc.text(`SKU: ${product.product_code}`, innerX, subY);
        }

        // Offset / Wholesale Price if present
        if (showOffsetPrice && offsetPrice > 0) {
            const offX = showProductCode && product.product_code ? innerX + 20 : innerX;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(5.5);
            doc.setTextColor(...offsetRed);
            doc.text(`WS: Rs. ${formatPrice(offsetPrice)}`, offX, subY);
        }

        // Stock Badge (Bottom Right of card - Green for in-stock, Red for out of stock)
        if (showStock && product.stock_quantity !== undefined && product.stock_quantity !== null) {
            const stockQty = Number(product.stock_quantity);
            const isInStock = stockQty > 0;
            const stockText = isInStock ? `Stock: ${stockQty}` : 'Stock: 0 pcs';

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(5.5);
            doc.setTextColor(...(isInStock ? stockGreen : stockRed));
            doc.text(stockText, innerX + innerW, subY, { align: 'right' });
        }

        // Product description line (2 lines of description)
        if (showDescription && product.description) {
            const descY = subY + 3.2;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(5);
            doc.setTextColor(...textMuted);
            const descStr = String(product.description).trim();
            const descLines = doc.splitTextToSize(descStr, innerW);
            if (descLines[0]) doc.text(descLines[0], innerX, descY);
            if (descLines[1]) doc.text(descLines[1], innerX, descY + 2.3);
        }

        cardCount++;
        col++;
        if (col >= cols) {
            col = 0;
            row++;
        }
    }

    drawFooter(currentPage + 1, totalPages);

    onProgress({ step: 'complete', message: 'Trophies Catalogue PDF generated!', percent: 100 });
    return doc;
}

export async function downloadCataloguePDF(products, companyInfo, options = {}) {
    const doc = await generateCataloguePDF(products, companyInfo, options);
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const filename = `Product_Catalogue_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}.pdf`;
    doc.save(filename);
}

export async function downloadCompressedPDF(products, companyInfo, options = {}) {
    const doc = await generateCataloguePDF(products, companyInfo, options);
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const filename = `Product_Catalogue_Compressed_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}.pdf`;
    doc.save(filename);
}

export async function downloadPrintReadyPDF(products, companyInfo, options = {}) {
    const doc = await generateCataloguePDF(products, companyInfo, options);
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const filename = `Product_Catalogue_Print_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}.pdf`;
    doc.save(filename);
}

export async function downloadIndividualCardsZip(products, companyInfo, options = {}) {
    const JSZip = (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js')).default;
    const { default: jsPDF } = await import('jspdf');
    const zip = new JSZip();

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const m = 5;
    const cardW = pageW - m * 2;
    const cardH = pageH - m * 2;
    const primary = [30, 58, 95];
    const textMuted = [120, 125, 130];
    const textDark = [33, 37, 41];
    const accent = [41, 128, 185];
    const borderColor = [210, 210, 215];

    for (let i = 0; i < products.length; i++) {
        const product = products[i];
        if (i > 0) doc.addPage();

        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(...borderColor);
        doc.setLineWidth(0.5);
        doc.roundedRect(m, m, cardW, cardH, 3, 3, 'FD');

        let y = m + 8;
        const x = m + 6;
        const contentW = cardW - 12;

        if (options.showImages !== false && product.image_url) {
            try {
                const imgData = await loadImageAsBase64(product.image_url);
                if (imgData) {
                    const imgH = 50;
                    doc.addImage(imgData, 'JPEG', x, y, contentW, imgH, undefined, 'FAST');
                    y += imgH + 8;
                }
            } catch {}
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(...textDark);
        const nameLines = doc.splitTextToSize(String(product.name || ''), contentW);
        doc.text(nameLines[0], x, y);
        y += 8;

        const retail = getRetailPrice(product);
        const offset = getOffsetPrice(product);
        if (retail > 0 || offset > 0) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.setTextColor(...accent);
            const parts = [];
            if (retail > 0) parts.push(`MRP: \u20B9${formatPrice(retail)}`);
            if (offset > 0) parts.push(`Wholesale: \u20B9${formatPrice(offset)}`);
            doc.text(parts.join('  |  '), x, y);
            y += 7;
        }

        if (options.showDescription !== false && product.description) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...textMuted);
            const descLines = doc.splitTextToSize(String(product.description), contentW);
            descLines.slice(0, 4).forEach(line => {
                doc.text(line, x, y);
                y += 4.5;
            });
        }

        y = Math.max(y, m + cardH - 20);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...textMuted);
        const metaParts = [];
        if (options.showStock !== false && product.stock_quantity !== undefined && product.stock_quantity !== null) {
            metaParts.push(`Stock: ${Number(product.stock_quantity)}${product.stock_unit ? ' ' + product.stock_unit : ''}`);
        }
        if (product.product_code) metaParts.push(`SKU: ${product.product_code}`);
        if (product.category_name) metaParts.push(product.category_name);
        if (product.company_name) metaParts.push(product.company_name);
        if (metaParts.length > 0) {
            doc.text(metaParts.join(' | '), x, y);
            y += 5;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...primary);
        doc.text(companyInfo.name || '', x, m + cardH - 8);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...textMuted);
        doc.text('Product Catalogue', x + 50, m + cardH - 8);

        const pdfBlob = doc.output('blob');
        const safeName = (product.name || `product_${product.id}`).replace(/[^a-zA-Z0-9_-]/g, '_');
        zip.file(`${safeName}.pdf`, pdfBlob);
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const filename = `Product_Cards_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.zip`;

    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link);
}

export async function printCataloguePDF(products, companyInfo, options = {}) {
    const doc = await generateCataloguePDF(products, companyInfo, options);
    const pdfBlob = doc.output('blob');
    const url = URL.createObjectURL(pdfBlob);
    const printWindow = window.open(url, '_blank');
    if (!printWindow) {
        doc.save('Product_Catalogue.pdf');
        return;
    }
    printWindow.addEventListener('load', () => {
        setTimeout(() => {
            try { printWindow.print(); } catch {}
        }, 500);
    }, { once: true });
}
