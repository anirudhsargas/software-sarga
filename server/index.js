// Polyfill browser APIs required by pdf-parse in Node.js environment
if (typeof globalThis.DOMMatrix === 'undefined') globalThis.DOMMatrix = class DOMMatrix { constructor() {} };
if (typeof globalThis.ImageData === 'undefined') globalThis.ImageData = class ImageData { constructor(w, h) { this.width = w; this.height = h; } };
if (typeof globalThis.Path2D === 'undefined') globalThis.Path2D = class Path2D { constructor() {} };

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { initDb, pool } = require('./database');
const { getTodayDate } = require('./helpers');
const logger = require('./helpers/logger');
const { verifyWithAnySecret } = require('./middleware/auth');

// Express app and basic config
const app = express();
const PORT = process.env.PORT || 3000;

// Health check endpoint for Render keepalive (no auth, checks DB connectivity)
app.get('/api/health', async (req, res) => {
    let dbStatus = 'disconnected';
    try {
        const [rows] = await pool.query('SELECT 1 AS ok');
        dbStatus = rows?.[0]?.ok === 1 ? 'connected' : 'error';
    } catch (e) {
        dbStatus = 'error';
    }
    res.status(dbStatus === 'connected' ? 200 : 503).json({
        status: dbStatus === 'connected' ? 'ok' : 'degraded',
        database: dbStatus,
        service: 'sarga-mis',
        time: new Date().toISOString()
    });
});

// Configure allowed CORS origins (normalize and remove trailing slashes)
const allowedOrigins = [
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
].filter(Boolean).map(o => o.replace(/\/$/, ''));

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_SECRET_PREVIOUS = process.env.JWT_SECRET_PREVIOUS;

if (!JWT_SECRET) {
    logger.error('FATAL: JWT_SECRET environment variable is not defined. Refusing to start.');
    process.exit(1);
}

logger.info('[CORS] Configured origins:', allowedOrigins);

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);
        
        // Normalize incoming origin
        const normalizedOrigin = origin.replace(/\/$/, '');
        
        if (allowedOrigins.includes(normalizedOrigin)) {
            return callback(null, true);
        }
        
        logger.warn(`[CORS Blocked] Origin: ${origin}`);
        // Return false instead of an Error to allow the middleware to handle the response gracefully
        callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Idempotency-Key', 'ngrok-skip-browser-warning', 'x-sarga-uuid']
}));

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

// Body parsing with size limits (increased for Base64 images)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logger
app.use((req, res, next) => {
    logger.info(`[REQUEST] ${req.method} ${req.url}`);
    next();
});

const isProduction = process.env.NODE_ENV === 'production';

// General API rate limit
const generalLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: isProduction ? 200 : 2000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests. Please slow down.' }
});
app.use('/api', generalLimiter);

// Rate limit for write operations
const writeLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: isProduction ? 60 : 600,
    standardHeaders: true,
    legacyHeaders: false,
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
    message: { message: 'Too many file uploads. Please slow down.' }
});
app.use('/api', (req, res, next) => {
    if (req.method === 'POST' && (req.path.includes('/upload') || req.path.includes('/image'))) {
        return uploadLimiter(req, res, next);
    }
    next();
});

// --------------- File Uploads ---------------
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${unique}${ext}`);
    }
});

const fileFilter = (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error('Invalid file type. Only JPG, PNG, WEBP are allowed.'));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

// Serve uploads — require valid JWT token via query param or Authorization header
const { cloudinary, getCloudinaryUrl } = require('./helpers/cloudinaryUpload');

// Protected uploads route with Cloudinary fallback when local file missing
app.use('/uploads', (req, res, next) => {
    // Allow token via query string (?token=xxx) or Authorization header
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
                } catch (err) {
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

// --------------- Response Caching ---------------
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 600, checkperiod: 620, useClones: false }); // 10 minute default TTL, no cloning for performance

const cacheMiddleware = (duration = 300) => {
    return (req, res, next) => {
    const key = req.originalUrl || req.url;
    const cached = cache.get(key);
    if (cached) {
        logger.debug(`[Cache HIT] ${key}`);
        return res.json(cached);
    }
    
    // Store original json method
    const originalJson = res.json.bind(res);
    
    // Override json method to cache response
    res.json = (data) => {
        cache.set(key, data, duration);
        logger.debug(`[Cache MISS] ${key} - cached for ${duration}s`);
        return originalJson(data);
    };
    
    next();
    };
};

const invalidateCache = (pattern) => {
    const keys = cache.keys();
    const keysToDelete = keys.filter(key => key.includes(pattern));
    keysToDelete.forEach(key => cache.del(key));
    logger.info(`[Cache Invalidated] Pattern: ${pattern}, Deleted: ${keysToDelete.length} keys`);
};

// Export cache utilities for use in routes
module.exports.cacheMiddleware = cacheMiddleware;
module.exports.invalidateCache = invalidateCache;

// --------------- Route Modules ---------------

// Server time endpoint (tamper-proof date/time for clients)
app.get('/api/server-time', asyncHandler((req, res) => {
    const now = new Date();
    const today = getTodayDate();
    res.json({
        debug_marker: 'paper-inventory-debug-v1',
        iso: now.toISOString(),
        date: today,
        month: today.slice(0, 7),
        timestamp: now.getTime()
    });
}));

// Quick dev test route to verify paperInventory path
app.get('/api/paperInventory/stock-test', (req, res) => {
    res.json({ ok: true, message: 'paperInventory test route' });
});

app.use('/api', require('./routes/auth')(upload));
app.use('/api/chatbot', require('./routes/chatbot'));
app.use('/api', require('./routes/branches'));
app.use('/api', require('./routes/payments'));
app.use('/api', require('./routes/vendors'));
app.use('/api', require('./routes/customerPayments'));
app.use('/api', require('./routes/customers'));
app.use('/api', require('./routes/customerDesigns'));
app.use('/api', require('./routes/requests'));
app.use('/api/staff', require('./routes/staff')(upload, removeUploadFile));
app.use('/api/staff', require('./routes/staffDashboard'));
app.use('/api', require('./routes/staffPortal')(upload));
app.use('/api', require('./routes/designWorkspace')(upload));
app.use('/api/schedules', require('./routes/scheduleManagement'));
app.use('/api', require('./routes/jobs').router);
app.use('/api', require('./routes/products')(upload, removeUploadFile));
app.use('/api/paperInventory', require('./routes/paperInventory'));
app.use('/api', require('./routes/consumablesInventory'));
app.use('/api', require('./routes/inventory'));
// Dev helper routes (only load when not in production)
// Dev helper routes (temporary - allow local UI testing without auth)
try {
    if (!isProduction) {
        app.use('/api/dev', require('./routes/devRoutes'));
        logger.info('[DevRoutes] Loaded /api/dev routes');
    } else {
        logger.info('[DevRoutes] Skipped loading in production');
    }
} catch (e) {
    logger.warn('[DevRoutes] Not loaded:', (e && e.stack) ? e.stack : (e && e.message) ? e.message : e);
}
app.use('/api', require('./routes/frontOffice'));
app.use('/api/quick-billing', require('./routes/quickBilling'));
app.use('/api', require('./routes/expenses'));
app.use('/api', require('./routes/finance'));
app.use('/api', require('./routes/expenses-extended'));
app.use('/api', require('./routes/utilityEmail'));
app.use('/api', require('./routes/coupons'));
app.use('/api/stock-verification', require('./routes/stockVerification'));
app.use('/api', require('./routes/stockRequests'));

// Three Books System Routes
app.use('/api/machines', require('./routes/machines'));
app.use('/api/internal-transfers', require('./routes/internalTransfers'));
app.use('/api/internal-transactions', require('./routes/internalTransactions'));
app.use('/api/admin/internal-books', require('./routes/internalBooks'));
app.use('/api/daily-reports', require('./routes/dailyReports'));
app.use('/api/daily-report', require('./routes/dailyReportUnified'));
app.use('/api', require('./routes/backup'));

// AI Features Routes
app.use('/api/ai/monitoring', require('./routes/aiMonitoring'));
app.use('/api/ai', require('./routes/aiSearch'));
app.use('/api/ai', require('./routes/designCheck'));
app.use('/api/ai/paper-layout', require('./routes/paperLayout'));
app.use('/api', require('./routes/search'));
app.use('/api', require('./routes/auditInvoice'));
app.use('/api', require('./routes/accounts'));
app.use('/api/job-priority', require('./routes/jobPriority'));
app.use('/api/ai/sales-prediction', require('./routes/salesPrediction'));
app.use('/api/ai/order-predictions', require('./routes/orderPredictions'));
app.use('/api/production-tracker', require('./routes/productionTracker'));

// Upsell suggestions API
app.use('/api', require('./routes/upsell'));

// Anomaly detection (calls Python ML service)
app.use('/api/ai', require('./routes/anomalies'));

// ML sales forecast (calls Python ML service)
app.use('/api/ai/forecast', require('./routes/forecast'));

// AI business insights (calls Python ML service)
app.use('/api/ai', require('./routes/insights'));

// Seasonal analysis (calls Python ML service)
app.use('/api/ai', require('./routes/seasonal'));

// Stock planning (calls Python ML service)
app.use('/api/ai/stock-planning', require('./routes/stockPlanning'));

// Order forecast (calls Python ML service)
app.use('/api/ai/order-forecast', require('./routes/orderForecast'));

// AI upsell suggestions (calls Python ML service — Apriori)
app.use('/api/ai', require('./routes/aiUpsell'));

// AI turnaround time prediction (calls Python ML service — GBR)
app.use('/api/ai/turnaround', require('./routes/aiTurnaround'));

// AI expense categorizer (calls Python ML service — TF-IDF + NB/LR)
app.use('/api/ai/categorize-expense', require('./routes/expenseCategorizer'));

// CCTV Attendance System
app.use('/api/cctv', require('./routes/cctvAttendance'));

// CCTV Camera & Face Data Management
app.use('/api/cctv', require('./routes/cctvCameras')(upload, removeUploadFile));

// Quotes, Invoice Features & Password Reset
app.use('/api', require('./routes/quotes'));
app.use('/api', require('./routes/invoiceFeatures'));
app.use('/api', require('./routes/passwordReset'));

// Phase 1 Commerce and Website Routes
app.use('/api', require('./routes/websiteInquiries'));
app.use('/api', require('./routes/premiumFeatures')());
app.use('/api/blog', require('./routes/blog')(upload));
app.use('/api', require('./routes/portfolio'));
app.use('/api', require('./routes/promotions'));
app.use('/api', require('./routes/translations'));
app.use('/api', require('./routes/proofs'));
app.use('/api', require('./routes/artworkUploads'));
app.use('/api', require('./routes/pickupSlots'));
app.use('/api', require('./routes/deliveryEstimates'));
app.use('/api', require('./routes/websiteReviews'));
app.use('/api', require('./routes/whatsappAnalytics'));
app.use('/api', require('./routes/checkout'));
app.use('/api', require('./routes/businessHub'));
app.use('/api', require('./routes/preflight'));
app.use('/api', require('./routes/pricing'));
app.use('/', require('./routes/seo'));

// Customer-facing Website Routes (public, no auth required — shares same DB)
app.use('/api/website', require('./routes/website')(upload));
app.use('/api/website', require('./routes/websiteDesigns'));

// Health check with DB ping (must be before the error handler)
app.get('/api/ping', async (req, res) => {
    try {
        if (pool) await pool.query('SELECT 1');
        res.json({ status: 'ok', db: 'connected', time: new Date().toISOString() });
    } catch (err) {
        res.status(503).json({ status: 'error', db: 'disconnected', time: new Date().toISOString() });
    }
});

// --------------- Error Handling ---------------
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
app.use(notFound);
app.use(errorHandler);

// --------------- Start Server ---------------
if (process.env.NODE_ENV !== 'test') {
    initDb().then(() => {
        logger.info('[DB] Database initialized successfully');
        const server = app.listen(PORT, '0.0.0.0', () => {
            const mode = process.env.NODE_ENV || 'development';
            const dbHost = (process.env.DB_HOST || 'localhost').replace(/^(.{0,20}).*$/, '$1…');
            logger.info(`Server running on port ${PORT} (${mode}, DB: ${dbHost})`);

            // DEV: list registered routes to help debugging missing endpoints
            try {
                const getPath = (layer) => {
                    if (layer.route && layer.route.path) return layer.route.path;
                    if (layer.regexp && layer.regexp.source) return layer.regexp.source;
                    return undefined;
                };
                const routes = [];
                app._router.stack.forEach((layer) => {
                    const p = getPath(layer);
                    if (p) {
                        routes.push(p);
                    } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
                        layer.handle.stack.forEach((l) => {
                            const rp = getPath(l);
                            if (rp) routes.push(rp);
                        });
                    }
                });
                logger.info('[DevRoutes] Registered route patterns:');
                routes.slice(0, 200).forEach(r => logger.info('  ', r));
            } catch (e) {
                logger.warn('[DevRoutes] Failed to list routes:', e.message);
            }

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

            // Initialize Scheduler (consolidated cron management)
            try {
                const { initializeScheduler } = require('./services/scheduler');
                initializeScheduler();
            } catch (e) {
                logger.warn('[Warning] Scheduler not loaded:', e.message);
            }
        });
    }).catch(err => {
        logger.error("Initialization failed:", err);
        process.exit(1);
    });
}

module.exports = app;
