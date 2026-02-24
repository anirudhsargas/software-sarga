/**
 * Parse pagination query params from request.
 * @param {object} req - Express request
 * @param {number} defaultLimit - Default page size (default 20)
 * @returns {{ page: number, limit: number, offset: number }}
 */
function parsePagination(req, defaultLimit = 20) {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || defaultLimit));
    const offset = (page - 1) * limit;
    return { page, limit, offset };
}

/**
 * Build a paginated response object.
 * @param {Array} data - The rows for the current page
 * @param {number} total - Total row count
 * @param {number} page - Current page number
 * @param {number} limit - Page size
 * @returns {{ data: Array, total: number, page: number, limit: number, totalPages: number }}
 */
function paginatedResponse(data, total, page, limit) {
    return {
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
    };
}

module.exports = { parsePagination, paginatedResponse };
