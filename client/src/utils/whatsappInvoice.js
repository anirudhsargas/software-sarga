import { formatCurrencyDecimal } from './formatters';

const fmt = (v) => formatCurrencyDecimal(v, 2);

const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  : '';

const DIVIDER = '━'.repeat(22);

export function generateWhatsAppInvoiceMessage(invoice) {
  const {
    invoiceNo, date, customerName, customerMobile,
    items = [],
    subtotal, discount, gst, total,
    paymentStatus = 'PENDING',
    amountPaid = 0, balanceDue = 0,
    paymentMethod = 'UPI',
    upiId, branchUpiId, upi_id,
  } = invoice;

  const numSubtotal = Number(subtotal) || 0;
  const numDiscount = Number(discount) || 0;
  const numGst = Number(gst) || 0;
  const numTotal = Number(total) || 0;
  const numPaid = Number(amountPaid) || 0;
  const numBalance = Number(balanceDue) > 0 ? Number(balanceDue) : Math.max(numTotal - numPaid, 0);

  const targetUpiId = upiId || branchUpiId || upi_id || '9495177283@upi';

  const lines = [];

  lines.push('🧾 *SARGA OFFSET*');
  lines.push(`Invoice No : ${invoiceNo || '—'}`);
  lines.push(`Date       : ${fmtDate(date)}`);
  lines.push(`Customer   : ${customerName || '—'}`);
  lines.push(`Mobile     : ${customerMobile || '—'}`);
  lines.push(DIVIDER);
  lines.push('📦 ITEMS');
  lines.push(DIVIDER);

  if (items.length > 0) {
    items.forEach((item) => {
      lines.push(`• ${item.name || 'Item'}`);
      lines.push(`  Qty : ${Number(item.qty) || 1} × ${fmt(item.rate)} = ${fmt(item.amount)}`);
    });
  }

  lines.push(DIVIDER);
  lines.push(`Subtotal : ${fmt(numSubtotal)}`);
  if (numDiscount > 0) {
    lines.push(`Discount : ${fmt(numDiscount)}`);
  }
  if (numGst > 0) {
    lines.push(`GST      : ${fmt(numGst)}`);
  }
  lines.push(DIVIDER);
  lines.push(`💰 TOTAL : ${fmt(numTotal)}`);
  lines.push(DIVIDER);

  const isPaid = paymentStatus === 'PAID' || (numBalance <= 0 && numPaid >= numTotal && numTotal > 0);
  const dueAmountToPay = isPaid ? 0 : (numBalance > 0 ? numBalance : numTotal);

  if (isPaid) {
    lines.push(`✅ *PAID* via ${paymentMethod}`);
    lines.push('Thank you for choosing *Sarga Offset*! 🙏');
  } else if (numPaid > 0) {
    lines.push(`✅ Paid       : ${fmt(numPaid)}`);
    lines.push(`⏳ Balance Due : ${fmt(numBalance)}`);
  } else {
    lines.push('⏳ *PAYMENT PENDING*');
    lines.push(`Amount Due : ${fmt(numTotal)}`);
  }

  if (dueAmountToPay > 0) {
    lines.push('');
    lines.push('Kindly clear the balance at your earliest convenience.');
    if (targetUpiId) {
      const upiPayUrl = `upi://pay?pa=${encodeURIComponent(targetUpiId)}&pn=${encodeURIComponent('SARGA OFFSET')}&am=${dueAmountToPay.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Invoice ${invoiceNo || ''}`.trim())}`;
      lines.push('');
      lines.push('📲 *Click link below to pay using any UPI App (GPay / PhonePe / Paytm / BHIM):*');
      lines.push(upiPayUrl);
    }
  }

  lines.push('');
  lines.push('📍 Perambra | Meppayur');
  lines.push('📞 9495177283 | 9188331197');

  return lines.join('\n');
}

export function getWhatsAppShareLink(invoice) {
  const message = generateWhatsAppInvoiceMessage(invoice);
  const encoded = encodeURIComponent(message);
  const digits = String(invoice.customerMobile || '').replace(/\D/g, '');
  const phone = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${phone}?text=${encoded}`;
}
