import { formatCurrencyDecimal } from './formatters';
const fmtCurrency = (v) => formatCurrencyDecimal(v, 2);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

import { normalizeToE164, e164ToWhatsAppDigits } from './phone';

function formatPhone(mobile) {
  if (!mobile) return '';
  const e164 = normalizeToE164(mobile);
  if (!e164) return '';
  // wa.me expects numbers without the leading +
  return e164ToWhatsAppDigits(e164);
}

export function whatsappUrl(mobile, message) {
  const phone = formatPhone(mobile);
  if (!phone) return '';
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function workStatusMessage({ customerName, jobNumber, jobName, status, deliveryDate }) {
  const lines = [
    `Dear ${customerName || 'Customer'},`,
    '',
    `Your order *${jobNumber || ''}* — _${jobName || ''}_`,
    `Current Status: *${status || 'Processing'}*`,
  ];
  if (deliveryDate) lines.push(`Expected Delivery: *${fmtDate(deliveryDate)}*`);
  lines.push('', 'Thank you for choosing Sarga! 🙏');
  return lines.join('\n');
}

export function paymentReminderMessage({ customerName, jobNumber, jobName, totalAmount, balance, dueDate }) {
  const lines = [
    `Dear ${customerName || 'Customer'},`,
    '',
    `This is a gentle reminder regarding your pending payment:`,
    '',
    `Order: *${jobNumber || ''}* — _${jobName || ''}_`,
    `Total Amount: *${fmtCurrency(totalAmount)}*`,
    `Balance Due: *${fmtCurrency(balance)}*`,
  ];
  if (dueDate) lines.push(`Due Date: *${fmtDate(dueDate)}*`);
  lines.push('', 'Kindly arrange the payment at your earliest convenience.', '', 'Thank you! 🙏');
  return lines.join('\n');
}

export function orderReadyMessage({ customerName, jobNumber, jobName }) {
  return [
    `Dear ${customerName || 'Customer'},`,
    '',
    `Your order *${jobNumber || ''}* — _${jobName || ''}_ is now *Ready for Delivery*! 🎉`,
    '',
    'Please visit our store to collect your order.',
    '',
    'Thank you for choosing Sarga! 🙏',
  ].join('\n');
}

export function dueCollectionMessage({ customerName, totalDue, jobCount }) {
  return [
    `Dear ${customerName || 'Customer'},`,
    '',
    `You have *${fmtCurrency(totalDue)}* outstanding across *${jobCount || 1}* order(s).`,
    '',
    'Kindly arrange the payment at your earliest convenience.',
    '',
    'Thank you! 🙏',
  ].join('\n');
}

export function invoiceTextMessage({ customerName, invoiceNumber, orderLines, totals, payment, jobs }) {
  const totalAmount = Number(totals?.gross || 0);
  const paidAmount = Number(payment?.advancePaid || payment?.paid || 0);
  const balanceDue = Math.max(totalAmount - paidAmount, 0);

  const lines = [
    `Dear ${customerName || 'Customer'},`,
    '',
    `Here is your invoice from *Sarga Digital Press*:`,
    '',
    `*Invoice:* ${invoiceNumber || '—'}`,
    `*Total Amount:* ${fmtCurrency(totalAmount)}`,
    `*Paid Amount:* ${fmtCurrency(paidAmount)}`,
    `*Balance Due:* ${balanceDue > 0 ? fmtCurrency(balanceDue) : '₹0.00 ✓'}`,
    '',
    '*Items:*',
  ];

  if (orderLines && orderLines.length > 0) {
    orderLines.forEach((line) => {
      const name = line.product_name || line.name || 'Item';
      const qty = Number(line.quantity) || 1;
      const amt = Number(line.total_amount || 0);
      lines.push(`• ${name} (x${qty}) — ${fmtCurrency(amt)}`);
    });
  }

  if (jobs && jobs.length > 0) {
    const jobNums = jobs.map(j => j.job_number).filter(Boolean);
    if (jobNums.length > 0) {
      lines.push('', `*Job(s):* ${jobNums.join(', ')}`);
    }
  }

  if (payment?.methods) {
    lines.push('', `*Payment Method:* ${payment.methods}`);
  }

  if (balanceDue > 0) {
    lines.push('', 'Kindly clear the balance at your earliest convenience.');
  }

  lines.push('', 'Thank you for choosing Sarga! 🙏');
  return lines.join('\n');
}
