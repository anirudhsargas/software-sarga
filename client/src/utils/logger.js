const isProduction = import.meta.env.PROD;

export const logger = {
  log: (...args) => {
    if (!isProduction) {
      console.log(...args);
    }
  },
  debug: (...args) => {
    if (!isProduction) {
      console.debug(...args);
    }
  },
  info: (...args) => {
    if (!isProduction) {
      console.info(...args);
    }
  },
  warn: (...args) => {
    if (!isProduction) {
      console.warn(...args);
    }
  },
  error: (...args) => {
    // Keep printing errors in production but format them nicely if needed
    console.error(...args);
  }
};

export default logger;
