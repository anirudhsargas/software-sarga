/**
 * Universal pagination helper for Sarga.
 * Calculates offset and returns a standardized response formatter.
 * 
 * @param {object} query - Original request query object
 * @param {number} page - Current page
 * @param {number} limit - Records per page
 */
const paginate = (query, page = 1, limit = 20) => {
  const safePage = Math.max(1, parseInt(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit) || 20));
  const offset = (safePage - 1) * safeLimit;

  return {
    limit: safeLimit,
    offset,
    page: safePage,
    response: (data, total) => ({
      data,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
      hasNext: safePage < Math.ceil(total / (safeLimit || 1)),
      hasPrev: safePage > 1
    })
  };
};

module.exports = { paginate };
