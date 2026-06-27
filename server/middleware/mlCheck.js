const logger = require('../helpers/logger');

module.exports = (req, res, next) => {
    if (process.env.ENABLE_ML !== 'true') {
        logger.info('[AI_DISABLED] ML skipped');
        const path = req.baseUrl + req.path;
        
        if (path.includes('/anomalies')) {
            return res.json({ enabled: false, message: 'AI temporarily disabled', anomalies: [] });
        }
        if (path.includes('/insights')) {
            return res.json({ enabled: false, insights: [] });
        }
        if (path.includes('/forecast') || path.includes('/order-forecast') || path.includes('/sales-prediction')) {
            return res.json({
                enabled: false,
                message: 'AI temporarily disabled',
                forecast: [],
                model_accuracy: 0,
                model_type: 'none',
                top_features: [],
                actual_revenue: [],
                predictions: [],
                insights: [],
                recommendations: [],
                suggestions: []
            });
        }
        if (path.includes('/seasonal')) {
            return res.json({
                enabled: false,
                peak_months: [],
                slow_months: [],
                best_day_of_week: 'N/A',
                worst_day_of_week: 'N/A',
                seasonal_index: {},
                yoy_growth_percent: 0,
                trend_direction: 'stable',
                source: 'unavailable'
            });
        }
        if (path.includes('/stock-planning')) {
            return res.json({
                enabled: false,
                stock_status: [],
                purchase_list: [],
                total_estimated_cost: 0
            });
        }
        if (path.includes('/turnaround')) {
            const now = new Date();
            return res.json({
                enabled: false,
                predicted_hours: 24,
                ready_by: new Date(now.getTime() + 24 * 3600000).toISOString(),
                confidence: 'low'
            });
        }
        if (path.includes('/upsell')) {
            return res.json({ enabled: false, suggestions: [] });
        }
        if (path.includes('/categorize-expense')) {
            return res.json({
                enabled: false,
                predicted_category: null,
                confidence: 0,
                alternatives: [],
                fallback: true
            });
        }
        if (path.includes('/monitoring')) {
            return res.json({
                enabled: false,
                alerts: [],
                totals: {},
                risky_staff: []
            });
        }
        if (path.includes('/chatbot')) {
            return res.json({
                enabled: false,
                status: 'unavailable',
                message: 'Chatbot service temporarily disabled'
            });
        }
        
        return res.json({ enabled: false, message: 'AI temporarily disabled' });
    }
    next();
};
