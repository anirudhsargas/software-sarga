/**
 * Test Express app factory.
 *
 * Creates a minimal Express instance with body-parsing, no rate-limiting,
 * no caching, and no server startup.  Routes are loaded in the same order
 * as the production `index.js`.
 *
 * The `pool` and `initDb` are auto-mocked via the `mock-pool.js` module,
 * so tests never touch the real production database unless TEST_DB_ env
 * vars are explicitly set.
 */

const express = require('express');

function createTestApp() {
  const app = express();

  // Minimal body parsing (no size limits for tests)
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Silence rate-limiters in tests
  const noopMiddleware = (req, res, next) => next();
  jest.spyOn(require('express-rate-limit'), 'default').mockReturnValue(noopMiddleware);
  jest.spyOn(require('helmet'), 'default').mockReturnValue(noopMiddleware);
  jest.spyOn(require('compression'), 'default').mockReturnValue(noopMiddleware);

  // Health check
  app.get('/api/health', async (req, res) => {
    const { pool } = require('../../database');
    let dbStatus = 'disconnected';
    try {
      const [rows] = await pool.query('SELECT 1 AS ok');
      dbStatus = rows?.[0]?.ok === 1 ? 'connected' : 'error';
    } catch (_e) {
      dbStatus = 'error';
    }
    res.status(dbStatus === 'connected' ? 200 : 503).json({
      status: dbStatus === 'connected' ? 'ok' : 'degraded',
      database: dbStatus,
      service: 'sarga-mis',
      time: new Date().toISOString(),
    });
  });

  // Upload helper (minimal)
  const multer = require('multer');
  const upload = multer({ storage: multer.memoryStorage() });

  // Mock the removeUploadFile helper used by some routes
  jest.mock('../../helpers/cloudinaryUpload', () => ({
    cloudinary: { api: { resource: jest.fn() } },
    getCloudinaryUrl: jest.fn(() => 'https://res.cloudinary.com/test/image.jpg'),
  }));

  // --------------- Route Modules ---------------
  app.use('/api', require('../../routes/auth')(upload));
  app.use('/api/chatbot', require('../../routes/chatbot'));
  app.use('/api', require('../../routes/branches'));
  app.use('/api', require('../../routes/payments'));
  app.use('/api', require('../../routes/vendors'));
  app.use('/api', require('../../routes/customerPayments'));
  app.use('/api', require('../../routes/customers'));
  app.use('/api', require('../../routes/customerDesigns'));
  app.use('/api', require('../../routes/requests'));
  app.use('/api/staff', require('../../routes/staff')(upload, () => {}));
  app.use('/api/staff', require('../../routes/staffDashboard'));
  app.use('/api', require('../../routes/staffPortal')(upload));
  app.use('/api', require('../../routes/designWorkspace')(upload));
  app.use('/api/schedules', require('../../routes/scheduleManagement'));
  app.use('/api', require('../../routes/jobs').router);
  app.use('/api', require('../../routes/products')(upload, () => {}));
  app.use('/api/paperInventory', require('../../routes/paperInventory'));
  app.use('/api', require('../../routes/consumablesInventory'));
  app.use('/api', require('../../routes/inventory'));
  app.use('/api', require('../../routes/frontOffice'));
  app.use('/api/quick-billing', require('../../routes/quickBilling'));
  app.use('/api', require('../../routes/expenses'));
  app.use('/api', require('../../routes/finance'));
  app.use('/api', require('../../routes/expenses-extended'));
  app.use('/api', require('../../routes/utilityEmail'));
  app.use('/api', require('../../routes/coupons'));
  app.use('/api/stock-verification', require('../../routes/stockVerification'));
  app.use('/api', require('../../routes/stockRequests'));
  app.use('/api/machines', require('../../routes/machines'));
  app.use('/api/internal-transfers', require('../../routes/internalTransfers'));
  app.use('/api/internal-transactions', require('../../routes/internalTransactions'));
  app.use('/api/admin/internal-books', require('../../routes/internalBooks'));
  app.use('/api/daily-reports', require('../../routes/dailyReports'));
  app.use('/api/daily-report', require('../../routes/dailyReportUnified'));
  app.use('/api', require('../../routes/backup'));
  app.use('/api/ai/monitoring', require('../../routes/aiMonitoring'));
  app.use('/api/ai', require('../../routes/aiSearch'));
  app.use('/api/ai', require('../../routes/designCheck'));
  app.use('/api/ai/paper-layout', require('../../routes/paperLayout'));
  app.use('/api', require('../../routes/search'));
  app.use('/api', require('../../routes/auditInvoice'));
  app.use('/api', require('../../routes/accounts'));
  app.use('/api/job-priority', require('../../routes/jobPriority'));
  app.use('/api/ai/sales-prediction', require('../../routes/salesPrediction'));
  app.use('/api/ai/order-predictions', require('../../routes/orderPredictions'));
  app.use('/api/production-tracker', require('../../routes/productionTracker'));
  app.use('/api', require('../../routes/upsell'));
  app.use('/api/ai', require('../../routes/anomalies'));
  app.use('/api/ai/forecast', require('../../routes/forecast'));
  app.use('/api/ai', require('../../routes/insights'));
  app.use('/api/ai', require('../../routes/seasonal'));
  app.use('/api/ai/stock-planning', require('../../routes/stockPlanning'));
  app.use('/api/ai/order-forecast', require('../../routes/orderForecast'));
  app.use('/api/ai', require('../../routes/aiUpsell'));
  app.use('/api/ai/turnaround', require('../../routes/aiTurnaround'));
  app.use('/api/ai/categorize-expense', require('../../routes/expenseCategorizer'));
  app.use('/api/cctv', require('../../routes/cctvAttendance'));
  app.use('/api/cctv', require('../../routes/cctvCameras')(upload, () => {}));
  app.use('/api', require('../../routes/quotes'));
  app.use('/api', require('../../routes/invoiceFeatures'));
  app.use('/api', require('../../routes/passwordReset'));
  app.use('/api', require('../../routes/websiteInquiries'));
  app.use('/api', require('../../routes/premiumFeatures')());
  app.use('/api/blog', require('../../routes/blog')(upload));
  app.use('/api', require('../../routes/portfolio'));
  app.use('/api', require('../../routes/promotions'));
  app.use('/api', require('../../routes/translations'));
  app.use('/api', require('../../routes/proofs'));
  app.use('/api', require('../../routes/artworkUploads'));
  app.use('/api', require('../../routes/pickupSlots'));
  app.use('/api', require('../../routes/deliveryEstimates'));
  app.use('/api', require('../../routes/websiteReviews'));
  app.use('/api', require('../../routes/whatsappAnalytics'));
  app.use('/api', require('../../routes/checkout'));
  app.use('/api', require('../../routes/businessHub'));
  app.use('/api', require('../../routes/preflight'));
  app.use('/api', require('../../routes/pricing'));
  app.use('/api/website', require('../../routes/website')(upload));
  app.use('/api/website', require('../../routes/websiteDesigns'));

  // Ping
  app.get('/api/ping', async (req, res) => {
    try {
      const { pool } = require('../../database');
      await pool.query('SELECT 1');
      res.json({ status: 'ok', db: 'connected', time: new Date().toISOString() });
    } catch (_err) {
      res.status(503).json({ status: 'error', db: 'disconnected', time: new Date().toISOString() });
    }
  });

  // Error handlers
  const notFound = require('../../middleware/notFound');
  const errorHandler = require('../../middleware/errorHandler');
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createTestApp };
