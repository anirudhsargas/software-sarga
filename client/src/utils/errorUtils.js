export const ErrorCategory = {
  NETWORK: 'NETWORK',
  AUTH: 'AUTH',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION: 'VALIDATION',
  CONFLICT: 'CONFLICT',
  RATE_LIMIT: 'RATE_LIMIT',
  SERVER: 'SERVER',
  UNKNOWN: 'UNKNOWN',
  CHUNK_LOAD: 'CHUNK_LOAD',
};

const statusCategoryMap = {
  400: 'VALIDATION',
  401: 'AUTH',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'VALIDATION',
  429: 'RATE_LIMIT',
};

const defaultMessages = {
  400: 'The request was invalid.',
  401: 'Please log in to continue.',
  403: 'You do not have permission for this action.',
  404: 'The requested resource was not found.',
  409: 'This operation conflicts with existing data.',
  422: 'Please check the form for errors.',
  429: 'Too many requests. Please slow down.',
};

const defaultSuggestions = {
  400: 'Check the form data and try again.',
  401: 'Log in again with your credentials.',
  403: 'Contact your admin to request access.',
  404: 'The page may have been moved or deleted.',
  409: 'Refresh and try again with different values.',
  422: 'Review the highlighted fields and try again.',
  429: 'Wait a few seconds before trying again.',
};

const categoryIconMap = {
  NETWORK: 'network',
  AUTH: 'auth',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'notfound',
  SERVER: 'server',
  RATE_LIMIT: 'ratelimit',
  VALIDATION: 'validation',
  CONFLICT: 'conflict',
};

export function parseError(error) {
  if (!error || (!error.response && error.request)) {
    return {
      category: ErrorCategory.NETWORK,
      userMessage: 'Unable to reach the server.',
      suggestion: 'Check your internet connection and make sure the server is running.',
      code: 'NETWORK_ERROR',
      icon: 'network',
    };
  }

  const status = error.response?.status;
  const data = error.response?.data;
  const serverError = data?.error;

  if (serverError?.userMessage || serverError?.code) {
    return {
      category: statusCategoryMap[status] || ErrorCategory.UNKNOWN,
      userMessage: serverError.userMessage || 'Something went wrong.',
      suggestion: serverError.suggestion || '',
      code: serverError.code || 'UNKNOWN',
      details: serverError.details,
      icon: categoryIconMap[statusCategoryMap[status]] || 'unknown',
    };
  }

  return {
    category: statusCategoryMap[status] || (status >= 500 ? ErrorCategory.SERVER : ErrorCategory.UNKNOWN),
    userMessage: defaultMessages[status] || 'Something went wrong on our end.',
    suggestion: defaultSuggestions[status] || 'Try again in a few minutes. If the problem persists, contact support.',
    code: `HTTP_${status || 'UNKNOWN'}`,
    icon: categoryIconMap[statusCategoryMap[status]] || 'unknown',
  };
}

export function isStaleChunkError(error) {
  const msg = error?.message || '';

  // Chunk load errors from failed dynamic imports / script loading
  const isChunkFail =
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('Unable to preload CSS') ||
    error?.name === 'ChunkLoadError';

  if (isChunkFail) return true;

  // TDZ errors ("Cannot access 'X' before initialization") happen when
  // modules from an older deployment are evaluated alongside modules from
  // a newer deployment (stale service-worker cache mixing chunks).
  return /Cannot access\s+['"][^'"]+['"]\s+before initialization/.test(msg);
}

export function isChunkLoadError(error) {
  return isStaleChunkError(error);
}
