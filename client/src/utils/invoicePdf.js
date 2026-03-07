import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';

/**
 * Generate a professional invoice PDF for a billing transaction.
 *
 * @param {Object} billData
 * @param {string}  billData.invoiceNumber   – Unique invoice ID
 * @param {string}  billData.invoiceDate     – Payment date string
 * @param {Object}  billData.customer        – { name, mobile, type, email, address, gst }
 * @param {Array}   billData.orderLines      – [{ product_name, quantity, unit_price, total_amount, category, subcategory, description }]
 * @param {Object}  billData.totals          – { subtotal, gross, net, sgst, cgst, effectiveDiscount, discountAmount }
 * @param {Object}  billData.payment         – { advancePaid, balance, methods, cash, upi, cheque, transfer, referenceNumber }
 * @param {Array}   billData.jobs            – [{ job_number }]
 * @param {string} [billData.companyName]    – Override company name
 * @param {string} [billData.upiId]          – UPI ID for QR code payment (e.g. 'shop@upi')
 * @returns {Promise<jsPDF>}
 */
export async function generateInvoicePDF(billData) {
  const {
    invoiceNumber,
    invoiceDate,
    customer = {},
    orderLines = [],
    totals = {},
    payment = {},
    jobs = [],
    companyName = 'SARGA DIGITAL PRESS',
    upiId = 'sargadigitalpress@upi',
  } = billData;

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 14;

  // ─── Colours ───
  const primary = [30, 58, 95];         // dark navy
  const accent = [41, 128, 185];        // blue
  const lightBg = [245, 247, 250];
  const textDark = [33, 37, 41];
  const textMuted = [108, 117, 125];

  // ─── Helper: formatted currency (without ₹ symbol, uses Rs.) ───
  const fmtAmt = (n) => {
    const num = Number(n || 0);
    return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // ─── HEADER ───
  doc.setFillColor(...primary);
  doc.rect(0, 0, pageWidth, 38, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text(companyName, margin, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(200, 210, 225);
  doc.text('Printing  |  Offset  |  Digital  |  Laser', margin, 26);

  // Invoice label on the right
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text('TAX INVOICE', pageWidth - margin, 18, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`#${invoiceNumber}`, pageWidth - margin, 26, { align: 'right' });

  y = 46;

  // ─── INVOICE META ROW ───
  doc.setFontSize(9);
  doc.setTextColor(...textMuted);
  const dateStr = invoiceDate
    ? new Date(invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  doc.text(`Date: ${dateStr}`, margin, y);
  if (customer.type) {
    doc.text(`Customer Type: ${customer.type}`, pageWidth / 2, y);
  }
  y += 10;

  // ─── CUSTOMER & BILLING BOXES ───
  const boxW = (pageWidth - margin * 2 - 8) / 2;

  // Bill To
  doc.setFillColor(...lightBg);
  doc.roundedRect(margin, y, boxW, 36, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...accent);
  doc.text('BILL TO', margin + 6, y + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...textDark);
  const custName = customer.name || 'Walk-in Customer';
  doc.text(custName, margin + 6, y + 16);
  if (customer.mobile) {
    doc.setTextColor(...textMuted);
    doc.text(`Mobile: ${customer.mobile}`, margin + 6, y + 22);
  }
  if (customer.gst) {
    doc.setTextColor(...textMuted);
    doc.text(`GSTIN: ${customer.gst}`, margin + 6, y + 28);
  }
  if (customer.address) {
    doc.setTextColor(...textMuted);
    const addr = customer.address.length > 40 ? customer.address.substring(0, 40) + '…' : customer.address;
    doc.text(addr, margin + 6, y + 34);
  }

  // Payment Info box
  const rightBoxX = margin + boxW + 8;
  doc.setFillColor(...lightBg);
  doc.roundedRect(rightBoxX, y, boxW, 36, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...accent);
  doc.text('PAYMENT INFO', rightBoxX + 6, y + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...textDark);
  const methodStr = payment.methods || 'Cash';
  doc.text(`Method: ${methodStr}`, rightBoxX + 6, y + 16);
  doc.text(`Paid: Rs. ${fmtAmt(payment.advancePaid)}`, rightBoxX + 6, y + 22);
  const balance = Number(payment.balance) || 0;
  if (balance > 0) {
    doc.setTextColor(192, 57, 43);
    doc.text(`Balance Due: Rs. ${fmtAmt(balance)}`, rightBoxX + 6, y + 28);
  } else {
    doc.setTextColor(39, 174, 96);
    doc.text('PAID IN FULL', rightBoxX + 6, y + 28);
  }
  if (payment.referenceNumber) {
    doc.setTextColor(...textMuted);
    doc.text(`Ref: ${payment.referenceNumber}`, rightBoxX + 6, y + 34);
  }

  y += 44;

  // ─── ORDER LINE ITEMS TABLE ───
  const tableBody = orderLines.map((line, idx) => {
    const jobNum = jobs[idx]?.job_number || '';
    return [
      idx + 1,
      `${line.product_name || 'Item'}${jobNum ? `\n${jobNum}` : ''}`,
      line.category || '',
      Number(line.quantity) || 1,
      `Rs. ${fmtAmt(line.unit_price)}`,
      `Rs. ${fmtAmt(line.total_amount)}`,
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['#', 'Product / Job', 'Category', 'Qty', 'Unit Price', 'Amount']],
    body: tableBody,
    theme: 'grid',
    headStyles: {
      fillColor: primary,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      cellPadding: 3,
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: textDark,
      cellPadding: 2.5,
    },
    alternateRowStyles: {
      fillColor: [250, 251, 253],
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 30 },
      3: { halign: 'center', cellWidth: 14 },
      4: { halign: 'right', cellWidth: 28 },
      5: { halign: 'right', cellWidth: 30 },
    },
    margin: { left: margin, right: margin },
  });

  y = doc.lastAutoTable.finalY + 8;

  // ─── TOTALS SECTION (right-aligned) ───
  const totalsX = pageWidth - margin - 80;
  const valX = pageWidth - margin;
  const lineH = 7;

  const drawTotalRow = (label, value, opts = {}) => {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(opts.size || 9);
    doc.setTextColor(...(opts.color || textDark));
    doc.text(label, totalsX, y);
    doc.text(`Rs. ${fmtAmt(value)}`, valX, y, { align: 'right' });
    y += lineH;
  };

  // Subtotal
  drawTotalRow('Subtotal', totals.subtotal);

  // Discount (if any)
  if (totals.effectiveDiscount > 0) {
    drawTotalRow(
      `Discount (${Number(totals.effectiveDiscount).toFixed(1)}%)`,
      -totals.discountAmount,
      { color: [192, 57, 43] }
    );
  }

  // Taxable amount
  drawTotalRow('Taxable Amount', totals.net, { color: textMuted });

  // SGST / CGST — derive % from actual data
  const gstPct = totals.net > 0 ? ((totals.sgst / totals.net) * 100).toFixed(1) : '9.0';
  drawTotalRow(`SGST (${gstPct}%)`, totals.sgst, { color: textMuted });
  drawTotalRow(`CGST (${gstPct}%)`, totals.cgst, { color: textMuted });

  // Divider line
  doc.setDrawColor(...accent);
  doc.setLineWidth(0.5);
  doc.line(totalsX, y - 2, valX, y - 2);

  // Grand Total
  drawTotalRow('Grand Total', totals.gross, { bold: true, size: 11, color: primary });
  y += 2;

  // Paid / Balance
  drawTotalRow('Paid', payment.advancePaid, { color: [39, 174, 96] });
  if (balance > 0) {
    drawTotalRow('Balance Due', balance, { bold: true, color: [192, 57, 43] });
  }

  y += 8;

  // ─── QR CODE + TERMS & CONDITIONS ───
  const pageHeight = doc.internal.pageSize.getHeight();

  // Check if we need a new page for QR + Terms (need ~70mm space)
  if (y + 70 > pageHeight - 20) {
    doc.addPage();
    y = 20;
  }

  // Divider
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // ── QR Code (left side) ──
  const qrSize = 40;
  const grandTotal = Number(totals.gross || 0);
  try {
    const upiStr = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(companyName)}&am=${grandTotal.toFixed(2)}&cu=INR&tn=Invoice ${invoiceNumber || ''}`;
    const qrDataUrl = await QRCode.toDataURL(upiStr, {
      width: 200,
      margin: 1,
      color: { dark: '#1e3a5f', light: '#ffffff' },
    });
    doc.addImage(qrDataUrl, 'PNG', margin, y, qrSize, qrSize);

    // QR label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...accent);
    doc.text('SCAN TO PAY (UPI)', margin + qrSize / 2, y + qrSize + 4, { align: 'center' });
  } catch (err) {
    // QR generation failed — show fallback text
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...textMuted);
    doc.text('UPI Payment available', margin, y + 10);
  }

  // ── Terms & Conditions (right side) ──
  const termsX = margin + qrSize + 12;
  const termsW = pageWidth - margin - termsX;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...primary);
  doc.text('TERMS & CONDITIONS', termsX, y + 2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...textMuted);

  const terms = [
    '1. Goods once delivered will not be taken back or exchanged.',
    '2. All disputes are subject to local jurisdiction only.',
    '3. Colour variations in printing are inherent to the process.',
    '4. Delivery dates are approximate and may vary.',
    '5. Payment is due as per agreed terms. Late payments may incur charges.',
    '6. Please verify content & design approval before printing begins.',
    '7. Claims, if any, must be made within 3 days of delivery.',
  ];

  let termsY = y + 8;
  terms.forEach((term) => {
    const lines = doc.splitTextToSize(term, termsW);
    lines.forEach((line) => {
      doc.text(line, termsX, termsY);
      termsY += 3.5;
    });
  });

  y = Math.max(y + qrSize + 8, termsY + 4);

  // ─── FOOTER ───
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // Company stamp area
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...textMuted);
  doc.text('For ' + companyName, pageWidth - margin, y, { align: 'right' });
  y += 10;
  doc.text('Authorised Signatory', pageWidth - margin, y, { align: 'right' });

  // Thank you + timestamp
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(...textMuted);
  doc.text('Thank you for your business!', margin, y - 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(
    `Generated on ${new Date().toLocaleString('en-IN')}`,
    margin,
    y,
  );

  return doc;
}

/**
 * Download the invoice as a PDF file.
 * @param {Object} billData – Same shape as generateInvoicePDF
 */
export async function downloadInvoicePDF(billData) {
  const doc = await generateInvoicePDF(billData);
  const filename = `Invoice_${billData.invoiceNumber || 'BILL'}_${(billData.customer?.name || 'Customer').replace(/\s+/g, '_')}.pdf`;
  doc.save(filename);
}

/**
 * Open the invoice in a new browser tab for printing.
 * @param {Object} billData – Same shape as generateInvoicePDF
 */
export async function printInvoicePDF(billData) {
  const doc = await generateInvoicePDF(billData);
  const pdfBlob = doc.output('blob');
  const url = URL.createObjectURL(pdfBlob);
  const printWindow = window.open(url, '_blank');
  if (printWindow) {
    printWindow.addEventListener('load', () => {
      printWindow.print();
    });
  }
}
