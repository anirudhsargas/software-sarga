// Fallback logger using console as winston is missing
const logLevel = process.env.LOG_LEVEL || 'info';
const isDevelopment = process.env.NODE_ENV !== 'production';

const logger = {
  info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
  debug: (msg, ...args) => {
    if (logLevel === 'debug') console.log(`[DEBUG] ${msg}`, ...args);
  },
  // Add more methods if needed to match winston interface
  log: (level, msg, ...args) => console.log(`[${level.toUpperCase()}] ${msg}`, ...args),
};

module.exports = logger;

