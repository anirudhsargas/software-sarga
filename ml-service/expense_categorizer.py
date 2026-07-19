"""
Expense Categorizer — ML-powered expense category prediction from OCR text.

POST /categorize-expense
  Body: { "ocr_text": "Reliance Petrol Station 450.00 diesel" }
  Returns: { predicted_category, confidence, alternatives }

Trains TF-IDF + MultinomialNB (or LogisticRegression if accuracy < 0.75)
on past expenses with OCR text and category labels.  Retrains automatically
when the training-data count grows by more than 50 rows since the last build.
"""

import os
import logging
import threading

import joblib
import numpy as np
import mysql.connector
from flask import Blueprint, request, jsonify

from db import get_config, get_connection, dict_cursor
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score
from sklearn.pipeline import Pipeline

logger = logging.getLogger(__name__)

bp = Blueprint("expense_categorizer", __name__)

# ── Globals ──────────────────────────────────────────────────────────────────
_model = None
_vectorizer = None
_classes = None
_train_count = 0
_lock = threading.Lock()

MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "expense_categorizer.joblib")
RETRAIN_THRESHOLD = 50


def _fetch_training_data():
    """
    Collect labelled text→category pairs from:
      1. sarga_expense_training  (explicit labels — highest quality)
      2. sarga_misc_expenses     (description + expense_category)
      3. sarga_office_expenses   (description + expense_type)
      4. sarga_transport_expenses(description + transport_type)
      5. sarga_petty_cash        (description + category)
    """
    conn = get_connection()
    cursor = dict_cursor(conn)
    texts, labels = [], []

    try:
        # 1 — explicit training table
        cursor.execute(
            "SELECT ocr_text, category FROM sarga_expense_training "
            "WHERE ocr_text IS NOT NULL AND category IS NOT NULL"
        )
        for row in cursor.fetchall():
            t = (row["ocr_text"] or "").strip()
            c = (row["category"] or "").strip()
            if t and c:
                texts.append(t)
                labels.append(c)

        # 2 — misc expenses
        cursor.execute(
            "SELECT description, expense_category FROM sarga_misc_expenses "
            "WHERE description IS NOT NULL AND expense_category IS NOT NULL "
            "AND TRIM(description) != '' AND TRIM(expense_category) != ''"
        )
        for row in cursor.fetchall():
            texts.append(row["description"].strip())
            labels.append(row["expense_category"].strip())

        # 3 — office expenses
        cursor.execute(
            "SELECT description, expense_type FROM sarga_office_expenses "
            "WHERE description IS NOT NULL AND expense_type IS NOT NULL "
            "AND TRIM(description) != '' AND TRIM(expense_type) != ''"
        )
        for row in cursor.fetchall():
            texts.append(row["description"].strip())
            labels.append(_map_office_type(row["expense_type"].strip()))

        # 4 — transport expenses
        cursor.execute(
            "SELECT description, transport_type FROM sarga_transport_expenses "
            "WHERE description IS NOT NULL AND transport_type IS NOT NULL "
            "AND TRIM(description) != '' AND TRIM(transport_type) != ''"
        )
        for row in cursor.fetchall():
            texts.append(row["description"].strip())
            labels.append(_map_transport_type(row["transport_type"].strip()))

        # 5 — petty cash
        cursor.execute(
            "SELECT description, category FROM sarga_petty_cash "
            "WHERE description IS NOT NULL AND category IS NOT NULL "
            "AND TRIM(description) != '' AND TRIM(category) != ''"
        )
        for row in cursor.fetchall():
            texts.append(row["description"].strip())
            labels.append(row["category"].strip())

    finally:
        cursor.close()
        conn.close()

    return texts, labels


def _get_training_count():
    """Fast count of total available training rows."""
    conn = get_connection()
    cursor = conn.cursor()
    total = 0
    try:
        for q in [
            "SELECT COUNT(*) FROM sarga_expense_training WHERE ocr_text IS NOT NULL AND category IS NOT NULL",
            "SELECT COUNT(*) FROM sarga_misc_expenses WHERE description IS NOT NULL AND expense_category IS NOT NULL AND TRIM(description) != ''",
            "SELECT COUNT(*) FROM sarga_office_expenses WHERE description IS NOT NULL AND expense_type IS NOT NULL AND TRIM(description) != ''",
            "SELECT COUNT(*) FROM sarga_transport_expenses WHERE description IS NOT NULL AND transport_type IS NOT NULL AND TRIM(description) != ''",
            "SELECT COUNT(*) FROM sarga_petty_cash WHERE description IS NOT NULL AND category IS NOT NULL AND TRIM(description) != ''",
        ]:
            try:
                cursor.execute(q)
                total += cursor.fetchone()[0]
            except mysql.connector.Error:
                pass  # table may not exist yet
    finally:
        cursor.close()
        conn.close()
    return total


# ── Category mapping helpers ─────────────────────────────────────────────────
def _map_office_type(etype):
    mapping = {
        "Stationery": "Office & Admin",
        "Office Supplies": "Office & Admin",
        "Furniture": "Office & Admin",
        "Equipment": "Machine & Maintenance",
        "Software": "Office & Admin",
        "Internet": "Utility",
        "Phone": "Utility",
        "Maintenance": "Machine & Maintenance",
        "Other": "Miscellaneous",
    }
    return mapping.get(etype, "Office & Admin")


def _map_transport_type(ttype):
    mapping = {
        "Delivery": "Transport & Delivery",
        "Fuel": "Transport & Delivery",
        "Vehicle Maintenance": "Transport & Delivery",
        "Vehicle Rent": "Transport & Delivery",
        "Driver Charges": "Transport & Delivery",
        "Toll": "Transport & Delivery",
        "Parking": "Transport & Delivery",
        "Other": "Miscellaneous",
    }
    return mapping.get(ttype, "Transport & Delivery")


# ── Model training ───────────────────────────────────────────────────────────
def _train_model():
    global _model, _vectorizer, _classes, _train_count

    texts, labels = _fetch_training_data()
    if len(texts) < 5:
        logger.warning("Not enough training data (%d rows). Need at least 5.", len(texts))
        return False

    vectorizer = TfidfVectorizer(max_features=1000, ngram_range=(1, 2))
    X = vectorizer.fit_transform(texts)
    y = np.array(labels)

    # Try MultinomialNB first
    nb = MultinomialNB()
    try:
        nb_scores = cross_val_score(nb, X, y, cv=min(5, len(set(y))), scoring="accuracy")
        nb_acc = nb_scores.mean()
    except ValueError:
        nb_acc = 0.0

    if nb_acc >= 0.75:
        clf = nb
        logger.info("Using MultinomialNB (cv accuracy=%.2f)", nb_acc)
    else:
        clf = LogisticRegression(max_iter=1000, solver="lbfgs", multi_class="auto")
        logger.info("MultinomialNB accuracy %.2f < 0.75, switching to LogisticRegression", nb_acc)

    clf.fit(X, y)

    # Persist
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    bundle = {"vectorizer": vectorizer, "classifier": clf, "classes": clf.classes_.tolist(), "count": len(texts)}
    joblib.dump(bundle, MODEL_PATH)

    _vectorizer = vectorizer
    _model = clf
    _classes = clf.classes_.tolist()
    _train_count = len(texts)
    logger.info("Expense categorizer trained on %d samples, %d classes", len(texts), len(_classes))
    return True


def _ensure_model():
    """Load cached model or train a new one. Retrain if data grew by >50."""
    global _model, _vectorizer, _classes, _train_count

    with _lock:
        # Already loaded — check if retrain needed
        if _model is not None:
            current_count = _get_training_count()
            if current_count - _train_count > RETRAIN_THRESHOLD:
                logger.info("Retraining: %d new rows since last build", current_count - _train_count)
                _train_model()
            return _model is not None

        # Try loading from disk
        if os.path.exists(MODEL_PATH):
            try:
                bundle = joblib.load(MODEL_PATH)
                _vectorizer = bundle["vectorizer"]
                _model = bundle["classifier"]
                _classes = bundle["classes"]
                _train_count = bundle.get("count", 0)

                current_count = _get_training_count()
                if current_count - _train_count > RETRAIN_THRESHOLD:
                    _train_model()
                return True
            except Exception as e:
                logger.error("Failed to load cached model: %s", e)

        # Train fresh
        return _train_model()


# ── Flask route ──────────────────────────────────────────────────────────────
@bp.route("/categorize-expense", methods=["POST"])
def categorize_expense():
    body = request.get_json(silent=True) or {}
    ocr_text = (body.get("ocr_text") or "").strip()

    if not ocr_text:
        return jsonify({"error": "ocr_text is required"}), 400

    if not _ensure_model():
        return jsonify({
            "error": "not_enough_data",
            "message": "Not enough labelled expenses to train the model yet.",
        }), 200

    X = _vectorizer.transform([ocr_text])

    if hasattr(_model, "predict_proba"):
        proba = _model.predict_proba(X)[0]
    else:
        proba = np.zeros(len(_classes))
        pred_idx = _model.predict(X)[0]
        idx = _classes.index(pred_idx) if pred_idx in _classes else 0
        proba[idx] = 1.0

    sorted_indices = np.argsort(proba)[::-1]
    top = sorted_indices[0]

    predicted_category = _classes[top]
    confidence = round(float(proba[top]), 2)

    alternatives = []
    for i in sorted_indices[1:4]:
        if proba[i] > 0.01:
            alternatives.append({
                "category": _classes[i],
                "confidence": round(float(proba[i]), 2),
            })

    return jsonify({
        "predicted_category": predicted_category,
        "confidence": confidence,
        "alternatives": alternatives,
    })
