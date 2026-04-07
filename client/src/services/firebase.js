import { initializeApp } from 'firebase/app';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Setup invisible reCAPTCHA
export const setupRecaptcha = (elementId) => {
  if (window.recaptchaVerifier) {
    window.recaptchaVerifier.clear();
  }
  window.recaptchaVerifier = new RecaptchaVerifier(
    auth,
    elementId,
    {
      size: 'invisible',
      callback: () => {},
      'expired-callback': () => {
        window.recaptchaVerifier = null;
      }
    }
  );
  return window.recaptchaVerifier;
};

// Send OTP to phone number
export const sendOTP = async (phoneNumber) => {
  // phoneNumber must be in format: +919876543210
  const formattedPhone = phoneNumber.startsWith('+91')
    ? phoneNumber
    : `+91${phoneNumber}`;

  const recaptcha = setupRecaptcha('recaptcha-container');
  const confirmation = await signInWithPhoneNumber(auth, formattedPhone, recaptcha);
  window.confirmationResult = confirmation;
  return confirmation;
};

// Verify OTP entered by user
export const verifyOTP = async (otp) => {
  if (!window.confirmationResult) {
    throw new Error('No OTP sent. Please request OTP first.');
  }
  const result = await window.confirmationResult.confirm(otp);
  return result.user;
};

// Sign out from Firebase
export const firebaseSignOut = async () => {
  await auth.signOut();
  window.confirmationResult = null;
};