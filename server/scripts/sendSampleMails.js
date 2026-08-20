require('dotenv').config({ path: 'D:/software sarga/server/.env' });
const { sendEmail } = require('../utils/mailer');

async function sendSampleMails() {
  const targetEmail = 'anirudhsargas@gmail.com';
  console.log('Sending sample emails to:', targetEmail);

  // 1. Sample Invoice Email
  try {
    const invRes = await sendEmail({
      to: targetEmail,
      subject: 'Sample Invoice #INV-25138 from Sarga Offset',
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; padding: 20px; background: #1a1a2e; color: white; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">Sarga Offset</h1>
          <p style="margin: 4px 0 0; opacity: 0.8;">Tax Invoice #INV-25138</p>
        </div>
        <div style="padding: 20px; border: 1px solid #eee; border-top: none;">
          <p>Dear <strong>Anirudh SB</strong>,</p>
          <p>Thank you for choosing Sarga Offset. Please find your sample invoice details below:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr style="background: #f5f5f5;"><td style="padding: 10px; border: 1px solid #ddd;"><strong>Invoice #</strong></td><td style="padding: 10px; border: 1px solid #ddd;">INV-25138</td></tr>
            <tr><td style="padding: 10px; border: 1px solid #ddd;"><strong>Date</strong></td><td style="padding: 10px; border: 1px solid #ddd;">2026-08-20</td></tr>
            <tr style="background: #f5f5f5;"><td style="padding: 10px; border: 1px solid #ddd;"><strong>Items</strong></td><td style="padding: 10px; border: 1px solid #ddd;">Multi-Color Visiting Cards (1,000 Qty) + Brochure Printing</td></tr>
            <tr><td style="padding: 10px; border: 1px solid #ddd;"><strong>Total Amount</strong></td><td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">₹12,500.00</td></tr>
            <tr style="background: #e8f5e9;"><td style="padding: 10px; border: 1px solid #ddd;"><strong>Payment Status</strong></td><td style="padding: 10px; border: 1px solid #ddd; color: #2e7d32; font-weight: bold;">PAID</td></tr>
          </table>
          <p style="color: #666; font-size: 13px;">Thank you for your business!</p>
        </div>
        <div style="text-align: center; padding: 12px; background: #f5f5f5; border-radius: 0 0 8px 8px; font-size: 12px; color: #999;">
          Sarga Offset | Phone: +91 9747933341 | Email: sargapba@gmail.com
        </div>
      </div>`
    });
    console.log('✓ 1. Sample Invoice Email sent! MessageID:', invRes.messageId);
  } catch (err) {
    console.error('✗ 1. Sample Invoice Email error:', err.message);
  }

  // 2. Sample Daily Report Email
  try {
    const dailyRes = await sendEmail({
      to: targetEmail,
      subject: 'Daily Cash Book Report – 2026-08-20 (Perambra Branch)',
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <div style="background: #4f46e5; color: white; padding: 16px 20px; border-radius: 6px 6px 0 0;">
          <h2 style="margin: 0; font-size: 20px;">Daily Cash Book Summary</h2>
          <p style="margin: 4px 0 0; opacity: 0.9; font-size: 13px;">Branch: Perambra | Date: 2026-08-20</p>
        </div>
        <div style="padding: 20px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="background: #f8fafc;"><td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">Opening Balance</td><td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold; text-align: right;">₹15,000.00</td></tr>
            <tr><td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">Total Sales Collection</td><td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold; text-align: right; color: #16a34a;">+₹48,250.00</td></tr>
            <tr style="background: #f8fafc;"><td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">UPI / Online Collections</td><td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold; text-align: right;">₹32,100.00</td></tr>
            <tr><td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">Daily Expenses Paid</td><td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold; text-align: right; color: #dc2626;">-₹6,400.00</td></tr>
            <tr style="background: #eef2ff;"><td style="padding: 12px; font-weight: bold;">Net Cash Closing Balance</td><td style="padding: 12px; font-weight: bold; text-align: right; color: #4f46e5; font-size: 16px;">₹24,750.00</td></tr>
          </table>
          <p style="margin-top: 20px; font-size: 12px; color: #64748b;">Generated automatically by Sarga Offset ERP System.</p>
        </div>
      </div>`
    });
    console.log('✓ 2. Sample Daily Report Email sent! MessageID:', dailyRes.messageId);
  } catch (err) {
    console.error('✗ 2. Sample Daily Report Email error:', err.message);
  }

  // 3. Sample Quotation Email
  try {
    const quoteRes = await sendEmail({
      to: targetEmail,
      subject: 'Quotation #Q-2026-042 from Sarga Offset',
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #0f172a; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
          <h2 style="margin: 0;">Sarga Offset</h2>
          <p style="margin: 4px 0 0; opacity: 0.8;">Quotation #Q-2026-042</p>
        </div>
        <div style="padding: 20px; border: 1px solid #eee; border-top: none;">
          <p>Dear <strong>Anirudh SB</strong>,</p>
          <p>Please review your requested quotation details below:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr style="background: #f5f5f5;"><td style="padding: 10px; border: 1px solid #ddd;"><strong>Quote #</strong></td><td style="padding: 10px; border: 1px solid #ddd;">Q-2026-042</td></tr>
            <tr><td style="padding: 10px; border: 1px solid #ddd;"><strong>Date</strong></td><td style="padding: 10px; border: 1px solid #ddd;">2026-08-20</td></tr>
            <tr style="background: #f5f5f5;"><td style="padding: 10px; border: 1px solid #ddd;"><strong>Valid Until</strong></td><td style="padding: 10px; border: 1px solid #ddd;">2026-09-04</td></tr>
            <tr><td style="padding: 10px; border: 1px solid #ddd;"><strong>Description</strong></td><td style="padding: 10px; border: 1px solid #ddd;">500 Nos Hardbound Wedding Invitation Books with Gold Foil Stamping</td></tr>
            <tr style="background: #e8f5e9;"><td style="padding: 10px; border: 1px solid #ddd;"><strong>Quoted Amount</strong></td><td style="padding: 10px; border: 1px solid #ddd; font-size: 16px; font-weight: bold;">₹35,000.00</td></tr>
          </table>
          <p style="color: #666; font-size: 13px;">Please feel free to reply to this email or call us if you have any questions.</p>
        </div>
      </div>`
    });
    console.log('✓ 3. Sample Quotation Email sent! MessageID:', quoteRes.messageId);
  } catch (err) {
    console.error('✗ 3. Sample Quotation Email error:', err.message);
  }

  process.exit(0);
}

sendSampleMails();
