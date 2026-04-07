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

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_SECRET_PREVIOUS = process.env.JWT_SECRET_PREVIOUS;
if (!JWT_SECRET) {
    console.error('FATAL: JWT_SECRET environment variable is not defined. Refusing to start.');
    process.exit(1);
}
if (JWT_SECRET === 'printing_shop_secret_key_2025' || JWT_SECRET.length < 32) {
    console.error('FATAL: JWT_SECRET is weak or default. Use a random 256-bit secret (at least 32 chars). Refusing to start.');
    process.exit(1);
}

const jwtSecrets = [JWT_SECRET];
if (JWT_SECRET_PREVIOUS && JWT_SECRET_PREVIOUS !== JWT_SECRET) {
    jwtSecrets.push(JWT_SECRET_PREVIOUS);
}

const verifyWithAnySecret = (token) => {
    let lastError;
    for (const secret of jwtSecrets) {
        try {
            return jwt.verify(token, secret);
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error('Invalid token');
};

const app = express();
const PORT = process.env.PORT || 5000;

// Trust first proxy hop (ngrok/reverse proxy) so rate-limit can safely use client IP.
app.set('trust proxy', 1);

// Request logger (at the very top)
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.error(`[${new Date().toISOString()}] ${req.method} ${req.url} ${res.statusCode} - ${duration}ms`);
    });
    next();
});

let server; // Will hold the http.Server instance for graceful shutdown

process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION! Shutting down...', err);
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION! Shutting down...', reason);
    gracefulShutdown('unhandledRejection');
});

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

function gracefulShutdown(signal) {
    console.log(`\n[${signal}] Graceful shutdown initiated...`);
    if (server) {
        server.close(() => {
            console.log('HTTP server closed.');
            if (pool) pool.end().catch(() => { });
            process.exit(signal === 'SIGTERM' || signal === 'SIGINT' ? 0 : 1);
        });
        // Force shutdown after 10 seconds
        setTimeout(() => {
            console.error('Forced shutdown after timeout.');
            process.exit(1);
        }, 10000);
    } else {
        process.exit(1);
    }
}

// --------------- Middleware ---------------

// Security headers
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow uploads to be served cross-origin
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:"],
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

// CORS
const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
    : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        // Allow localhost on any port
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
            return callback(null, true);
        }
        // Allow LAN / private network IPs (10.x.x.x, 192.168.x.x, 172.16-31.x.x) on any port
        if (/^https?:\/\/(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin)) {
            return callback(null, true);
        }
        // Allow ngrok tunnels (for development/testing)
        if (/^https:\/\/[a-zA-Z0-9-]+\.ngrok(-free)?\.(app|dev)$/.test(origin)) {
            return callback(null, true);
        }
        callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
    credentials: true
}));

// Body parsing with size limits
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logger
app.use((req, res, next) => {
    console.log(`[REQUEST] ${req.method} ${req.url}`);
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

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

// Serve uploads — require valid JWT token via query param or Authorization header
const jwt = require('jsonwebtoken');
app.use('/uploads', (req, res, next) => {
    // Allow token via query string (?token=xxx) or Authorization header
    const token = req.query.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
    if (!token) return res.status(401).json({ message: 'Access denied.' });
    try {
        verifyWithAnySecret(token);
        next();
    } catch {
        return res.status(403).json({ message: 'Invalid or expired token.' });
    }
}, express.static(uploadsDir));

const removeUploadFile = async (imageUrl) => {
    if (!imageUrl || !imageUrl.startsWith('/uploads/')) return;
    const fileName = path.basename(imageUrl);
    const filePath = path.join(uploadsDir, fileName);
    if (!filePath.startsWith(uploadsDir)) return;
    try {
        await fs.promises.unlink(filePath);
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.error('Failed to delete upload:', err);
        }
    }
};

// --------------- Async Handler Utility ---------------
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// --------------- Route Modules ---------------

// Server time endpoint (tamper-proof date/time for clients)
app.get('/api/server-time', asyncHandler((req, res) => {
    const now = new Date();
    res.json({
        iso: now.toISOString(),
        date: now.toISOString().split('T')[0],
        month: now.toISOString().slice(0, 7),
        timestamp: now.getTime()
    });
}));

app.use('/api', require('./routes/auth')(upload));
app.use('/api', require('./routes/branches'));
app.use('/api', require('./routes/payments'));
app.use('/api', require('./routes/vendors'));
app.use('/api', require('./routes/customerPayments'));
app.use('/api', require('./routes/customers'));
app.use('/api', require('./routes/customerDesigns'));
app.use('/api', require('./routes/requests'));
app.use('/api/staff', require('./routes/staff')(upload, removeUploadFile));
app.use('/api/staff', require('./routes/staffDashboard'));
app.use('/api', require('./routes/jobs').router);
app.use('/api', require('./routes/products')(upload, removeUploadFile));
app.use('/api', require('./routes/inventory'));
app.use('/api', require('./routes/frontOffice'));
app.use('/api', require('./routes/expenses'));
app.use('/api', require('./routes/finance'));
app.use('/api', require('./routes/expenses-extended'));
app.use('/api', require('./routes/coupons'));
app.use('/api/stock-verification', require('./routes/stockVerification'));
app.use('/api', require('./routes/stockRequests'));

// Three Books System Routes
app.use('/api/machines', require('./routes/machines'));
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
app.use((err, req, res, next) => {
    console.error(`[Error] ${req.method} ${req.url} - ${err.message}`);

    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: 'File too large. Max limit is 5MB.' });
        }
        return res.status(400).json({ message: err.message });
    }

    // Default to 500 if status code is not set
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode).json({
        message: process.env.NODE_ENV === 'production'
            ? 'Internal Server Error'
            : (err.message || 'Internal Server Error'),
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// --------------- Start Server ---------------
if (process.env.NODE_ENV !== 'test') {
    initDb().then(() => {
        server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`Server running on port ${PORT} (bound to 0.0.0.0)`);

            // Start daily report auto-mailer cron job
            try {
                require('./scripts/sendDailyReports');
            } catch (e) {
                console.warn('[Warning] scripts/sendDailyReports not loaded:', e.message);
            }

            // Anomaly detection cron — every 15 minutes
            try {
                const cron = require('node-cron');
                const { checkAnomalies } = require('./routes/anomalies');
                cron.schedule('*/15 * * * *', () => {
                    console.log('[Cron] Running anomaly check…');
                    checkAnomalies().catch(err => console.error('[Cron] Anomaly check failed:', err.message));
                });
                // Run once on startup (after a short delay so DB is warm)
                setTimeout(() => checkAnomalies().catch(() => {}), 10_000);
                console.log('[Cron] Anomaly detection scheduled every 15 minutes');
            } catch (e) {
                console.warn('[Warning] Anomaly cron not loaded:', e.message);
            }

            // Business insights cron — daily at 7:00 AM
            try {
                const cron2 = require('node-cron');
                const { generateInsights } = require('./routes/insights');
                cron2.schedule('0 7 * * *', () => {
                    console.log('[Cron] Generating daily business insights…');
                    generateInsights().catch(err => console.error('[Cron] Insights generation failed:', err.message));
                });
                console.log('[Cron] Business insights scheduled daily at 7:00 AM');
            } catch (e) {
                console.warn('[Warning] Insights cron not loaded:', e.message);
            }

            // Seasonal analysis cron — 1st of every month at 6:00 AM
            try {
                const cron3 = require('node-cron');
                const { computeSeasonal } = require('./routes/seasonal');
                cron3.schedule('0 6 1 * *', () => {
                    console.log('[Cron] Recomputing seasonal analysis…');
                    computeSeasonal().catch(err => console.error('[Cron] Seasonal analysis failed:', err.message));
                });
                console.log('[Cron] Seasonal analysis scheduled monthly (1st at 6:00 AM)');
            } catch (e) {
                console.warn('[Warning] Seasonal cron not loaded:', e.message);
            }
        });
    }).catch(err => {
        console.error("Initialization failed:", err);
        process.exit(1);
    });
}

module.exports = app;
