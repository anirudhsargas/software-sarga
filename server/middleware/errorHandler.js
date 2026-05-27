const multer = require('multer');
const logger = require('../helpers/logger');

const errorHandler = (err, req, res, next) => {
    const status = err.status || 500;
    const message = err.message || 'Internal Server Error';
    const code = err.code || 'INTERNAL_ERROR';

    try {
        logger.error(`[${code}] ${message}`, {
            url: req.originalUrl || req.url,
            user: req.user?.id,
            stack: err.stack
        });
    } catch (loggingErr) {
        // If logger fails for any reason, fallback to console
        console.error('Logger failed in errorHandler:', loggingErr);
        console.error(err);
    }

    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: { code: 'LIMIT_FILE_SIZE', message: 'File too large. Max limit is 5MB.' }
            });
        }
        return res.status(400).json({
            success: false,
            error: { code: err.code || 'MULTER_ERROR', message: err.message }
        });
    }

    res.status(status).json({
        success: false,
        error: {
            code,
            message,
            ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
        }
    });
};

module.exports = errorHandler;
