const CLOUDINARY_PATTERN = /^https?:\/\/res\.cloudinary\.com\//;

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

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
}

function prepareImage(imgData, maxW, maxH) {
    if (!imgData) return null;
    return { data: imgData, width: maxW, height: maxH };
}

function formatPrice(amount) {
    const num = Number(amount || 0);
    return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function truncateText(doc, text, maxWidth, fontSize) {
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(String(text || ''), maxWidth);
    return lines;
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
        showHeader = true,
        showFooter = true,
        orientation = 'portrait',
        imageSize = 'medium',
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
    const margin = 10;
    const usableW = pageW - margin * 2;

    const headerH = showHeader ? 22 : 0;
    const footerH = showFooter ? 10 : 0;
    const gap = 4;
    const cols = 2;
    const rows = 5;
    const cardW = (usableW - gap) / cols;
    const usableH = pageH - margin * 2 - headerH - footerH;
    const cardH = (usableH - gap * (rows - 1)) / rows;

    const primary = [30, 58, 95];
    const accent = [41, 128, 185];
    const textDark = [33, 37, 41];
    const textMuted = [120, 125, 130];
    const borderColor = [210, 210, 215];
    const cardBg = [255, 255, 255];

    const productsPerPage = cols * rows;
    const totalPages = Math.ceil(products.length / productsPerPage);

    onProgress({ step: 'loading-images', message: 'Loading product images...', percent: 0 });

    let imageCache = {};
    if (showImages) {
        const imgProducts = products.slice(0, 100);
        let loaded = 0;
        const batchSize = 5;
        for (let i = 0; i < imgProducts.length; i += batchSize) {
            const batch = imgProducts.slice(i, i + batchSize);
            const results = await Promise.all(
                batch.map(async (p) => {
                    const data = await loadImageAsBase64(p.image_url);
                    return { id: p.id, data };
                })
            );
            results.forEach(r => { imageCache[r.id] = r.data; });
            loaded += batch.length;
            onProgress({
                step: 'loading-images',
                message: `Loading images... ${Math.min(loaded, imgProducts.length)}/${imgProducts.length}`,
                percent: (loaded / Math.max(imgProducts.length, 1)) * 20,
            });
        }
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
    });
    const timeStr = now.toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit',
    });

    for (let page = 0; page < totalPages; page++) {
        if (page > 0) doc.addPage();

        onProgress({
            step: 'generating',
            message: `Generating page ${page + 1} of ${totalPages}...`,
            percent: 20 + ((page + 1) / totalPages) * 75,
        });
        onPage(page + 1, totalPages);

        const startIdx = page * productsPerPage;
        const pageProducts = products.slice(startIdx, startIdx + productsPerPage);

        let yCursor = margin;

        if (showHeader) {
            const headerBottom = margin + headerH;
            doc.setFillColor(...primary);
            doc.rect(margin, yCursor, usableW, headerH, 'F');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.setTextColor(255, 255, 255);
            doc.text(companyInfo.name || 'Company Name', margin + 4, yCursor + 7);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(200, 210, 230);
            doc.text('Product Catalogue', margin + 4, yCursor + 13);

            let rightX = margin + usableW - 4;
            doc.setFontSize(6);
            doc.setTextColor(180, 190, 210);
            const contactParts = [];
            if (companyInfo.phone) contactParts.push(`Tel: ${companyInfo.phone}`);
            if (companyInfo.email) contactParts.push(`Email: ${companyInfo.email}`);
            if (companyInfo.website) contactParts.push(companyInfo.website);
            if (contactParts.length > 0) {
                doc.text(contactParts.join(' | '), rightX, yCursor + 7, { align: 'right' });
            }
            if (companyInfo.gst) {
                doc.text(`GST: ${companyInfo.gst}`, rightX, yCursor + 13, { align: 'right' });
            }
            doc.setFontSize(5.5);
            doc.setTextColor(160, 170, 200);
            doc.text(`Generated: ${dateStr} ${timeStr}`, rightX, yCursor + 18, { align: 'right' });

            yCursor = headerBottom + gap;
        } else {
            yCursor = margin;
        }

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const idx = row * cols + col;
                if (idx >= pageProducts.length) break;

                const product = pageProducts[idx];
                const x = margin + col * (cardW + gap);
                const y = yCursor + row * (cardH + gap);

                doc.setFillColor(...cardBg);
                doc.setDrawColor(...borderColor);
                doc.setLineWidth(0.3);
                doc.roundedRect(x, y, cardW, cardH, 2, 2, 'FD');

                let cardX = x + 2.5;
                let cardY = y + 2;
                const contentW = cardW - 5;
                const imgSizeRatios = { small: 0.35, medium: 0.42, large: 0.50 };
                const imgRatio = imgSizeRatios[imageSize] || imgSizeRatios.medium;
                const imgH = Math.min(cardH * imgRatio, 28);
                const descMaxW = contentW;
                const textLeftX = cardX;
                let textAreaStartY = cardY;

                if (showImages && product.image_url) {
                    const imgData = imageCache[product.id];
                    if (imgData) {
                        try {
                            const imgHCalc = imgH;
                            const imgWCalc = contentW;
                            doc.addImage(imgData, 'JPEG', cardX, cardY, imgWCalc, imgHCalc, undefined, 'FAST');
                            textAreaStartY = cardY + imgHCalc + 1.5;
                        } catch {
                            textAreaStartY = cardY;
                        }
                    } else {
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(5);
                        doc.setTextColor(...textMuted);
                        doc.text('No Image', cardX + contentW / 2, cardY + imgH / 2, {
                            align: 'center',
                            baseline: 'middle',
                        });
                        textAreaStartY = cardY + imgH + 1.5;
                    }
                }

                const remainingH = cardY + cardH - 4 - textAreaStartY;
                const nameSize = 6.5;
                const priceSize = 5.5;
                const descSize = 4.5;
                const metaSize = 4;
                const lineH = (size) => size * 0.4 + 0.8;

                let ty = textAreaStartY;
                const priceW = 28;
                const availW = contentW - priceW - 1;

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(nameSize);
                doc.setTextColor(...textDark);
                const nameLines = doc.splitTextToSize(String(product.name || ''), availW);
                const nameLine = nameLines[0] || '';
                doc.text(nameLine, textLeftX, ty);
                ty += lineH(nameSize);

                if (showRetailPrice || showOffsetPrice) {
                    const prices = [];
                    if (showRetailPrice) {
                        const rp = getRetailPrice(product);
                        if (rp > 0) prices.push({ label: 'MRP', value: rp });
                    }
                    if (showOffsetPrice) {
                        const op = getOffsetPrice(product);
                        if (op > 0) prices.push({ label: 'WS', value: op });
                    }

                    if (prices.length > 0) {
                        doc.setFont('helvetica', 'bold');
                        doc.setFontSize(priceSize);
                        const priceStr = prices.map(p => `${p.label}: \u20B9${formatPrice(p.value)}`).join('  ');
                        doc.setTextColor(...accent);
                        const priceLines = doc.splitTextToSize(priceStr, contentW);
                        doc.text(priceLines[0], textLeftX, ty);
                        ty += lineH(priceSize);
                    }
                }

                if (showDescription && product.description) {
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(descSize);
                    doc.setTextColor(...textMuted);
                    const descLines = doc.splitTextToSize(String(product.description), contentW);
                    const maxDescLines = Math.max(1, Math.floor((remainingH - (ty - textAreaStartY)) / (descSize * 0.35 + 0.6)) - 1);
                    const showLines = descLines.slice(0, Math.min(maxDescLines, 3));
                    showLines.forEach((line, i) => {
                        if (i === showLines.length - 1 && descLines.length > showLines.length) {
                            doc.text(line.replace(/\s+\S*$/, '...'), textLeftX, ty);
                        } else {
                            doc.text(line, textLeftX, ty);
                        }
                        ty += descSize * 0.35 + 0.6;
                    });
                }

                if (showProductCode || showCategory) {
                    const metaParts = [];
                    if (showProductCode && product.product_code) {
                        metaParts.push(`SKU: ${product.product_code}`);
                    }
                    if (showCategory && product.category_name) {
                        metaParts.push(product.category_name);
                    }
                    if (metaParts.length > 0) {
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(metaSize);
                        doc.setTextColor(...textMuted);
                        const metaStr = metaParts.join(' | ');
                        doc.text(metaStr, textLeftX, cardY + cardH - 3);
                    }
                }
            }
        }

        if (showFooter) {
            const footerY = pageH - margin - footerH + 1;
            doc.setDrawColor(200, 200, 205);
            doc.setLineWidth(0.3);
            doc.line(margin, footerY, margin + usableW, footerY);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(5.5);
            doc.setTextColor(...textMuted);
            doc.text(`Page ${page + 1} of ${totalPages}`, margin, footerY + 4);
            doc.text('Generated by Sarga ERP', margin + usableW / 2, footerY + 4, { align: 'center' });
            doc.text(`\u00A9 ${now.getFullYear()} ${companyInfo.name || 'Company'}`, margin + usableW, footerY + 4, { align: 'right' });
        }
    }

    onProgress({ step: 'complete', message: 'PDF generated successfully!', percent: 100 });
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
    const doc = await generateCataloguePDF(products, companyInfo, {
        ...options,
        imageSize: options.imageSize || 'small',
    });
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const filename = `Product_Catalogue_Compressed_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}.pdf`;
    doc.save(filename);
}

export async function downloadPrintReadyPDF(products, companyInfo, options = {}) {
    const doc = await generateCataloguePDF(products, companyInfo, {
        ...options,
        imageSize: options.imageSize || 'large',
    });
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
