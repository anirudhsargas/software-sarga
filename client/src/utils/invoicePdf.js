export async function generateInvoicePDF(billData) {
  const [jsPDFModule, autoTableModule, QrCreatorModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('qr-creator')
  ]);
  const jsPDF = jsPDFModule.default;
  const autoTable = autoTableModule.default;
  const QrCreator = QrCreatorModule.default;

  // Normalize billData to support both camelCase/nested and flat/snake_case structures
  const invoiceNumber = billData.invoiceNumber || billData.invoice_number || 'Draft';
  const invoiceDate = billData.invoiceDate || billData.payment_date || billData.created_at;
  
  const customer = billData.customer || {
    name: billData.customer_name || 'Walk-in Customer',
    mobile: billData.customer_mobile || '',
    email: billData.customer_email || '',
    address: billData.customer_address || '',
    gst: billData.customer_gst || '',
    type: billData.customer_type || 'Retail'
  };

  const rawOrderLines = billData.orderLines || billData.order_lines || [];
  const orderLines = Array.isArray(rawOrderLines) ? rawOrderLines : [];

  const totals = billData.totals || {
    subtotal: Number(billData.subtotal || billData.bill_amount || billData.total_amount || 0),
    gross: Number(billData.gross || billData.total_amount || 0),
    net: Number(billData.net || billData.net_amount || ((billData.total_amount || 0) / 1.18)),
    sgst: Number(billData.sgst || billData.sgst_amount || (((billData.total_amount || 0) / 1.18) * 0.09)),
    cgst: Number(billData.cgst || billData.cgst_amount || (((billData.total_amount || 0) / 1.18) * 0.09)),
    effectiveDiscount: Number(billData.effectiveDiscount || billData.discount_percent || 0),
    discountAmount: Number(billData.discountAmount || billData.discount_amount || 0)
  };

  // Safe payment normalization supporting nested/camelCase, flat/snake_case, and billing page shapes
  let rawAdvance = 0;
  if (billData.payment?.advancePaid !== undefined) {
    rawAdvance = Number(billData.payment.advancePaid);
  } else if (billData.payment?.advance_paid !== undefined) {
    rawAdvance = Number(billData.payment.advance_paid);
  } else if (billData.advance_paid !== undefined) {
    rawAdvance = Number(billData.advance_paid);
  } else if (billData.payment?.cash_amount !== undefined || billData.payment?.upi_amount !== undefined) {
    // If it comes from billing success page: sum the payment method splits
    rawAdvance = Number(billData.payment.cash_amount || 0) + Number(billData.payment.upi_amount || 0) + Number(billData.payment.cheque_amount || 0) + Number(billData.payment.account_transfer_amount || 0);
  }

  const grossTotal = Number(totals.gross || 0);
  let rawBalance = 0;
  if (billData.payment?.balance !== undefined) {
    rawBalance = Number(billData.payment.balance);
  } else if (billData.payment?.balance_amount !== undefined) {
    rawBalance = Number(billData.payment.balance_amount);
  } else if (billData.balance_amount !== undefined) {
    rawBalance = Number(billData.balance_amount);
  } else {
    // Fallback: balance = total - advance
    rawBalance = Math.max(0, grossTotal - rawAdvance);
  }

  const payment = {
    advancePaid: rawAdvance,
    balance: rawBalance,
    methods: billData.payment?.methods || billData.payment?.method || billData.payment_method || billData.paymentMethod || 'Cash',
    referenceNumber: billData.payment?.referenceNumber || billData.payment?.reference_number || billData.reference_number || billData.referenceNumber || null
  };

  const jobs = billData.jobs || [];
  const companyName = billData.companyName || 'SARGA';
  const upiId = billData.upiId || 'sargadigitalpress@upi';

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
  doc.text('INVOICE', pageWidth - margin, 15, { align: 'right' });
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
    
    // Construct extra details line
    const details = [];
    if (line.colour) details.push(`Color: ${line.colour}`);
    if (line.paper_preference) details.push(`Paper: ${line.paper_preference}`);
    if (line.numbering_from || line.numbering_to) {
      details.push(`No: ${line.numbering_from || ''} - ${line.numbering_to || ''}`);
    }
    if (line.description) details.push(line.description);
    if (line.special_instructions) details.push(`Note: ${line.special_instructions}`);
    
    const detailsStr = details.length > 0 ? `\n${details.join(' | ')}` : '';
    
    return [
      idx + 1,
      `${line.product_name || 'Item'}${jobNum ? ` (${jobNum})` : ''}${detailsStr}`,
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

  // ─── NOTES SECTION (if description present) ───
  const { description } = billData;
  if (description) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...primary);
    doc.text('Notes', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...textDark);
    const lines = doc.splitTextToSize(String(description), pageWidth - margin * 2);
    lines.forEach((line) => {
      y += 5;
      doc.text(line, margin, y);
    });
    y += 6;
  }

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
  if (balance > 0) {
    try {
      const upiStr = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(companyName)}&am=${balance.toFixed(2)}&cu=INR&tn=Invoice ${invoiceNumber || ''}`;
      const canvas = document.createElement('canvas');
      QrCreator.render({
        text: upiStr,
        radius: 0.0,
        ecLevel: 'M',
        fill: '#1a3a5f',
        background: '#ffffff',
        size: 160
      }, canvas);
      const qrDataUrl = canvas.toDataURL('image/png');
      doc.addImage(qrDataUrl, 'PNG', margin, y, qrSize, qrSize);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(...accent);
      doc.text('SCAN TO PAY', margin + qrSize / 2, y + qrSize + 3, { align: 'center' });
    } catch {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...textMuted);
      doc.text('UPI Payment available', margin, y + 8);
    }
  } else {
    // If balance is 0, show a clean, premium "PAID IN FULL" visual stamp/box
    doc.setFillColor(236, 253, 245); // Emerald-50
    doc.setDrawColor(16, 185, 129); // Emerald-500
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, y + 2, qrSize, qrSize - 4, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(16, 185, 129); // Emerald-500
    doc.text('PAID', margin + qrSize / 2, y + qrSize / 2 + 1, { align: 'center' });
    doc.setFontSize(6);
    doc.setTextColor(4, 120, 87); // Emerald-700
    doc.text('THANK YOU!', margin + qrSize / 2, y + qrSize / 2 + 6, { align: 'center' });
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
  if (!printWindow) {
    doc.save(`Invoice_${billData.invoiceNumber || 'BILL'}_${(billData.customer?.name || 'Customer').replace(/\s+/g, '_')}.pdf`);
    return;
  }
  const onLoad = () => {
    printWindow.removeEventListener('load', onLoad);
    setTimeout(() => {
      try { printWindow.print(); } catch (e) { /* ignore cross-origin errors */ }
    }, 500);
  };
  printWindow.addEventListener('load', onLoad);
}
