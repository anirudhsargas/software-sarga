import os
from threading import Thread
from dotenv import load_dotenv
from flask import Flask
from flask_cors import CORS

load_dotenv()

BASE_DIR = os.path.abspath(os.path.dirname(__file__))

def create_app():
    app = Flask(__name__)
    CORS(app)

    # register blueprint
    from .chatbot.routes import bp as chatbot_bp
    app.register_blueprint(chatbot_bp)

    # ensure DB tables
    try:
        from .chatbot import db_setup
        db_setup.init_db()
    except Exception as e:
        print('DB setup failed:', e)

    # ensure model exists
    models_dir = os.path.join(BASE_DIR, 'models')
    model_file = os.path.join(models_dir, 'intent_model.pkl')
    if not os.path.exists(model_file):
        try:
            from .chatbot import train
            print('No model found. Training initial model...')
            train.train_and_save()
        except Exception as e:
            print('Initial training failed:', e)

    # start continuous learning scheduler in background
    try:
        from .chatbot import continuous_learning
        t = Thread(target=continuous_learning.run_scheduler, daemon=True)
        t.start()
    except Exception as e:
        print('Failed to start continuous learning scheduler:', e)

    return app


if __name__ == '__main__':
    app = create_app()
    app.run(host='0.0.0.0', port=int(os.getenv('PORT', 5001)))
