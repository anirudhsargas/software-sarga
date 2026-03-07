require('dotenv').config();
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
if (!JWT_SECRET) {
    console.error('FATAL: JWT_SECRET environment variable is not defined. Refusing to start.');
    process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;

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
    contentSecurityPolicy: false // Disable CSP (SPA serves its own)
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
        // In development, also allow localhost on any port
        if (process.env.NODE_ENV !== 'production' && origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
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
// Moved to top for better visibility

// General API rate limit — 300 requests per 5 minutes per IP
const generalLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests. Please slow down.' }
});
app.use('/api', generalLimiter);

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

app.use('/uploads', express.static(uploadsDir));

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
app.use('/api/job-priority', require('./routes/jobPriority'));
app.use('/api/ai/sales-prediction', require('./routes/salesPrediction'));

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
        });
    }).catch(err => {
        console.error("Initialization failed:", err);
        process.exit(1);
    });
}

module.exports = app;
