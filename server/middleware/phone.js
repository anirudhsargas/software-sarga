const { normalizeMobileWithCountry } = require('../helpers');

/**
 * Middleware factory: attachNormalizedMobile(fieldName, countryField)
 * - If `req.body[fieldName]` exists, normalizes it using optional countryField
 * - On success sets `req.body[`${fieldName}_normalized`]` to the normalized value
 * - If normalization fails, responds with 400
 */
const attachNormalizedMobile = (fieldName = 'mobile', countryField = 'countryCode') => (req, res, next) => {
    try {
        if (!req.body) return next();
        const raw = req.body[fieldName];
        if (!raw) return next();

        const country = req.body[countryField];
        const normalized = normalizeMobileWithCountry(raw, country);

        if (!normalized || (!(String(normalized).startsWith('+') || String(normalized).length === 10))) {
            return res.status(400).json({ message: `Invalid ${fieldName}` });
        }

        req.body[`${fieldName}_normalized`] = normalized;
        return next();
    } catch (err) {
        return next(err);
    }
};

module.exports = { attachNormalizedMobile };
