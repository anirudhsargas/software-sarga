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
    const margin = 10;
    const usableW = pageW - margin * 2;

    const headerH = showHeader ? 10 : 0;
    const footerH = showFooter ? 5 : 0;
    const cellGap = 2.5;
    const rowGap = 2.5;
    const cols = 2;
    const targetRows = 15;
    const colW = (usableW - cellGap) / cols;
    const contentTop = margin + headerH;
    const contentBottom = pageH - margin - footerH;
    const availableH = contentBottom - contentTop;
    const rowH = (availableH - (targetRows - 1) * rowGap) / targetRows;
    const imgSize = showImages ? 11 : 0;

    const primary = [30, 58, 95];
    const accent = [41, 128, 185];
    const offsetColor = [200, 60, 40];
    const textDark = [33, 37, 41];
    const textMuted = [120, 125, 130];

    const productsPerPage = cols * targetRows;
    const totalPages = Math.ceil(products.length / productsPerPage);

    onProgress({ step: 'loading-images', message: 'Loading product images...', percent: 0 });

    let imageCache = {};
    if (showImages) {
        const imgProducts = products.filter(p => p.image_url);
        let loaded = 0;
        const total = imgProducts.length;
        const batchSize = 3;
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
                message: `Loading images... ${Math.min(loaded, total)}/${total}`,
                percent: (loaded / Math.max(total, 1)) * 20,
            });
        }
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
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

        if (showHeader) {
            doc.setFillColor(...primary);
            doc.rect(margin, margin, usableW, headerH, 'F');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(255, 255, 255);
            doc.text(companyInfo.name || 'Company Name', margin + 2, margin + 4);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(200, 210, 230);
            doc.text('Product Catalogue', margin + 2, margin + 8);

            let rightX = margin + usableW - 2;
            doc.setFontSize(5);
            doc.setTextColor(180, 190, 210);
            const contactParts = [];
            if (companyInfo.phone) contactParts.push(`Tel: ${companyInfo.phone}`);
            if (companyInfo.email) contactParts.push(`Email: ${companyInfo.email}`);
            if (companyInfo.website) contactParts.push(companyInfo.website);
            if (contactParts.length > 0) {
                doc.text(contactParts.join(' | '), rightX, margin + 4, { align: 'right' });
            }
            if (companyInfo.gst) {
                doc.text(`GST: ${companyInfo.gst}`, rightX, margin + 8, { align: 'right' });
            }
        }

        for (let row = 0; row < targetRows; row++) {
            for (let col = 0; col < cols; col++) {
                const idx = row * cols + col;
                if (idx >= pageProducts.length) break;

                const product = pageProducts[idx];
                const x = margin + col * (colW + cellGap);
                const y = contentTop + row * (rowH + rowGap);

                if (col === 0) {
                    doc.setDrawColor(225, 225, 230);
                    doc.setLineWidth(0.2);
                    doc.line(margin, y, margin + usableW, y);
                }

                const textStartX = x + imgSize + 2;
                const textW = colW - imgSize - 2;
                const rightX = x + colW;

                doc.setFillColor(252, 252, 253);
                doc.rect(x, y, colW, rowH, 'F');

                if (showImages) {
                    const imgY = y + (rowH - imgSize) / 2;
                    const imgData = product.image_url ? imageCache[product.id] : null;
                    if (imgData) {
                        try {
                            doc.addImage(imgData, 'JPEG', x, imgY, imgSize, imgSize, undefined, 'FAST');
                        } catch {}
                    } else {
                        doc.setFillColor(240, 240, 243);
                        doc.rect(x, imgY, imgSize, imgSize, 'F');
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(4.5);
                        doc.setTextColor(...textMuted);
                        doc.text('No', x + imgSize / 2, imgY + imgSize / 2 - 1.5, {
                            align: 'center', baseline: 'middle',
                        });
                        doc.text('Img', x + imgSize / 2, imgY + imgSize / 2 + 2.5, {
                            align: 'center', baseline: 'middle',
                        });
                    }
                }

                const nameY = y + 3.2;
                const skuY = y + 6;
                const descY = y + 8.8;
                const stockY = y + 11.5;

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8);
                doc.setTextColor(...textDark);
                const nameStr = String(product.name || '');
                const nameLines = doc.splitTextToSize(nameStr, textW - 35);
                doc.text(nameLines[0] || nameStr.substring(0, 22), textStartX, nameY);

                if (showProductCode && product.product_code) {
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(6.5);
                    doc.setTextColor(...textMuted);
                    doc.text(`SKU: ${product.product_code}`, textStartX, skuY);
                }

                if (showDescription && product.description) {
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(6.5);
                    doc.setTextColor(...textMuted);
                    const descStr = String(product.description);
                    if (descStr.length > 40) {
                        doc.text(descStr.substring(0, 40) + '...', textStartX, descY);
                    } else {
                        doc.text(descStr, textStartX, descY);
                    }
                }

                if (showRetailPrice) {
                    const rp = getRetailPrice(product);
                    if (rp > 0) {
                        doc.setFont('helvetica', 'bold');
                        doc.setFontSize(7);
                        doc.setTextColor(...textDark);
                        doc.text(`\u20B9${formatPrice(rp)}`, rightX - 1, nameY, { align: 'right' });
                    }
                }
                if (showOffsetPrice) {
                    const op = getOffsetPrice(product);
                    if (op > 0) {
                        doc.setFont('helvetica', 'bold');
                        doc.setFontSize(7);
                        doc.setTextColor(...offsetColor);
                        doc.text(`\u20B9${formatPrice(op)}`, rightX - 1, skuY, { align: 'right' });
                    }
                }

                if (showStock && product.stock_quantity !== undefined && product.stock_quantity !== null) {
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(5.5);
                    doc.setTextColor(...textMuted);
                    doc.text(`Stock: ${Number(product.stock_quantity)}${product.stock_unit ? ' ' + product.stock_unit : ''}`, rightX - 1, descY, { align: 'right' });
                }

                if (showCategory && product.category_name && !showProductCode && !showDescription) {
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(5.5);
                    doc.setTextColor(...textMuted);
                    doc.text(product.category_name, textStartX, descY);
                }
            }
            if (row * cols + cols > pageProducts.length) break;
        }

        if (showFooter) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(...textMuted);
            doc.text(`Page ${page + 1} of ${totalPages}`, margin + usableW / 2, pageH - margin - footerH + 3, { align: 'center' });
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
