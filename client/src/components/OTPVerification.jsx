import { useRef, useEffect } from 'react';
import { Phone, Shield, RefreshCw, CheckCircle2, Loader2 } from 'lucide-react';
import { useOTP } from '../hooks/useOTP';

const OTPVerification = ({
  onVerified,      // Called with Firebase user when verified
  phoneNumber,     // Pre-fill phone number
  autoSend = false // Auto send OTP on mount
}) => {
  const {
    step, phone, otp, setOtp, error, countdown,
    sendOTP, verifyOTP, reset,
    canResend, isSending, isVerifying, isVerified, otpSent
  } = useOTP();

  // OTP input refs for auto-focus
  const otpRefs = useRef([]);

  // Auto send if phoneNumber provided
  useEffect(() => {
    if (autoSend && phoneNumber) {
      sendOTP(phoneNumber);
    }
  }, []);

  // Handle OTP digit input
  const handleOtpInput = (index, value) => {
    const digits = otp.split('');
    digits[index] = value.slice(-1); // Only last char
    const newOtp = digits.join('');
    setOtp(newOtp);

    // Auto focus next input
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  // Handle backspace
  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  // Auto verify when all 6 digits entered
  useEffect(() => {
    if (otp.length === 6 && otpSent) {
      handleVerify();
    }
  }, [otp]);

  const handleVerify = async () => {
    const user = await verifyOTP();
    if (user && onVerified) {
      onVerified(user);
    }
  };

  if (isVerified) {
    return (
      <div className="otp-success">
        <CheckCircle2 size={48} color="#10b981" />
        <h3>Mobile Verified!</h3>
        <p>{phone || phoneNumber} verified successfully</p>
      </div>
    );
  }

  return (
    <div className="otp-container">
      {/* Invisible reCAPTCHA container */}
      <div id="recaptcha-container" />

      {!otpSent ? (
        /* Phone number entry */
        <div className="otp-phone-step">
          <div className="otp-icon">
            <Phone size={32} />
          </div>
          <h3 className="otp-title">Verify Mobile Number</h3>
          <p className="otp-subtitle">
            We'll send a 6-digit OTP to your mobile
          </p>

          <div className="otp-phone-input">
            <input
              type="tel"
              className="input-field"
              placeholder="Enter mobile (include +country code for non-IN)"
              defaultValue={phoneNumber}
              id="otp-phone"
              inputMode="tel"
            />
          </div>

          {error && <p className="otp-error">{error}</p>}

          <button
            className="btn btn-primary btn--full"
            onClick={() => {
              const phone = document.getElementById('otp-phone').value;
              sendOTP(phone);
            }}
            disabled={isSending}
          >
            {isSending ? (
              <><Loader2 size={16} className="spin" /> Sending OTP...</>
            ) : (
              <><Shield size={16} /> Send OTP</>
            )}
          </button>
        </div>
      ) : (
        /* OTP entry */
        <div className="otp-verify-step">
          <div className="otp-icon">
            <Shield size={32} />
          </div>
          <h3 className="otp-title">Enter OTP</h3>
          <p className="otp-subtitle">
            Sent to {phone || phoneNumber}
          </p>

          {/* 6 digit OTP boxes */}
          <div className="otp-boxes">
            {[0,1,2,3,4,5].map(i => (
              <input
                key={i}
                ref={el => otpRefs.current[i] = el}
                type="tel"
                inputMode="numeric"
                maxLength={1}
                className="otp-box"
                value={otp[i] || ''}
                onChange={e => handleOtpInput(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                autoFocus={i === 0}
              />
            ))}
          </div>

          {error && <p className="otp-error">{error}</p>}

          <button
            className="btn btn-primary btn--full"
            onClick={handleVerify}
            disabled={otp.length !== 6 || isVerifying}
          >
            {isVerifying ? (
              <><Loader2 size={16} className="spin" /> Verifying...</>
            ) : (
              <><CheckCircle2 size={16} /> Verify OTP</>
            )}
          </button>

          {/* Resend */}
          <div className="otp-resend">
            {countdown > 0 ? (
              <span className="otp-countdown">
                Resend OTP in {countdown}s
              </span>
            ) : (
              <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => sendOTP(phoneNumber)}
                >
                  <RefreshCw size={14} /> Resend OTP
                </button>
            )}
          </div>

          <button
            className="btn btn-ghost btn-sm"
            onClick={reset}
          >
            ← Change Number
          </button>
        </div>
      )}
    </div>
  );
};

export default OTPVerification;
