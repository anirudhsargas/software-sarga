const multer = require('multer');
const logger = require('../helpers/logger');
const { AppError } = require('../utils/AppError');

const errorHandler = (err, req, res, _next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_JSON',
        message: 'Invalid JSON in request body.',
        userMessage: 'The request data is not in the correct format.',
        suggestion: 'Check the form data and try again.'
      }
    });
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'LIMIT_FILE_SIZE',
          message: 'File too large. Max limit is 10MB.',
          userMessage: 'The selected file is too large.',
          suggestion: 'Choose a file smaller than 10MB.'
        }
      });
    }
    return res.status(400).json({
      success: false,
      error: {
        code: err.code || 'MULTER_ERROR',
        message: err.message,
        userMessage: 'There was a problem with the file upload.',
        suggestion: 'Try a different file or contact support.'
      }
    });
  }

  if (err instanceof AppError) {
    const body = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        userMessage: err.userMessage,
        suggestion: err.suggestion,
      }
    };
    if (err.details) body.error.details = err.details;
    if (process.env.NODE_ENV === 'development') body.error.stack = err.stack;

    logger.error(`[${err.code}] ${err.message}`, {
      url: req.originalUrl || req.url,
      user: req.user?.id,
      status: err.status,
      stack: err.stack
    });

    return res.status(err.status).json(body);
  }

  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  logger.error(`[INTERNAL_ERROR] ${message}`, {
    url: req.originalUrl || req.url,
    user: req.user?.id,
    status,
    stack: err.stack
  });

  res.status(status).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message,
      userMessage: 'Something went wrong on our end.',
      suggestion: 'Try again in a few minutes. If the problem persists, contact support.',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
};

module.exports = errorHandler;
