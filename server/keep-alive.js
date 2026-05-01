const cron = require('node-cron');
const axios = require('axios');
require('dotenv').config();

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:5000';
const HEALTH_CHECK_ENDPOINT = '/api/ping';
const KEEP_ALIVE_INTERVAL_MINUTES = 14; // Request every 14 minutes to prevent 15-minute timeout

let lastRequestTime = Date.now();

/**
 * Make a request to keep the server alive
 */
async function keepAlive() {
  try {
    const response = await axios.get(`${SERVER_URL}${HEALTH_CHECK_ENDPOINT}`, {
      timeout: 10000
    });
    lastRequestTime = Date.now();
    console.log(`[${new Date().toISOString()}] Keep-alive request successful:`, response.status);
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error(`[${new Date().toISOString()}] Keep-alive request failed: Connection refused. Is the server running at ${SERVER_URL}?`);
    } else if (error.code === 'ENOTFOUND') {
      console.error(`[${new Date().toISOString()}] Keep-alive request failed: Host not found. Check SERVER_URL in .env`);
    } else {
      console.error(`[${new Date().toISOString()}] Keep-alive request failed:`, error.message);
    }
  }
}

/**
 * Check if 14 minutes have passed without activity
 */
function checkInactivity() {
  const timeSinceLastRequest = Date.now() - lastRequestTime;
  const threshold = KEEP_ALIVE_INTERVAL_MINUTES * 60 * 1000;
  
  if (timeSinceLastRequest >= threshold) {
    console.log(`[${new Date().toISOString()}] No activity for ${KEEP_ALIVE_INTERVAL_MINUTES} minutes. Sending keep-alive request...`);
    keepAlive();
  }
}

/**
 * Schedule 8:45 AM keep-alive request
 */
cron.schedule('45 8 * * *', () => {
  console.log(`[${new Date().toISOString()}] Scheduled 8:45 AM keep-alive request`);
  keepAlive();
}, {
  timezone: 'Asia/Kolkata' // Adjust timezone as needed
});

/**
 * Check inactivity every minute
 */
cron.schedule('* * * * *', () => {
  checkInactivity();
});

console.log(`[${new Date().toISOString()}] Keep-alive service started`);
console.log(`[${new Date().toISOString()}] Monitoring server: ${SERVER_URL}`);
console.log(`[${new Date().toISOString()}] Will send request if no activity for ${KEEP_ALIVE_INTERVAL_MINUTES} minutes`);
console.log(`[${new Date().toISOString()}] Scheduled daily request at 8:45 AM`);

// Initial request on startup
keepAlive();
