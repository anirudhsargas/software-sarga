const bootStartedAt = process.hrtime.bigint();
const bootElapsedMs = () => Number(process.hrtime.bigint() - bootStartedAt) / 1e6;
const bootLog = (message) => console.log(`[BOOT +${bootElapsedMs().toFixed(1)}ms] ${message}`);

bootLog(`Server process starting at ${new Date().toISOString()}`);
global.migrationsComplete = process.env.NODE_ENV === 'test';

// Polyfill browser APIs required by pdf-parse in Node.js environment
if (typeof globalThis.DOMMatrix === 'undefined') globalThis.DOMMatrix = class DOMMatrix { constructor() {} };
if (typeof globalThis.ImageData === 'undefined') globalThis.ImageData = class ImageData { constructor(w, h) { this.width = w; this.height = h; } };
if (typeof globalThis.Path2D === 'undefined') globalThis.Path2D = class Path2D { constructor() {} };

{
    const phaseStartedAt = process.hrtime.bigint();
    bootLog('dotenv load started');
    require('dotenv').config({ path: require('path').join(__dirname, '.env') });
    bootLog(`dotenv load completed in ${ (Number(process.hrtime.bigint() - phaseStartedAt) / 1e6).toFixed(1)}ms`);
}



const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
let initDb;
let pool;
{
    const phaseStartedAt = process.hrtime.bigint();
    bootLog('database module load started');
    const database = require('./database');
    initDb = database.initDb;
    pool = database.pool;
    bootLog(`database module load completed in ${(Number(process.hrtime.bigint() - phaseStartedAt) / 1e6).toFixed(1)}ms`);
}
const { getTodayDate } = require('./helpers');
const logger = require('./helpers/logger');
const verifyWithAnySecret = require('./middleware/auth').verifyWithAnySecret;
const { initSocket } = require('./services/socketManager');

// Express app and basic config
const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;



// Configure allowed CORS origins (normalize, remove trailing slashes, and deduplicate)
const allowedOrigins = [...new Set([
    'https://software-sarga-git-main-anirudhsargas-projects.vercel.app',
    'https://software-sarga.vercel.app',
    'https://sargaoffset.vercel.app',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    process.env.CLIENT_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    // Also include origins provided via CORS_ORIGIN (comma-separated)
    ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(o => o.trim()).filter(Boolean) : []),
].filter(Boolean).map(o => o.replace(/\/$/, '')))];

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_SECRET_PREVIOUS = process.env.JWT_SECRET_PREVIOUS; // eslint-disable-line no-unused-vars

if (!JWT_SECRET) {
    logger.error('FATAL: JWT_SECRET environment variable is not defined. Refusing to start.');
    process.exit(1);
}

// Startup env-var safety checks
const _dbUserCheck = process.env.DB_USER;
const _dbNameCheck = process.env.DB_NAME;
if (_dbUserCheck && !/^[A-Za-z0-9_-]+$/.test(_dbUserCheck)) {
    logger.error('FATAL: DB_USER contains unsafe characters. Refusing to start.');
    process.exit(1);
}
if (_dbNameCheck && !/^[A-Za-z0-9_-]+$/.test(_dbNameCheck)) {
    logger.error('FATAL: DB_NAME contains unsafe characters. Refusing to start.');
    process.exit(1);
}
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    logger.warn('[startup] RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET not set — payment routes will be disabled at runtime');
}
if (!process.env.GOOGLE_CLIENT_ID) {
    logger.warn('[startup] GOOGLE_CLIENT_ID not set — Google sign-in audience check is disabled');
}

if (!process.env.GOOGLE_SA_KEY && !process.env.GOOGLE_SERVICE_ACCOUNT && !process.env.GOOGLE_SERVICE_ACCOUNT_BASE64) {
    console.warn('[backup] WARNING: Google Service Account Key is not set (GOOGLE_SA_KEY, GOOGLE_SERVICE_ACCOUNT, or GOOGLE_SERVICE_ACCOUNT_BASE64)');
}
if (!process.env.GOOGLE_SHEET_ID) console.warn('[backup] WARNING: GOOGLE_SHEET_ID not set');

logger.info('[CORS] Configured origins:', allowedOrigins);

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);

        // Normalize incoming origin
        const normalizedOrigin = origin.replace(/\/$/, '');

        // Explicitly listed origins
        if (allowedOrigins.includes(normalizedOrigin)) {
            return callback(null, true);
        }

        // Accept Vercel preview/branch deployments for this project automatically
        // Matches: software-sarga-*.vercel.app and sargaoffset-*.vercel.app
        const vercelPreviewPatterns = [
            /^https:\/\/software-sarga(-[a-z0-9-]+)?\.vercel\.app$/i,
            /^https:\/\/sargaoffset(-[a-z0-9-]+)?\.vercel\.app$/i,
        ];
        if (vercelPreviewPatterns.some(rx => rx.test(normalizedOrigin))) {
            return callback(null, true);
        }

        logger.warn(`[CORS Blocked] Origin: ${origin}`);
        // Return callback(null, false) to deny access cleanly without throwing an error that bypasses CORS headers setting
        callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Idempotency-Key', 'ngrok-skip-browser-warning', 'x-sarga-uuid'],
    optionsSuccessStatus: 200 // Some legacy browsers (IE11) choke on 204
};

// ── CORS — MUST be the first middleware after trust-proxy ──
// Preflight (OPTIONS) requests must return 204 before any other
// middleware runs. Without this, Render's reverse-proxy may emit
// 520/502 on preflight timeouts or CORS-header absence.
app.use(cors(corsOptions));

// Catch-all OPTIONS handler — returns 204 immediately after CORS
// headers are attached by the cors middleware above.
app.use((req, res, next) => {
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// Health check endpoint (placed after CORS so cross-origin fetches work)
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        uptime: process.uptime()
    });
});

// Security headers
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow uploads to be served cross-origin
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:", "https:", "http:"], // Allow images from any secure or insecure source (needed for local IP access)
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            frameAncestors: ["'none'"],
            formAction: ["'self'"],
        }
    }
}));

// Response compression
app.use(compression());

// Body parsing with size limits (increased only for routes handling large base64 designs/images)
app.use('/api/website/designs', express.json({ limit: '50mb' }));
app.use('/api/website/designs', express.urlencoded({ extended: true, limit: '50mb' }));

// Default body parsing with safe 1mb limits to prevent OOM/DoS attacks
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Request diagnostics logger — logs method, URL, status code, response time, and memory usage
app.use((req, res, next) => {
    const start = Date.now();
    const memStart = process.memoryUsage();
    res.on('finish', () => {
        const duration = Date.now() - start;
        const memEnd = process.memoryUsage();
        const toMB = (bytes) => (bytes / 1024 / 1024).toFixed(2) + 'MB';
        logger.info(`[REQUEST] ${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms) | RSS: ${toMB(memStart.rss)}->${toMB(memEnd.rss)} | Heap: ${toMB(memStart.heapUsed)}->${toMB(memEnd.heapUsed)}`);
    });
    next();
});

const isProduction = process.env.NODE_ENV === 'production';

// Shared rate-limit skip conditions
const skipRateLimit = (req) => {
    if (req.method === 'OPTIONS') return true;
    const path = req.path || req.url;
    if (path === '/api/company-settings' || path.startsWith('/api/i18n/') || path === '/api/health' || path === '/api/version' || path === '/api/server-time') return true;
    return false;
};

// General API rate limit
const generalLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: isProduction ? 300 : 2000,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipRateLimit,
    message: { message: 'Too many requests. Please slow down.' }
});
app.use('/api', generalLimiter);

// Rate limit for write operations
const writeLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: isProduction ? 120 : 600,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipRateLimit,
    message: { message: 'Too many write requests. Please slow down.' }
});
app.use('/api', (req, res, next) => {
    if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
        return writeLimiter(req, res, next);
    }
    next();
});

// Upload rate limit
const uploadLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: isProduction ? 20 : 120,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipRateLimit,
    message: { message: 'Too many file uploads. Please slow down.' }
});
app.use('/api', (req, res, next) => {
    if (req.method === 'POST' && (req.path.includes('/upload') || req.path.includes('/image'))) {
        return uploadLimiter(req, res, next);
    }
    next();
});

// ── Per-endpoint rate limiters for debug/noisy endpoints ──
const versionLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 1,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    skip: (req) => req.method === 'OPTIONS',
    handler: (req, res) => {
        const retryAfter = Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000);
        logger.info(`[RateLimit] version IP=${req.ip} UA="${(req.headers['user-agent'] || '').slice(0, 80)}" count=${req.rateLimit.current}`);
        res.status(429)
            .set('Retry-After', String(Math.max(1, retryAfter)))
            .json({ message: `Rate limit exceeded. Retry after ${retryAfter} seconds.` });
    }
});

// --------------- File Uploads (Cloudinary-direct) ---------------
// Local uploads/ dir preserved only for backward-compat with existing files.
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const { uploadBufferToCloudinary, cloudinary, getCloudinaryUrl } = require('./helpers/cloudinaryUpload');

const fileFilter = (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error('Invalid file type. Only JPG, PNG, WEBP are allowed.'));
};

// Use memory storage — buffer is uploaded to Cloudinary immediately.
// req.file.path / req.file.cloudinaryUrl will hold the Cloudinary secure URL.
const upload = multer({ storage: multer.memoryStorage(), fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

// Middleware wrapper: after multer parses the buffer, push it to Cloudinary.
const uploadToCloudinaryMiddleware = (fieldName, folder = 'uploads') => [ // eslint-disable-line no-unused-vars
    upload.single(fieldName),
    async (req, res, next) => {
        if (!req.file || !req.file.buffer) return next(); // no file uploaded — skip
        try {
            const result = await uploadBufferToCloudinary(req.file.buffer, req.file.originalname, folder);
            req.file.path = result.secure_url;          // drop-in for existing code using req.file.path
            req.file.cloudinaryUrl = result.secure_url;
            req.file.cloudinaryPublicId = result.public_id;
        } catch (err) {
            logger.error('[Cloudinary] Upload error:', err.message);
            return res.status(500).json({ message: 'File upload to Cloudinary failed.' });
        }
        next();
    }
];


// Protected uploads route with Cloudinary fallback when local file missing
app.use('/uploads', (req, res, next) => {
    // Allow token via query string (?token=xxx) for image/imgUrl requests (no Authorization header possible in <img> tags)
    // or Authorization header for API calls
    const token = req.query.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
    if (!token) return res.status(401).json({ message: 'Access denied.' });
    try {
        verifyWithAnySecret(token);
    } catch {
        return res.status(403).json({ message: 'Invalid or expired token.' });
    }

    // Map requested path to local uploads file
    const fileName = path.basename(req.path || '');
    const filePath = path.join(uploadsDir, fileName);

    // If local file exists, let express.static serve it
    if (filePath.startsWith(uploadsDir) && fs.existsSync(filePath)) {
        return express.static(uploadsDir)(req, res, next);
    }

    // Local file missing — attempt Cloudinary fallback (if configured)
    (async () => {
        if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
            const base = path.parse(fileName).name;
            const possiblePublicIds = [`uploads/${base}`, base];
            for (const pubId of possiblePublicIds) {
                try {
                    // Check resource existence in Cloudinary
                    await cloudinary.api.resource(pubId);
                    const url = getCloudinaryUrl(pubId);
                    return res.redirect(302, url);
                } catch (_err) {
                    // not found in this id, continue to next
                }
            }
        }

        // Not found locally or in Cloudinary
        return res.status(404).json({ message: 'Not found.' });
    })().catch(err => {
        logger.error('Error in uploads fallback:', err);
        return res.status(500).json({ message: 'Server error.' });
    });
});

const removeUploadFile = async (imageUrl) => {
    if (!imageUrl || !imageUrl.startsWith('/uploads/')) return;
    const fileName = path.basename(imageUrl);
    const filePath = path.join(uploadsDir, fileName);
    if (!filePath.startsWith(uploadsDir)) return;
    try {
        await fs.promises.unlink(filePath);
    } catch (err) {
        if (err.code !== 'ENOENT') {
            logger.error('Failed to delete upload:', err);
        }
    }
};

// --------------- Async Handler Utility ---------------
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// --------------- Response Caching (Redis-backed) ---------------
// node-cache removed — all caching now flows through Redis via cacheService / middleware/cache.
// cacheMiddleware and invalidateCache are re-exported here so existing route imports continue to work.
const { redisCache, routeCache: _routeCache } = require('./middleware/cache');
const { invalidatePattern } = require('./services/cacheService');

const cacheMiddleware = (duration = 300) => redisCache(duration, 'route');
const invalidateCache = (pattern) => {
    invalidatePattern(pattern).catch(err => logger.error(`[Cache Invalidated] Pattern: ${pattern} error: ${err.message}`));
    logger.info(`[Cache Invalidated] Pattern: ${pattern}`);
};

// Export cache utilities for use in routes
module.exports.cacheMiddleware = cacheMiddleware;
module.exports.invalidateCache = invalidateCache;

// --------------- Route Modules ---------------
const routeRegistrationStartedAt = process.hrtime.bigint();
bootLog('route registration started');

const registerRoute = (label, mountPath, factory) => {
    const startedAt = process.hrtime.bigint();
    bootLog(`[RouteLoad] ${label} (${mountPath}) start`);
    const routeHandler = factory();
    bootLog(`[RouteLoad] ${label} (${mountPath}) done in ${(Number(process.hrtime.bigint() - startedAt) / 1e6).toFixed(1)}ms`);
    app.use(mountPath, routeHandler);
    return routeHandler;
};

const registerRootRoute = (label, factory) => registerRoute(label, '/', factory);

// Root health/info route — prevents NOT_FOUND spam from Render uptime checks or browser probes
app.get('/', (req, res) => {
    res.json({ status: 'ok', service: 'sarga-mis', message: 'API server is running.' });
});

// Middleware to return 503 if database migrations are still running in the background
const migrationGuard = (req, res, next) => {
    if (!global.migrationsComplete) {
        return res.status(503).json({ message: 'Server initializing, please retry' });
    }
    next();
};

app.use([
    '/api/backup',
    '/api/vendors',
    '/api/vendor-payments',
    '/api/vendor-invoices',
    '/api/inventory',
    '/api/products',
    '/api/paperInventory',
    '/api/consumablesInventory'
], migrationGuard);

// Server time endpoint (tamper-proof date/time for clients)
app.get('/api/server-time', (req, res, next) => {
    if (!req.headers.authorization) {
        return res.status(401).json({ message: 'Authentication required' });
    }
    next();
}, asyncHandler((req, res) => {
    const now = new Date();
    const today = getTodayDate();
    const data = {
        iso: now.toISOString(),
        date: today,
        month: today.slice(0, 7),
        timestamp: now.getTime()
    };
    logger.info(`[ServerTime] IP=${req.ip} UA="${(req.headers['user-agent'] || '').slice(0, 120)}"`);
    res.json(data);
}));

registerRoute('auth', '/api', () => require('./routes/auth')(upload));
const mlCheck = require('./middleware/mlCheck');
registerRoute('chatbot middleware', '/api/chatbot', () => mlCheck);
registerRoute('chatbot', '/api/chatbot', () => require('./routes/chatbot'));
registerRoute('branches', '/api', () => require('./routes/branches'));
registerRoute('payments', '/api', () => require('./routes/payments'));
registerRoute('vendors', '/api', () => require('./routes/vendors'));
registerRoute('customerPayments', '/api', () => require('./routes/customerPayments'));
registerRoute('customers', '/api', () => require('./routes/customers'));
registerRoute('customerDesigns', '/api', () => require('./routes/customerDesigns'));
registerRoute('requests', '/api', () => require('./routes/requests'));
registerRoute('staff', '/api/staff', () => require('./routes/staff')(upload, removeUploadFile));
registerRoute('staffDashboard', '/api/staff', () => require('./routes/staffDashboard'));
registerRoute('staffPortal', '/api', () => require('./routes/staffPortal')(upload));
registerRoute('designWorkspace', '/api', () => require('./routes/designWorkspace')(upload));
registerRoute('scheduleManagement', '/api/schedules', () => require('./routes/scheduleManagement'));
registerRoute('jobs', '/api', () => require('./routes/jobs').router);
registerRoute('products', '/api', () => require('./routes/products')(upload, removeUploadFile));
registerRoute('paperInventory', '/api/paperInventory', () => require('./routes/paperInventory'));
registerRoute('consumablesInventory', '/api', () => require('./routes/consumablesInventory'));
registerRoute('inventory', '/api', () => require('./routes/inventory'));
// Dev helper routes (only load when not in production)
// Dev helper routes (temporary - allow local UI testing without auth)
try {
    if (!isProduction) {
        registerRoute('devRoutes', '/api/dev', () => require('./routes/devRoutes'));
        logger.info('[DevRoutes] Loaded /api/dev routes');
    } else {
        logger.info('[DevRoutes] Skipped loading in production');
    }
} catch (e) {
    logger.warn('[DevRoutes] Not loaded:', (e && e.stack) ? e.stack : (e && e.message) ? e.message : e);
}
registerRoute('frontOffice', '/api', () => require('./routes/frontOffice'));
registerRoute('shortcuts', '/api/shortcuts', () => require('./routes/shortcuts'));
registerRoute('expenses', '/api', () => require('./routes/expenses'));
registerRoute('finance', '/api', () => require('./routes/finance'));
registerRoute('expenses-extended', '/api', () => require('./routes/expenses-extended'));
registerRoute('utilityEmail', '/api', () => require('./routes/utilityEmail'));
registerRoute('coupons', '/api', () => require('./routes/coupons'));
registerRoute('stockVerification', '/api/stock-verification', () => require('./routes/stockVerification'));
registerRoute('stockRequests', '/api', () => require('./routes/stockRequests'));
registerRoute('ocr', '/api/ocr', () => require('./routes/ocr'));

// Three Books System Routes
registerRoute('machines', '/api/machines', () => require('./routes/machines'));
registerRoute('internalTransfers', '/api/internal-transfers', () => require('./routes/internalTransfers'));
registerRoute('internalTransactions', '/api/internal-transactions', () => require('./routes/internalTransactions'));
registerRoute('internalBooks', '/api/admin/internal-books', () => require('./routes/internalBooks'));
registerRoute('dailyReports', '/api/daily-reports', () => require('./routes/dailyReports'));
registerRoute('dailyReportUnified', '/api/daily-report', () => require('./routes/dailyReportUnified'));
registerRoute('backup', '/api', () => require('./routes/backup'));
const sheetsBackupRoutes = registerRoute('sheetsBackup', '/api/backup', () => require('./routes/sheetsBackup'));

// AI Features Routes
app.use('/api/ai', mlCheck);
registerRoute('aiMonitoring', '/api/ai/monitoring', () => require('./routes/aiMonitoring'));
registerRoute('aiSearch', '/api/ai', () => require('./routes/aiSearch'));
registerRoute('designCheck', '/api/ai', () => require('./routes/designCheck'));
registerRoute('paperLayout', '/api/ai/paper-layout', () => require('./routes/paperLayout'));
registerRoute('search', '/api', () => require('./routes/search'));
registerRoute('auditInvoice', '/api', () => require('./routes/auditInvoice'));
registerRoute('accounts', '/api', () => require('./routes/accounts'));
registerRoute('jobPriority', '/api/job-priority', () => require('./routes/jobPriority'));
registerRoute('salesPrediction', '/api/ai/sales-prediction', () => require('./routes/salesPrediction'));
registerRoute('orderPredictions', '/api/ai/order-predictions', () => require('./routes/orderPredictions'));
registerRoute('productionTracker', '/api/production-tracker', () => require('./routes/productionTracker'));

// Upsell suggestions API
registerRoute('upsell', '/api', () => require('./routes/upsell'));

// Anomaly detection (calls Python ML service)
registerRoute('anomalies', '/api/ai', () => require('./routes/anomalies'));

// ML sales forecast (calls Python ML service)
registerRoute('forecast', '/api/ai/forecast', () => require('./routes/forecast'));

// AI business insights (calls Python ML service)
registerRoute('insights', '/api/ai', () => require('./routes/insights'));

// Seasonal analysis (calls Python ML service)
registerRoute('seasonal', '/api/ai', () => require('./routes/seasonal'));

// Stock planning (calls Python ML service)
registerRoute('stockPlanning', '/api/ai/stock-planning', () => require('./routes/stockPlanning'));

// Order forecast (calls Python ML service)
registerRoute('orderForecast', '/api/ai/order-forecast', () => require('./routes/orderForecast'));

// AI upsell suggestions (calls Python ML service — Apriori)
registerRoute('aiUpsell', '/api/ai', () => require('./routes/aiUpsell'));

// AI turnaround time prediction (calls Python ML service — GBR)
registerRoute('aiTurnaround', '/api/ai/turnaround', () => require('./routes/aiTurnaround'));

// AI expense categorizer (calls Python ML service — TF-IDF + NB/LR)
registerRoute('expenseCategorizer', '/api/ai/categorize-expense', () => require('./routes/expenseCategorizer'));

// CCTV Attendance System
registerRoute('cctvAttendance', '/api/cctv', () => require('./routes/cctvAttendance'));

// CCTV Camera & Face Data Management
registerRoute('cctvCameras', '/api/cctv', () => require('./routes/cctvCameras')(upload, removeUploadFile));

// Quotes, Invoice Features & Password Reset
registerRoute('quotes', '/api', () => require('./routes/quotes'));
registerRoute('invoiceFeatures', '/api', () => require('./routes/invoiceFeatures'));
registerRoute('passwordReset', '/api', () => require('./routes/passwordReset'));

// Phase 1 Commerce and Website Routes
registerRoute('websiteInquiries', '/api', () => require('./routes/websiteInquiries'));
registerRoute('premiumFeatures', '/api', () => require('./routes/premiumFeatures')());
registerRoute('blog', '/api/blog', () => require('./routes/blog')(upload));
registerRoute('portfolio', '/api', () => require('./routes/portfolio'));
registerRoute('promotions', '/api', () => require('./routes/promotions'));
registerRoute('translations', '/api', () => require('./routes/translations'));
registerRoute('proofs', '/api', () => require('./routes/proofs'));
registerRoute('artworkUploads', '/api', () => require('./routes/artworkUploads'));
registerRoute('pickupSlots', '/api', () => require('./routes/pickupSlots'));
registerRoute('deliveryEstimates', '/api', () => require('./routes/deliveryEstimates'));
registerRoute('websiteReviews', '/api', () => require('./routes/websiteReviews'));
registerRoute('whatsappAnalytics', '/api', () => require('./routes/whatsappAnalytics'));
registerRoute('checkout', '/api', () => require('./routes/checkout'));
registerRoute('businessHub', '/api', () => require('./routes/businessHub'));
registerRoute('preflight', '/api', () => require('./routes/preflight'));
registerRoute('pricing', '/api', () => require('./routes/pricing'));
registerRootRoute('seo', () => require('./routes/seo'));

// Customer-facing Website Routes (public, no auth required — shares same DB)
registerRoute('website', '/api/website', () => require('./routes/website')(upload));
registerRoute('websiteDesigns', '/api/website', () => require('./routes/websiteDesigns'));

// Health check with DB ping (must be before the error handler)
app.get('/api/ping', async (req, res) => {
    try {
        if (pool) await pool.query('SELECT 1');
        res.json({ status: 'ok', db: 'connected', time: new Date().toISOString() });
    } catch (_err) {
        res.status(503).json({ status: 'error', db: 'disconnected', time: new Date().toISOString() });
    }
});

// App version endpoint
app.get('/api/version', versionLimiter, (req, res) => {
    res.set('Cache-Control', 'public, max-age=60');
    logger.info(`[VersionCheck] IP=${req.ip} UA="${(req.headers['user-agent'] || '').slice(0, 120)}" count=${req.rateLimit?.current || 1}`);
    res.json({
        version: process.env.APP_VERSION || '1.0.0',
        critical: process.env.APP_VERSION_CRITICAL === 'true'
    });
});

// --------------- Error Handling ---------------
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
app.use(notFound);
app.use(errorHandler);
bootLog(`route registration completed in ${(Number(process.hrtime.bigint() - routeRegistrationStartedAt) / 1e6).toFixed(1)}ms`);

// --------------- Start Server ---------------
if (process.env.NODE_ENV !== 'test') {
    const server = http.createServer(app);
    const socketInitStartedAt = process.hrtime.bigint();
    bootLog('Socket.io init started');
    initSocket(server, app);
    bootLog(`Socket.io init completed in ${(Number(process.hrtime.bigint() - socketInitStartedAt) / 1e6).toFixed(1)}ms`);
    bootLog(`app.listen starting on port ${PORT}`);
    server.listen(PORT, '0.0.0.0', () => {
        bootLog('Port bound, server accepting requests');
        const mode = process.env.NODE_ENV || 'development';
        const dbHost = (process.env.DB_HOST || 'localhost').replace(/^(.{0,20}).*$/, '$1…');
        logger.info(`Server running on port ${PORT} (${mode}, DB: ${dbHost})`);

        const startPostListenTasks = () => {
            setImmediate(() => {
                void (async () => {
                    const backgroundStartedAt = process.hrtime.bigint();
                    bootLog('[PostListen] DB warm-up started');
                    try {
                        const { warmDatabasePool } = require('./database');
                        await warmDatabasePool();
                        bootLog(`[PostListen] DB warm-up finished in ${(Number(process.hrtime.bigint() - backgroundStartedAt) / 1e6).toFixed(1)}ms`);
                    } catch (err) {
                        logger.warn('[PostListen] DB warm-up failed:', err.message);
                    }
                })();

                setTimeout(() => {
                    void (async () => {
                        const schedulerStartedAt = process.hrtime.bigint();
                        bootLog('[PostListen] scheduler bootstrap started');
                        try {
                            const { initializeScheduler } = require('./services/scheduler');
                            initializeScheduler();
                            bootLog(`[PostListen] scheduler bootstrap finished in ${(Number(process.hrtime.bigint() - schedulerStartedAt) / 1e6).toFixed(1)}ms`);
                        } catch (e) {
                            logger.warn('[Warning] Scheduler not loaded:', e.message);
                        }
                    })();
                }, 0);

                // Pre-warm product-hierarchy cache so the first request doesn't pay ~4s
                setTimeout(async () => {
                    try {
                        const warmStart = process.hrtime.bigint();
                        bootLog('[PostListen] Pre-warming product-hierarchy cache');
                        const { buildProductHierarchy } = require('./routes/jobs');
                        const { setCache } = require('./services/cacheService');
                        const data = await buildProductHierarchy(false, null);
                        await setCache('sarga:product-hierarchy:false', data, 3600);
                        bootLog(`[PostListen] Product-hierarchy cache warmed in ${(Number(process.hrtime.bigint() - warmStart) / 1e6).toFixed(1)}ms`);
                    } catch (err) {
                        logger.warn('[PostListen] Product-hierarchy pre-warm skipped:', err.message);
                    }
                }, 2000);
            });
        };

        // Periodically log memory baseline (every 60s)
        setInterval(() => {
            const mem = process.memoryUsage();
            const toMB = (bytes) => (bytes / 1024 / 1024).toFixed(2) + 'MB';
            logger.info(`[SYS-MEM] RSS: ${toMB(mem.rss)} | Heap: ${toMB(mem.heapUsed)}/${toMB(mem.heapTotal)} | External: ${toMB(mem.external)}`);
        }, 60_000).unref();

        // DEV: list registered routes to help debugging missing endpoints
        try {
            const router = app._router || app.router;
            const stack = router && Array.isArray(router.stack) ? router.stack : [];
            const getPath = (layer) => {
                if (layer?.route?.path) return layer.route.path;
                if (layer?.regexp?.source) return layer.regexp.source;
                return undefined;
            };
            const routes = [];
            stack.forEach((layer) => {
                const p = getPath(layer);
                if (p) {
                    routes.push(p);
                } else if (layer?.name === 'router' && layer?.handle?.stack && Array.isArray(layer.handle.stack)) {
                    layer.handle.stack.forEach((l) => {
                        const rp = getPath(l);
                        if (rp) routes.push(rp);
                    });
                }
            });
            logger.info(`[DevRoutes] Registered route patterns: ${routes.length}`);
            routes.slice(0, 200).forEach(r => logger.info('  ', r));
        } catch (e) {
            logger.warn('[DevRoutes] Failed to list routes:', e && e.message ? e.message : String(e));
        }

        startPostListenTasks();

        // Start background migration check
        bootLog('background migration check starting');
        initDb().then(async () => {
            global.migrationsComplete = true;
            bootLog('background migrations completed');
            logger.info('[DB] Database initialized successfully');

            // Startup verification check for product_hierarchy table
            const db = pool;
            db.query("SHOW TABLES LIKE 'product_hierarchy'")
                .then(([rows]) => {
                    if (rows.length === 0) {
                        console.error('[STARTUP] WARNING: product_hierarchy table does not exist!');
                    } else {
                        console.log('[STARTUP] product_hierarchy table verified OK');
                    }
                })
                .catch(err => console.error('[STARTUP] DB check failed:', err.message));

            // One-time migration: convert /uploads/ DB references to Cloudinary URLs
            try {
                const { migrateUploadsToCloudinary } = require('./helpers/migrateUploads');
                setTimeout(() => {
                    migrateUploadsToCloudinary().catch(err =>
                        logger.error('[Migration] Upload migration failed:', err.message)
                    );
                }, 15_000); // Run 15s after startup to let DB warm up
                logger.info('[Migration] Upload-to-Cloudinary migration scheduled');
            } catch (e) {
                logger.warn('[Migration] Not loaded:', e.message);
            }

            // One-time migration: separate duplicated inventory_item_id links
            try {
                const { cleanDuplicateInventoryLinks } = require('./helpers/migrateInventoryLinks');
                setTimeout(() => {
                    cleanDuplicateInventoryLinks().catch(err =>
                        logger.error('[Migration] Inventory link deduplication failed:', err.message)
                    );
                }, 12_000); // Run 12s after startup to let DB warm up
                logger.info('[Migration] Duplicate inventory links migration scheduled');
            } catch (e) {
                logger.warn('[Migration] Inventory link deduplication not loaded:', e.message);
            }

        }).catch(err => {
            logger.error("Background migration failed:", err);
            // Do not exit the process, keep the server running
        });
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal) => {
        logger.info(`[Server] ${signal} received. Shutting down gracefully...`);
        process.exit(0);
    };
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

    // ── Process-level crash guards ──────────────────────────────────────────
    // Without these, a single unhandled promise rejection kills Node and Render
    // returns a 520 with no headers — which browsers misreport as a CORS error.
    process.on('unhandledRejection', (reason, promise) => {
        logger.error('[CRASH GUARD] Unhandled Promise Rejection — process kept alive', {
            reason: reason instanceof Error ? reason.message : String(reason),
            stack:  reason instanceof Error ? reason.stack  : undefined,
            promise: String(promise),
        });
        // Do NOT call process.exit() here — let the server keep running.
    });

    process.on('uncaughtException', (err) => {
        logger.error('[CRASH GUARD] Uncaught Exception — process kept alive', {
            message: err.message,
            stack:   err.stack,
        });
        // Only exit on truly fatal errors (e.g. out of memory)
        // For most uncaught errors we log and continue.
    });

    // ── Internal self-ping keep-alive ────────────────────────────────────────
    // Render free/starter tier spins down after 15 min of inactivity.
    // We ping our own /api/ping every 10 minutes to stay warm.
    // This also ensures the DB connection pool stays alive.
    //
    // NOTE: Render may inject RENDER_EXTERNAL_URL as just a hostname (no scheme).
    // We normalize it here to always have https://.
    const rawSelfUrl = process.env.RENDER_EXTERNAL_URL
        || process.env.SERVER_URL
        || 'https://software-sarga-2.onrender.com'; // hardcoded fallback
    const RENDER_SELF_URL = process.env.NODE_ENV === 'production'
        ? (/^https?:\/\//i.test(rawSelfUrl) ? rawSelfUrl : `https://${rawSelfUrl}`).replace(/\/$/, '')
        : null;

    if (RENDER_SELF_URL && process.env.NODE_ENV === 'production') {
        const https = require('https');
        const selfPing = () => {
            const url = `${RENDER_SELF_URL}/api/ping`;
            try {
                const req = https.get(url, { timeout: 8000 }, (res) => {
                    logger.info(`[KeepAlive] Self-ping OK — HTTP ${res.statusCode}`);
                    res.resume();
                });
                req.on('error', (err) => {
                    logger.warn(`[KeepAlive] Self-ping failed: ${err.message}`);
                });
                req.on('timeout', () => {
                    logger.warn('[KeepAlive] Self-ping timed out');
                    req.destroy();
                });
                req.end();
            } catch (e) {
                logger.warn(`[KeepAlive] Self-ping threw: ${e.message}`);
            }
        };
        // First ping 30s after startup (let DB warm up first)
        setTimeout(selfPing, 30_000);
        // Then every 10 minutes
        setInterval(selfPing, 10 * 60 * 1000);
        logger.info(`[KeepAlive] Self-ping scheduled every 10 min → ${RENDER_SELF_URL}/api/ping`);
    }
}

module.exports = app;
