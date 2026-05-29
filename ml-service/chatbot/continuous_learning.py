import os
import json
from datetime import datetime
import threading
import time
import traceback

from dotenv import load_dotenv
import mysql.connector
from sentence_transformers import SentenceTransformer
from sklearn.preprocessing import LabelEncoder
from sklearn.linear_model import LogisticRegression
import pickle5 as pickle

load_dotenv()

DB_HOST = os.getenv('DB_HOST')
DB_USER = os.getenv('DB_USER')
DB_PASSWORD = os.getenv('DB_PASSWORD')
DB_NAME = os.getenv('DB_NAME')

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
MODELS_DIR = os.path.join(BASE_DIR, 'models')
MODEL_FILE = os.path.join(MODELS_DIR, 'intent_model.pkl')
META_FILE = os.path.join(MODELS_DIR, 'model_meta.json')
LOG_FILE = os.path.join(BASE_DIR, 'logs', 'chatbot.log')


def log(msg: str):
    ts = datetime.utcnow().isoformat() + 'Z'
    os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
    with open(LOG_FILE, 'a', encoding='utf-8') as f:
        f.write(f'[{ts}] {msg}\n')


def _get_db_conn():
    return mysql.connector.connect(host=DB_HOST, user=DB_USER, password=DB_PASSWORD, database=DB_NAME)


def check_and_retrain(min_new_samples=20):
    try:
        conn = _get_db_conn()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("SELECT COUNT(*) AS cnt FROM chatbot_logs WHERE correct_intent IS NOT NULL AND is_trained = FALSE")
        row = cursor.fetchone()
        new_count = row['cnt'] if row else 0

        if new_count < min_new_samples:
            log(f'Waiting for more labeled data: {new_count}/{min_new_samples}')
            cursor.close()
            conn.close()
            return {'success': False, 'message': 'Waiting for more labeled data', 'found': new_count}

        cursor.execute("SELECT id, message, correct_intent FROM chatbot_logs WHERE correct_intent IS NOT NULL AND is_trained = FALSE")
        new_rows = cursor.fetchall()

        # Load existing training examples
        cursor.execute("SELECT text, intent FROM training_examples")
        existing = cursor.fetchall()

        texts = [r['text'] for r in existing]
        labels = [r['intent'] for r in existing]

        for r in new_rows:
            texts.append(r['message'])
            labels.append(r['correct_intent'])

        # Retrain
        encoder = SentenceTransformer('l3cube-pune/malayalam-sentence-bert')
        X = encoder.encode(texts, show_progress_bar=True)
        le = LabelEncoder()
        y = le.fit_transform(labels)
        clf = LogisticRegression(max_iter=1000, C=5)
        clf.fit(X, y)
        acc = clf.score(X, y)

        # bump version
        version = '1.0'
        if os.path.exists(META_FILE):
            with open(META_FILE, 'r', encoding='utf-8') as f:
                meta = json.load(f)
                version = meta.get('version', '1.0')
        major, minor = (version.split('.') + ['0'])[:2]
        try:
            minor = str(int(minor) + 1)
        except Exception:
            minor = '1'
        new_version = f"{major}.{minor}"

        os.makedirs(MODELS_DIR, exist_ok=True)
        model_payload = {'classifier': clf, 'label_encoder': le, 'version': new_version, 'sample_count': len(texts)}
        with open(MODEL_FILE, 'wb') as f:
            pickle.dump(model_payload, f)

        meta = {'version': new_version, 'accuracy': float(acc), 'trained_at': datetime.utcnow().isoformat() + 'Z', 'sample_count': len(texts)}
        with open(META_FILE, 'w', encoding='utf-8') as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)

        # mark logs as trained and insert training_examples
        ids = [str(r['id']) for r in new_rows]
        if ids:
            id_list = ','.join(ids)
            cursor.execute(f"UPDATE chatbot_logs SET is_trained = TRUE WHERE id IN ({id_list})")
            conn.commit()

            insert_q = "INSERT INTO training_examples (text, intent, source) VALUES (%s, %s, 'customer')"
            for r in new_rows:
                try:
                    cursor.execute(insert_q, (r['message'], r['correct_intent']))
                except Exception:
                    log('Failed to insert training_example for id ' + str(r.get('id')))
            conn.commit()

        # insert into model_versions
        try:
            cursor.execute("INSERT INTO model_versions (version, accuracy, training_samples, is_active) VALUES (%s, %s, %s, TRUE)", (new_version, float(acc), len(texts)))
            conn.commit()
        except Exception:
            log('Failed to insert into model_versions')

        cursor.close()
        conn.close()

        log(f'Retrained model to version {new_version} with accuracy {acc:.4f}')
        return {'success': True, 'new_version': new_version, 'accuracy': float(acc)}

    except Exception as e:
        traceback.print_exc()
        log('Error in check_and_retrain: ' + str(e))
        return {'success': False, 'error': str(e)}


def run_scheduler():
    import schedule

    threshold = int(os.getenv('NEW_SAMPLE_THRESHOLD', '20'))

    schedule.every().day.at("02:00").do(check_and_retrain, min_new_samples=threshold)

    while True:
        schedule.run_pending()
        time.sleep(30)


if __name__ == '__main__':
    print('Starting continuous learning scheduler (foreground)')
    run_scheduler()
