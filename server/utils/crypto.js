const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const SECRET_KEY = process.env.ENCRYPTION_KEY || crypto.scryptSync(process.env.JWT_SECRET || 'sarga-fallback-secret-key-2026', 'sarga-cctv-salt', 32);

/**
 * Encrypt a plain text string.
 * Output format: "iv_hex:ciphertext_hex"
 */
function encrypt(text) {
  if (!text) return text;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt an encrypted string (iv_hex:ciphertext_hex).
 * If text is not in encrypted format (e.g. legacy plaintext), returns text as-is.
 */
function decrypt(text) {
  if (!text || typeof text !== 'string') return text;
  const parts = text.split(':');
  if (parts.length !== 2 || parts[0].length !== 32) {
    // Legacy plaintext password or invalid format
    return text;
  }
  try {
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[Crypto] Decryption failed, returning raw text:', err.message);
    return text;
  }
}

module.exports = {
  encrypt,
  decrypt
};
