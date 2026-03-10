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
    companyName = 'SARGA',
    upiId = 'sargadigitalpress@upi',
  } = billData;

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  let y = 14;

  // ─── Colours ───
  const primary = [30, 58, 95];
  const accent = [41, 128, 185];
  const lightBg = [245, 247, 250];
  const textDark = [33, 37, 41];
  const textMuted = [108, 117, 125];

  const fmtAmt = (n) => {
    const num = Number(n || 0);
    return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // ─── HEADER (compact) ───
  doc.setFillColor(...primary);
  doc.rect(0, 0, pageWidth, 32, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(255, 255, 255);
  doc.text(companyName, margin, 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(200, 210, 225);
  doc.text('Offset | Digital Printing | Laser | Memento | Photoframe | ID Card | Die Cutting | Photostat | Wedding Cards | Lamination', margin, 22);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text('TAX INVOICE', pageWidth - margin, 15, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`#${invoiceNumber}`, pageWidth - margin, 22, { align: 'right' });

  y = 38;

  // ─── INVOICE META ROW ───
  doc.setFontSize(8);
  doc.setTextColor(...textMuted);
  const dateStr = invoiceDate
    ? new Date(invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  doc.text(`Date: ${dateStr}`, margin, y);
  if (customer.type) {
    doc.text(`Customer Type: ${customer.type}`, pageWidth / 2, y);
  }
  y += 8;

  // ─── CUSTOMER & PAYMENT INFO BOXES (compact) ───
  const boxW = (pageWidth - margin * 2 - 8) / 2;
  const boxH = 30;

  // Bill To
  doc.setFillColor(...lightBg);
  doc.roundedRect(margin, y, boxW, boxH, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...accent);
  doc.text('BILL TO', margin + 5, y + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...textDark);
  const custName = customer.name || 'Walk-in Customer';
  doc.text(custName, margin + 5, y + 14);
  let custY = y + 19;
  doc.setFontSize(7.5);
  doc.setTextColor(...textMuted);
  if (customer.mobile) {
    doc.text(`Mobile: ${customer.mobile}`, margin + 5, custY);
    custY += 4.5;
  }
  if (customer.gst) {
    doc.text(`GSTIN: ${customer.gst}`, margin + 5, custY);
    custY += 4.5;
  }
  if (customer.address) {
    const addr = customer.address.length > 40 ? customer.address.substring(0, 40) + '…' : customer.address;
    doc.text(addr, margin + 5, custY);
  }

  // Payment Info box
  const rightBoxX = margin + boxW + 8;
  const balance = Number(payment.balance) || 0;
  doc.setFillColor(...lightBg);
  doc.roundedRect(rightBoxX, y, boxW, boxH, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...accent);
  doc.text('PAYMENT INFO', rightBoxX + 5, y + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...textDark);
  const methodStr = payment.methods || 'Cash';
  doc.text(`Method: ${methodStr}`, rightBoxX + 5, y + 14);

  // Paid
  doc.setTextColor(39, 174, 96);
  doc.text(`Paid: Rs. ${fmtAmt(payment.advancePaid)}`, rightBoxX + 5, y + 20);

  // Balance Due
  if (balance > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(192, 57, 43);
    doc.text(`Balance Due: Rs. ${fmtAmt(balance)}`, rightBoxX + 5, y + 26);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(39, 174, 96);
    doc.text('PAID IN FULL', rightBoxX + 5, y + 26);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...textMuted);
  if (payment.referenceNumber) {
    doc.text(`Ref: ${payment.referenceNumber}`, rightBoxX + 5, y + boxH - 2);
  }

  y += boxH + 6;

  // ─── ORDER LINE ITEMS TABLE (compact) ───
  const tableBody = orderLines.map((line, idx) => {
    const jobNum = jobs[idx]?.job_number || '';
    return [
      idx + 1,
      `${line.product_name || 'Item'}${jobNum ? ` (${jobNum})` : ''}`,
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
      fontSize: 8,
      cellPadding: 2.5,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: textDark,
      cellPadding: 2,
    },
    alternateRowStyles: {
      fillColor: [250, 251, 253],
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 9 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 28 },
      3: { halign: 'center', cellWidth: 12 },
      4: { halign: 'right', cellWidth: 26 },
      5: { halign: 'right', cellWidth: 28 },
    },
    margin: { left: margin, right: margin },
  });

  y = doc.lastAutoTable.finalY + 6;

  // ─── TOTALS SECTION (right-aligned, compact) ───
  const totalsW = 82;
  const totalsX = pageWidth - margin - totalsW;
  const valX = pageWidth - margin;
  const lineH = 6;

  const drawTotalRow = (label, value, opts = {}) => {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(opts.size || 8.5);
    doc.setTextColor(...(opts.color || textDark));
    doc.text(label, totalsX, y);
    doc.text(`Rs. ${fmtAmt(value)}`, valX, y, { align: 'right' });
    y += lineH;
  };

  drawTotalRow('Subtotal', totals.subtotal);

  if (totals.effectiveDiscount > 0) {
    drawTotalRow(
      `Discount (${Number(totals.effectiveDiscount).toFixed(1)}%)`,
      -totals.discountAmount,
      { color: [39, 174, 96] }
    );
  }

  drawTotalRow('Taxable Amount', totals.net, { color: textMuted });

  const gstPct = totals.net > 0 ? ((totals.sgst / totals.net) * 100).toFixed(1) : '9.0';
  drawTotalRow(`SGST (${gstPct}%)`, totals.sgst, { color: textMuted });
  drawTotalRow(`CGST (${gstPct}%)`, totals.cgst, { color: textMuted });

  // Grand Total divider
  y += 1;
  doc.setDrawColor(...accent);
  doc.setLineWidth(0.5);
  doc.line(totalsX, y, valX, y);
  y += 5;

  // Grand Total
  drawTotalRow('Grand Total', totals.gross, { bold: true, size: 11, color: primary });

  y += 6;

  // ─── QR CODE + TERMS + FOOTER pinned to bottom of page ───
  const qrSize = 34;
  const termsFont = 6;
  const termsLineH = 3.2;
  const footerH = 22;   // space needed for footer (divider + thank you + signatory)
  const blockH = qrSize + 8 + footerH; // QR section height + footer
  const bottomStart = pageHeight - blockH - 4;

  // If content has already passed the bottom section start, add a new page
  if (y > bottomStart) {
    doc.addPage();
    y = margin;
  }

  // Jump y to pinned bottom position
  y = bottomStart;

  // Divider above QR+Terms block
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 4;

  // QR Code (left)
  const grandTotal = Number(totals.gross || 0);
  try {
    const upiStr = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(companyName)}&am=${grandTotal.toFixed(2)}&cu=INR&tn=Invoice ${invoiceNumber || ''}`;
    const qrDataUrl = await QRCode.toDataURL(upiStr, {
      width: 160,
      margin: 1,
      color: { dark: '#1e3a5f', light: '#ffffff' },
    });
    doc.addImage(qrDataUrl, 'PNG', margin, y, qrSize, qrSize);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...accent);
    doc.text('SCAN TO PAY', margin + qrSize / 2, y + qrSize + 3, { align: 'center' });
  } catch (err) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...textMuted);
    doc.text('UPI Payment available', margin, y + 8);
  }

  // Terms (right of QR)
  const termsX = margin + qrSize + 8;
  const termsW = pageWidth - margin - termsX;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...primary);
  doc.text('TERMS & CONDITIONS', termsX, y + 2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(termsFont);
  doc.setTextColor(...textMuted);

  const terms = [
    '1. Goods once delivered will not be taken back or exchanged.',
    '2. All disputes are subject to local jurisdiction only.',
    '3. Colour variations in printing are inherent to the process.',
    '4. Delivery dates are approximate and may vary.',
    '5. Payment is due as per agreed terms.',
    '6. Verify content & design approval before printing.',
    '7. Claims must be made within 3 days of delivery.',
  ];

  let termsY = y + 7;
  terms.forEach((term) => {
    const lines = doc.splitTextToSize(term, termsW);
    lines.forEach((line) => {
      doc.text(line, termsX, termsY);
      termsY += termsLineH;
    });
  });

  // ─── FOOTER pinned to very bottom ───
  const footerY = pageHeight - margin - 12;

  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(margin, footerY, pageWidth - margin, footerY);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(...textMuted);
  doc.text('Thank you for your business!', margin, footerY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text(`Generated on ${new Date().toLocaleString('en-IN')}`, margin, footerY + 9);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...textMuted);
  doc.text('For ' + companyName, pageWidth - margin, footerY + 5, { align: 'right' });
  doc.text('Authorised Signatory', pageWidth - margin, footerY + 12, { align: 'right' });

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
