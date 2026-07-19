"""
Sarga Prints — Turnaround Time Prediction
POST /predict-turnaround

Loads completed jobs from MySQL, trains a GradientBoostingRegressor
to predict turnaround hours, and returns estimated completion time.
"""

import os
import logging
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
from flask import Blueprint, request, jsonify
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.preprocessing import LabelEncoder

bp = Blueprint("turnaround", __name__)
logger = logging.getLogger(__name__)


def _load_completed_jobs():
    """Load past completed jobs with turnaround data."""
    from db import get_connection, dict_cursor

    conn = get_connection()
    try:
        cursor = dict_cursor(conn)
        cursor.execute("""
            SELECT service_type, quantity, branch_id, created_at, completed_at,
                   TIMESTAMPDIFF(HOUR, created_at, completed_at) AS turnaround_hours
            FROM jobs
            WHERE status = 'completed'
              AND completed_at IS NOT NULL
        """)
        rows = cursor.fetchall()
    finally:
        conn.close()
    return rows


def _get_queue_count(branch_id, service_type):
    """Get current pending/in-progress job count for the branch+service."""
    from db import get_connection, dict_cursor

    conn = get_connection()
    try:
        cursor = dict_cursor(conn)
        cursor.execute("""
            SELECT COUNT(*) AS cnt
            FROM jobs
            WHERE status IN ('pending', 'in_progress')
              AND branch_id = %s
              AND service_type = %s
        """, (branch_id, service_type))
        row = cursor.fetchone()
        return row["cnt"] if row else 0
    finally:
        conn.close()


@bp.route("/predict-turnaround", methods=["POST"])
def predict_turnaround():
    """Predict turnaround time for a new job."""
    try:
        body = request.get_json(silent=True) or {}
        service_type = body.get("service_type")
        quantity = body.get("quantity", 1)
        branch_id = body.get("branch_id")
        current_queue = body.get("current_queue_count")

        if not service_type or not branch_id:
            return jsonify({"error": "service_type and branch_id are required"}), 400

        # Load training data
        rows = _load_completed_jobs()
        if len(rows) < 5:
            # Not enough data — return a simple estimate
            fallback_hours = max(1.0, float(quantity) * 0.5)
            now = datetime.utcnow()
            return jsonify({
                "predicted_hours": round(fallback_hours, 1),
                "ready_by": (now + timedelta(hours=fallback_hours)).isoformat(),
                "confidence": "low",
            })

        df = pd.DataFrame(rows)
        df["turnaround_hours"] = df["turnaround_hours"].astype(float)

        # Drop outliers (negative or extremely large values)
        df = df[(df["turnaround_hours"] > 0) & (df["turnaround_hours"] < 720)]
        if len(df) < 5:
            fallback_hours = max(1.0, float(quantity) * 0.5)
            now = datetime.utcnow()
            return jsonify({
                "predicted_hours": round(fallback_hours, 1),
                "ready_by": (now + timedelta(hours=fallback_hours)).isoformat(),
                "confidence": "low",
            })

        # Feature engineering
        le = LabelEncoder()
        df["service_encoded"] = le.fit_transform(df["service_type"].astype(str))
        df["quantity_log"] = np.log1p(df["quantity"].astype(float))
        df["created_at"] = pd.to_datetime(df["created_at"])
        df["day_of_week"] = df["created_at"].dt.dayofweek
        df["hour_of_day"] = df["created_at"].dt.hour

        # Approximate queue count from historical data (jobs open at the same time)
        df["queue_approx"] = 1  # placeholder — real queue is only for prediction input

        feature_cols = ["service_encoded", "quantity_log", "branch_id",
                        "day_of_week", "hour_of_day", "queue_approx"]
        X = df[feature_cols].values
        y = df["turnaround_hours"].values

        # Train model
        model = GradientBoostingRegressor(n_estimators=100, max_depth=4, random_state=42)
        model.fit(X, y)

        # Encode the incoming service_type
        if service_type in le.classes_:
            svc_enc = le.transform([service_type])[0]
        else:
            svc_enc = -1  # unknown service type

        # If queue count not provided, fetch it
        if current_queue is None:
            current_queue = _get_queue_count(branch_id, service_type)

        now = datetime.utcnow()
        X_pred = np.array([[
            svc_enc,
            np.log1p(float(quantity)),
            int(branch_id),
            now.weekday(),
            now.hour,
            int(current_queue),
        ]])

        predicted = float(model.predict(X_pred)[0])
        predicted = max(0.5, round(predicted, 1))

        # Confidence based on training data volume for this service type
        svc_count = int((df["service_type"] == service_type).sum())
        if svc_count >= 30:
            confidence = "high"
        elif svc_count >= 10:
            confidence = "medium"
        else:
            confidence = "low"

        ready_by = now + timedelta(hours=predicted)

        return jsonify({
            "predicted_hours": predicted,
            "ready_by": ready_by.isoformat(),
            "confidence": confidence,
        })

    except Exception as exc:
        logger.exception("Turnaround prediction failed: %s", exc)
        # Graceful fallback
        now = datetime.utcnow()
        return jsonify({
            "predicted_hours": 24.0,
            "ready_by": (now + timedelta(hours=24)).isoformat(),
            "confidence": "low",
        })
