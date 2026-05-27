const rateLimit = require('express-rate-limit');

// UUID v4 regex
const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuidGuard(req, res, next) {
  const uuid = req.headers['x-sarga-uuid'];
  if (!uuid) return res.status(403).json({ error: 'Missing X-Sarga-UUID header' });
  if (!uuidV4Regex.test(uuid)) return res.status(403).json({ error: 'Invalid X-Sarga-UUID format' });
  req.userUuid = uuid;
  next();
}

const websiteApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again later.' }
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many chat requests. Slow down.' }
});

const inquiryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many inquiries submitted. Please try again later.' }
});

module.exports = { uuidGuard, websiteApiLimiter, chatLimiter, inquiryLimiter };
