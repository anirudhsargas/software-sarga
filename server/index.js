require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { initDb } = require('./database');

const app = express();
const PORT = process.env.PORT || 5000;

// --------------- Middleware ---------------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
app.use('/api', require('./routes/requests'));
app.use('/api/staff', require('./routes/staff')(upload, removeUploadFile));
app.use('/api/staff', require('./routes/staffDashboard'));
app.use('/api', require('./routes/jobs'));
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
        message: err.message || 'Internal Server Error',
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});


// --------------- Start Server ---------------
initDb().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}).catch(err => {
    console.error("Initialization failed:", err);
});

