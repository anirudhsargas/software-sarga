class AppError extends Error {
  constructor(message, { status = 500, code = 'INTERNAL_ERROR', userMessage, suggestion, details } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.userMessage = userMessage || message;
    this.suggestion = suggestion;
    this.details = details;
  }
}

class BadRequestError extends AppError {
  constructor(message, opts = {}) {
    super(message, { status: 400, code: 'BAD_REQUEST', userMessage: 'The request was invalid.', ...opts });
  }
}

class UnauthorizedError extends AppError {
  constructor(message, opts = {}) {
    super(message, { status: 401, code: 'UNAUTHORIZED', userMessage: 'Please log in to continue.', suggestion: 'Try logging in again with your credentials.', ...opts });
  }
}

class ForbiddenError extends AppError {
  constructor(message, opts = {}) {
    super(message, { status: 403, code: 'FORBIDDEN', userMessage: 'You do not have permission to perform this action.', suggestion: 'Contact your admin to request access.', ...opts });
  }
}

class NotFoundError extends AppError {
  constructor(message, opts = {}) {
    super(message, { status: 404, code: 'NOT_FOUND', userMessage: 'The requested resource was not found.', suggestion: 'Check the URL or go back to the dashboard.', ...opts });
  }
}

class ValidationError extends AppError {
  constructor(message, errors = [], opts = {}) {
    super(message, { status: 422, code: 'VALIDATION_ERROR', userMessage: 'Some fields have invalid values.', suggestion: 'Review the highlighted fields and try again.', details: errors, ...opts });
  }
}

class ConflictError extends AppError {
  constructor(message, opts = {}) {
    super(message, { status: 409, code: 'CONFLICT', userMessage: 'This operation conflicts with existing data.', suggestion: 'Refresh and try again with different values.', ...opts });
  }
}

class RateLimitError extends AppError {
  constructor(message, opts = {}) {
    super(message, { status: 429, code: 'RATE_LIMITED', userMessage: 'Too many requests. Please wait.', suggestion: 'Slow down and try again in a few seconds.', ...opts });
  }
}

module.exports = { AppError, BadRequestError, UnauthorizedError, ForbiddenError, NotFoundError, ValidationError, ConflictError, RateLimitError };
