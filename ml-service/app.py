"""
Sarga Prints — ML Microservice Entry Point

Registers all Flask blueprints and runs the app via Gunicorn (production)
or the built-in dev server (python app.py).
"""

import os
import logging
from threading import Thread

from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def create_app():
    application = Flask(__name__)

    # CORS — allow the React dev server and any configured frontend URL
    origins = ["http://localhost:5173"]
    frontend_url = os.environ.get("FRONTEND_URL")
    if frontend_url:
        origins.append(frontend_url)
    CORS(application, origins=origins)

    # ── Register blueprints ───────────────────────────────────────────────
    from fraud_monitor import bp as fraud_bp
    from sales_model import bp as sales_bp
    from insights import bp as insights_bp
    from seasonal import bp as seasonal_bp
    from stock import bp as stock_bp
    from order_predict import bp as order_bp
    from upsell import bp as upsell_bp
    from turnaround import bp as turnaround_bp
    from expense_categorizer import bp as expense_cat_bp
    from ocr_service import bp as ocr_bp
    from chatbot.routes import bp as chatbot_bp

    application.register_blueprint(fraud_bp)
    application.register_blueprint(sales_bp)
    application.register_blueprint(insights_bp)
    application.register_blueprint(seasonal_bp)
    application.register_blueprint(stock_bp)
    application.register_blueprint(order_bp)
    application.register_blueprint(upsell_bp)
    application.register_blueprint(turnaround_bp)
    application.register_blueprint(expense_cat_bp)
    application.register_blueprint(ocr_bp)
    application.register_blueprint(chatbot_bp)

    # ── Chatbot initialisation ────────────────────────────────────────────
    try:
        from chatbot import db_setup
        db_setup.init_db()
    except Exception as e:
        logger.warning('Chatbot DB setup failed: %s', e)

    base_dir = os.path.abspath(os.path.dirname(__file__))
    model_file = os.path.join(base_dir, 'chatbot', 'models', 'intent_model.pkl')
    if not os.path.exists(model_file):
        try:
            from chatbot import train
            logger.info('No chatbot model found. Training initial model...')
            train.train_and_save()
        except Exception as e:
            logger.warning('Initial chatbot training failed: %s', e)

    try:
        from chatbot import continuous_learning
        t = Thread(target=continuous_learning.run_scheduler, daemon=True)
        t.start()
    except Exception as e:
        logger.warning('Failed to start continuous learning scheduler: %s', e)

    # ── Health check ──────────────────────────────────────────────────────
    @application.route("/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok", "service": "sarga-ml"})

    # ── Error handlers ────────────────────────────────────────────────────
    @application.errorhandler(404)
    def not_found(_e):
        return jsonify({"error": "Not found"}), 404

    @application.errorhandler(500)
    def server_error(_e):
        return jsonify({"error": "Internal server error"}), 500

    return application


app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug)
