const { pool } = require('./database');
const { sendEmail } = require('./utils/mailer');

async function test() {
  try {
    console.log('Fetching sample payment/invoice from database...');
    const [[payment]] = await pool.query(
      `SELECT cp.*, c.email AS customer_email_db, c.name AS customer_name
       FROM sarga_customer_payments cp
       LEFT JOIN sarga_customers c ON c.id = cp.customer_id
       ORDER BY cp.id DESC LIMIT 1`
    );

    if (!payment) {
      console.log('No payment records found in database. Using mock payment details.');
    }

    const customerName = payment ? payment.customer_name : 'Anirudh';
    const invNum = payment ? `INV-${payment.id}` : 'INV-SAMPLE-101';
    const invAmount = payment ? Number(payment.total_amount || 0) : 1250;
    const formattedDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const targetEmail = 'anirudhsargas@gmail.com';

    console.log(`Preparing sample email to: ${targetEmail}`);
    console.log(`Invoice Number: ${invNum}`);
    console.log(`Amount: Rs. ${invAmount}`);

    const companyName = 'Sarga Printing';
    const footerText = 'Thank you for your business!';
    const invoiceSubject = `Sample Invoice #${invNum} from ${companyName}`;
    const invoiceMessage = `Dear ${customerName},\n\nPlease find your sample invoice details below.\n\nInvoice #: ${invNum}\nAmount: ₹${invAmount.toLocaleString('en-IN')}\nDate: ${formattedDate}\n\n${footerText}\n\n${companyName}`;

    const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; padding: 20px; background: #1a1a2e; color: white; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">${companyName}</h1>
            <p style="margin: 4px 0 0; opacity: 0.8;">Sample Invoice #${invNum}</p>
        </div>
        <div style="padding: 20px; border: 1px solid #eee; border-top: none;">
            <p>Dear <strong>${customerName}</strong>,</p>
            <p>Please find your sample invoice details below.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <tr style="background: #f5f5f5;"><td style="padding: 10px; border: 1px solid #ddd;"><strong>Invoice #</strong></td><td style="padding: 10px; border: 1px solid #ddd;">${invNum}</td></tr>
                <tr><td style="padding: 10px; border: 1px solid #ddd;"><strong>Date</strong></td><td style="padding: 10px; border: 1px solid #ddd;">${formattedDate}</td></tr>
                <tr style="background: #f5f5f5;"><td style="padding: 10px; border: 1px solid #ddd;"><strong>Amount</strong></td><td style="padding: 10px; border: 1px solid #ddd;">₹${invAmount.toLocaleString('en-IN')}</td></tr>
                <tr><td style="padding: 10px; border: 1px solid #ddd;"><strong>Status</strong></td><td style="padding: 10px; border: 1px solid #ddd;">Paid</td></tr>
            </table>
            <p style="color: #666; font-size: 13px;">${footerText}</p>
        </div>
        
        <!-- Thin divider line above the footer -->
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0 20px 0;" />

        <!-- Sarga Printing Premium Footer -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="font-family: Arial, sans-serif; color: #333333; line-height: 1.5; font-size: 13px; margin-top: 10px;">
            <tr>
                <td style="padding-bottom: 15px;">
                    <table border="0" cellpadding="0" cellspacing="0">
                        <tr>
                            <td valign="middle" style="padding-right: 12px;">
                                <img src="https://software-sarga.vercel.app/logo.png" width="48" height="48" alt="Sarga Printing Logo" style="display: block; width: 48px; height: 48px; border: 0; border-radius: 6px;" />
                            </td>
                            <td valign="middle">
                                <div style="font-size: 16px; font-weight: bold; color: #1a1a1a; letter-spacing: 0.5px; text-transform: uppercase;">SARGA PRINTING</div>
                                <div style="font-size: 11px; color: #718096; margin-top: 2px; text-transform: uppercase; letter-spacing: 1px;">Printing &bull; Designing &bull; Finishing</div>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
            <tr>
                <td>
                    <table align="left" border="0" cellpadding="0" cellspacing="0" width="270" style="width: 100%; max-width: 270px; margin-bottom: 15px;">
                        <tr>
                            <td style="padding-right: 15px;">
                                <div style="font-weight: bold; font-size: 12px; color: #2d3748; letter-spacing: 0.5px; border-left: 2px solid #4a5568; padding-left: 8px; margin-bottom: 6px;">PERAMBRA</div>
                                <table border="0" cellpadding="0" cellspacing="0" style="font-size: 13px; color: #4a5568;">
                                    <tr>
                                        <td style="padding-bottom: 4px; padding-left: 8px;">
                                            <span style="margin-right: 4px;">📞</span> 
                                            <a href="tel:9495177284" style="color: #2b6cb0; text-decoration: none; font-weight: 500;">9495177284</a>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding-left: 8px;">
                                            <span style="margin-right: 4px;">✉️</span> 
                                            <a href="mailto:sargapba@gmail.com" style="color: #2b6cb0; text-decoration: none;">sargapba@gmail.com</a>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                    <table align="left" border="0" cellpadding="0" cellspacing="0" width="270" style="width: 100%; max-width: 270px; margin-bottom: 15px;">
                        <tr>
                            <td>
                                <div style="font-weight: bold; font-size: 12px; color: #2d3748; letter-spacing: 0.5px; border-left: 2px solid #4a5568; padding-left: 8px; margin-bottom: 6px;">MEPPAYUR</div>
                                <table border="0" cellpadding="0" cellspacing="0" style="font-size: 13px; color: #4a5568;">
                                    <tr>
                                        <td style="padding-bottom: 4px; padding-left: 8px;">
                                            <span style="margin-right: 4px;">📞</span> 
                                            <a href="tel:9188331197" style="color: #2b6cb0; text-decoration: none; font-weight: 500;">9188331197</a>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding-left: 8px;">
                                            <span style="margin-right: 4px;">✉️</span> 
                                            <a href="mailto:sargaoffssetmpr@gmail.com" style="color: #2b6cb0; text-decoration: none;">sargaoffssetmpr@gmail.com</a>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </div>`;

    console.log('Sending email...');
    await sendEmail({
      to: targetEmail,
      from: `"${companyName}" <${process.env.EMAIL_FROM || 'sargadailyreport@gmail.com'}>`,
      subject: invoiceSubject,
      text: invoiceMessage,
      html: htmlBody
    });

    console.log('Email sent successfully to anirudhsargas@gmail.com!');
    process.exit(0);
  } catch (err) {
    console.error('Failed to send email:', err);
    process.exit(1);
  }
}
test();
