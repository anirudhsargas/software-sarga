// Pluggable SMS sender for one-time codes.
//
// Configure in server/.env:
//   SMS_PROVIDER=msg91      MSG91_AUTH_KEY=...   MSG91_OTP_TEMPLATE_ID=...   (DLT-approved OTP template)
//   SMS_PROVIDER=fast2sms   FAST2SMS_API_KEY=...
//   SMS_PROVIDER=console    (development only: prints the code in the server log, never sends)
// With no SMS_PROVIDER set, SMS is reported as "not configured" and callers should offer email instead.
//
// NOTE: provider request formats follow their public OTP APIs; test with real keys before going live.
const axios = require('axios');

const provider = () => String(process.env.SMS_PROVIDER || '').trim().toLowerCase();

function isSmsConfigured() {
    switch (provider()) {
        case 'msg91':
            return !!(process.env.MSG91_AUTH_KEY && process.env.MSG91_OTP_TEMPLATE_ID);
        case 'fast2sms':
            return !!process.env.FAST2SMS_API_KEY;
        case 'console':
            return process.env.NODE_ENV !== 'production';
        default:
            return false;
    }
}

/**
 * Send a numeric one-time code to an Indian 10-digit mobile number.
 * Throws if SMS is not configured or the provider rejects the request.
 */
async function sendOtpSms(mobile10, otp) {
    const mobile = String(mobile10 || '').replace(/\D/g, '').slice(-10);
    if (mobile.length !== 10) throw new Error('Invalid mobile number');
    if (!isSmsConfigured()) throw new Error('SMS is not configured');

    switch (provider()) {
        case 'msg91': {
            await axios.post('https://control.msg91.com/api/v5/otp', null, {
                params: {
                    template_id: process.env.MSG91_OTP_TEMPLATE_ID,
                    mobile: `91${mobile}`,
                    otp,
                },
                headers: { authkey: process.env.MSG91_AUTH_KEY },
                timeout: 10000,
            });
            return;
        }
        case 'fast2sms': {
            const res = await axios.post('https://www.fast2sms.com/dev/bulkV2',
                { route: 'otp', variables_values: otp, numbers: mobile },
                { headers: { authorization: process.env.FAST2SMS_API_KEY }, timeout: 10000 }
            );
            if (res.data && res.data.return === false) {
                throw new Error(`Fast2SMS rejected the request: ${JSON.stringify(res.data.message || res.data)}`);
            }
            return;
        }
        case 'console': {
            console.log(`[SMS:console] OTP for ******${mobile.slice(-4)}: ${otp}`);
            return;
        }
        default:
            throw new Error('SMS is not configured');
    }
}

module.exports = { isSmsConfigured, sendOtpSms };
