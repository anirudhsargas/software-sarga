import os
import json
from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_cors import cross_origin
from dotenv import load_dotenv
import mysql.connector

from . import predict

load_dotenv()

DB_HOST = os.getenv('DB_HOST')
DB_USER = os.getenv('DB_USER')
DB_PASSWORD = os.getenv('DB_PASSWORD')
DB_NAME = os.getenv('DB_NAME')

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
LOG_FILE = os.path.join(BASE_DIR, 'logs', 'chatbot.log')


def log(msg: str):
    ts = datetime.utcnow().isoformat() + 'Z'
    os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
    with open(LOG_FILE, 'a', encoding='utf-8') as f:
        f.write(f'[{ts}] {msg}\n')


bp = Blueprint('chatbot', __name__, url_prefix='/api/chatbot')


def _get_conn():
    return mysql.connector.connect(host=DB_HOST, user=DB_USER, password=DB_PASSWORD, database=DB_NAME)


@bp.route('/message', methods=['POST'])
@cross_origin()
def message():
    data = request.get_json() or {}
    message = data.get('message', '')
    session_id = data.get('session_id')
    branch = data.get('branch')

    pred = predict.predict_intent(message)
    if 'error' in pred:
        return jsonify({'error': pred['error']}), 500

    intent = pred['intent']
    confidence = pred['confidence']

    # canned replies
    replies = {
        'order_status': 'നിങ്ങളുടെ ഓർഡർ നമ്പർ തരാമോ? ഞങ്ങൾ ഉടൻ 확인 ചെയ്യാം.',
        'price_enquiry': 'ഏത് product ആണ് വേണ്ടത്? Visiting card, pamphlet, banner?',
        'delivery_query': 'Home delivery available ആണ്. ഏത് locality ആണ്?',
        'reorder': 'നിങ്ങൾക്ക് previous order ആണ് ആവശ്യമെങ്കിൽ order number തരൂ.',
        'complaint': 'ക്ഷമിക്കണം. നിങ്ങളുടെ പ്രശ്നം വിശദമായി പറയാമോ? ഞങ്ങൾ പരിശോധിക്കും.',
        'payment_query': 'Payment options: UPI, card, cash. ഏത് ഉപയോഗിക്കണം?',
        'branch_info': 'Perambra branch: 9am-7pm. Meppayur: 10am-6pm. ആരും വിളിക്കാം.',
        'general_greeting': 'നമസ്കാരം! എനിക്ക് എങ്ങനെ സഹായിക്കാം?',
        'other': 'ക്ഷമിക്കണം, ഞാനിഷ്ടപ്പെട്ടില്ല. കൂടുതല്‍ വിവരങ്ങൾ തരാമോ?'
    }

    reply = replies.get(intent, replies['other'])

    # insert into chatbot_logs
    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute("INSERT INTO chatbot_logs (session_id, message, predicted_intent, confidence, branch) VALUES (%s, %s, %s, %s, %s)",
                    (session_id, message, intent, confidence, branch))
        conn.commit()
        log_id = cur.lastrowid
        cur.close()
        conn.close()
    except Exception as e:
        log('DB insert error: ' + str(e))
        return jsonify({'error': 'DB error'}), 500

    return jsonify({'intent': intent, 'confidence': confidence, 'reply': reply, 'log_id': log_id})


@bp.route('/label', methods=['POST'])
@cross_origin()
def label():
    data = request.get_json() or {}
    log_id = data.get('log_id')
    correct_intent = data.get('correct_intent')
    if not log_id or not correct_intent:
        return jsonify({'success': False, 'error': 'log_id and correct_intent required'}), 400
    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute("UPDATE chatbot_logs SET correct_intent = %s, updated_at = NOW() WHERE id = %s", (correct_intent, log_id))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        log('DB update error: ' + str(e))
        return jsonify({'success': False, 'error': 'DB error'}), 500
    return jsonify({'success': True})


@bp.route('/retrain', methods=['POST'])
@cross_origin()
def retrain():
    data = request.get_json() or {}
    force = bool(data.get('force', False))
    from . import continuous_learning

    if force:
        res = continuous_learning.check_and_retrain(min_new_samples=0)
    else:
        res = continuous_learning.check_and_retrain()

    return jsonify(res)


@bp.route('/model-status', methods=['GET'])
@cross_origin()
def model_status():
    meta = {}
    try:
        with open(os.path.join(BASE_DIR, 'models', 'model_meta.json'), 'r', encoding='utf-8') as f:
            meta = json.load(f)
    except Exception:
        meta = {'error': 'meta not found'}

    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM chatbot_logs WHERE correct_intent IS NULL")
        unlabeled = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM chatbot_logs WHERE correct_intent IS NOT NULL AND is_trained = FALSE")
        pending = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM training_examples")
        total = cur.fetchone()[0]
        cur.close()
        conn.close()
    except Exception as e:
        log('DB status error: ' + str(e))
        return jsonify({'error': 'DB error'}), 500

    return jsonify({'meta': meta, 'unlabeled': unlabeled, 'pending': pending, 'training_examples_total': total})


@bp.route('/training-examples', methods=['GET', 'POST'])
@cross_origin()
def training_examples():
    # GET: list training examples; POST: add new example(s)
    try:
        conn = _get_conn()
        cur = conn.cursor(dictionary=True)
        if request.method == 'GET':
            # pagination & search
            try:
                page = int(request.args.get('page', '1'))
                limit = int(request.args.get('limit', '50'))
            except Exception:
                page, limit = 1, 50
            q = request.args.get('q')
            intent = request.args.get('intent')
            source = request.args.get('source')
            offset = (page - 1) * limit

            where_clauses = []
            params = []
            if q:
                where_clauses.append("(text LIKE %s)")
                params.append('%' + q + '%')
            if intent:
                where_clauses.append("intent = %s")
                params.append(intent)
            if source:
                where_clauses.append("source = %s")
                params.append(source)

            where_sql = 'WHERE ' + ' AND '.join(where_clauses) if where_clauses else ''

            # total count
            count_q = f"SELECT COUNT(*) AS cnt FROM training_examples {where_sql}"
            cur.execute(count_q, params)
            total = cur.fetchone()['cnt'] if cur.rowcount is not None else 0

            select_q = f"SELECT id, text, intent, source, added_at FROM training_examples {where_sql} ORDER BY added_at DESC LIMIT %s OFFSET %s"
            cur.execute(select_q, params + [limit, offset])
            rows = cur.fetchall()
            cur.close()
            conn.close()
            total_pages = (total + limit - 1) // limit if limit else 1
            return jsonify({'rows': rows, 'page': page, 'limit': limit, 'total': total, 'total_pages': total_pages})

        data = request.get_json() or {}
        if isinstance(data, list):
            # bulk insert list of {text, intent, source}
            insert_q = "INSERT INTO training_examples (text, intent, source) VALUES (%s, %s, %s)"
            for item in data:
                cur.execute(insert_q, (item.get('text'), item.get('intent'), item.get('source', 'manual')))
            conn.commit()
            cur.close()
            conn.close()
            return jsonify({'success': True})
        else:
            text = data.get('text')
            intent = data.get('intent')
            source = data.get('source', 'manual')
            if not text or not intent:
                return jsonify({'success': False, 'error': 'text and intent required'}), 400
            cur.execute("INSERT INTO training_examples (text, intent, source) VALUES (%s, %s, %s)", (text, intent, source))
            conn.commit()
            cur.close()
            conn.close()
            return jsonify({'success': True})
    except Exception as e:
        log('training_examples error: ' + str(e))
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/model-versions', methods=['GET'])
@cross_origin()
def model_versions():
    try:
        conn = _get_conn()
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT id, version, accuracy, training_samples, is_active, trained_at FROM model_versions ORDER BY trained_at DESC")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify({'rows': rows})
    except Exception as e:
        log('model_versions error: ' + str(e))
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/logs', methods=['GET'])
@cross_origin()
def logs():
    try:
        page = int(request.args.get('page', '1'))
        limit = int(request.args.get('limit', '20'))
    except Exception:
        page, limit = 1, 20
    labeled = request.args.get('labeled', 'false').lower() == 'true'
    offset = (page - 1) * limit
    try:
        conn = _get_conn()
        cur = conn.cursor(dictionary=True)
        if labeled:
            cur.execute("SELECT * FROM chatbot_logs WHERE correct_intent IS NOT NULL LIMIT %s OFFSET %s", (limit, offset))
        else:
            cur.execute("SELECT * FROM chatbot_logs WHERE correct_intent IS NULL LIMIT %s OFFSET %s", (limit, offset))
        rows = cur.fetchall()
        cur.close()
        conn.close()
    except Exception as e:
        log('DB logs error: ' + str(e))
        return jsonify({'error': 'DB error'}), 500

    return jsonify({'rows': rows, 'page': page, 'limit': limit})
