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
  } = invoice;

  const numSubtotal = Number(subtotal) || 0;
  const numDiscount = Number(discount) || 0;
  const numGst = Number(gst) || 0;
  const numTotal = Number(total) || 0;

  const lines = [];

  lines.push('🧾 *SARGA PRINTING*');
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

  switch (paymentStatus) {
    case 'PAID':
      lines.push('✅ *PAID* via UPI');
      lines.push('Thank you for choosing *Sarga Printing*');
      break;
    case 'PARTIAL':
      lines.push(`✅ Paid       : ${fmt(Number(amountPaid) || 0)}`);
      lines.push(`⏳ Balance Due : ${fmt(Number(balanceDue) || 0)}`);
      break;
    case 'PENDING':
    default:
      lines.push('⏳ *PAYMENT PENDING*');
      lines.push(`Amount Due : ${fmt(numTotal)}`);
      lines.push('Please pay via UPI/Cash at pickup');
      break;
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
