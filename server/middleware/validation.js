const { z } = require('zod');

/**
 * Validation middleware to validate request data against a zod schema
 * @param {z.ZodObject} schema - The zod schema to validate against
 * @param {'body' | 'query' | 'params'} property - The property of the request to validate
 */
const validate = (schema, property = 'body') => {
    return (req, res, next) => {
        try {
            const validatedData = schema.parse(req[property]);
            req[property] = validatedData; // Replace with validated data (includes defaults/transforms)
            next();
        } catch (error) {
            if (error instanceof z.ZodError) {
                const details = error.errors.map(err => ({
                    field: err.path.join('.'),
                    message: err.message
                }));
                return res.status(400).json({
                    message: 'Validation failed',
                    errors: details
                });
            }
            next(error);
        }
    };
};

module.exports = { validate };
