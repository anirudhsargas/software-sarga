const { NotFoundError } = require('../utils/AppError');

const notFound = (req, res, next) => {
  next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl || req.url}`, {
    userMessage: `The page "${req.originalUrl || req.url}" was not found.`,
    suggestion: 'Check the URL or go back to the dashboard.'
  }));
};

module.exports = notFound;
