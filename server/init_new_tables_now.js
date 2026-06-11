const { initDb } = require('./database');
const logger = require('./helpers/logger');

(async () => {
  try {
    logger.info('Running database table initialization script...');
    await initDb();
    logger.info('Successfully verified/created all database tables!');
    process.exit(0);
  } catch (error) {
    logger.error('Failed to run database table initialization script:', error);
    process.exit(1);
  }
})();
