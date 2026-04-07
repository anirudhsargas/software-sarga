import { useState } from 'react';
import { sendOTP, verifyOTP } from '../services/firebase';
import toast from 'react-hot-toast';

export const useOTP = () => {
  const [step, setStep] = useState('idle'); // idle | sending | sent | verifying | verified | error
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);

  // Start countdown timer
  const startCountdown = (seconds = 30) => {
    setCountdown(seconds);
    // [REMOVED] interval polling for sync — now handled by syncWorker
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSendOTP = async (phoneNumber) => {
    if (!phoneNumber || phoneNumber.length !== 10) {
      setError('Enter valid 10-digit mobile number');
      return false;
    }

    setStep('sending');
    setError('');
    setPhone(phoneNumber);

    try {
      await sendOTP(phoneNumber);
      setStep('sent');
      startCountdown(30);
      toast.success(`OTP sent to +91 ${phoneNumber}`);
      return true;
    } catch (err) {
      setStep('error');
      const msg = err.code === 'auth/too-many-requests'
        ? 'Too many attempts. Try again later.'
        : err.code === 'auth/invalid-phone-number'
        ? 'Invalid phone number'
        : 'Failed to send OTP. Check your number.';
      setError(msg);
      toast.error(msg);
      return false;
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp || otp.length !== 6) {
      setError('Enter 6-digit OTP');
      return false;
    }

    setStep('verifying');
    setError('');

    try {
      const user = await verifyOTP(otp);
      setStep('verified');
      toast.success('Mobile verified successfully!');
      return user;
    } catch (err) {
      setStep('sent'); // Go back to OTP entry
      const msg = err.code === 'auth/invalid-verification-code'
        ? 'Wrong OTP. Please check and try again.'
        : err.code === 'auth/code-expired'
        ? 'OTP expired. Please request a new one.'
        : 'Verification failed. Try again.';
      setError(msg);
      toast.error(msg);
      return false;
    }
  };

  const reset = () => {
    setStep('idle');
    setPhone('');
    setOtp('');
    setError('');
    setCountdown(0);
  };

  return {
    step, phone, otp, setOtp,
    error, countdown,
    sendOTP: handleSendOTP,
    verifyOTP: handleVerifyOTP,
    reset,
    canResend: countdown === 0 && step === 'sent',
    isSending: step === 'sending',
    isVerifying: step === 'verifying',
    isVerified: step === 'verified',
    otpSent: step === 'sent' || step === 'verifying',
  };
};