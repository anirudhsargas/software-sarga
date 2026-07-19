"""
Sarga Prints — Order Prediction Endpoint
POST /predict-orders

Loads daily job counts per branch (last 6 months) from MySQL.
Uses ARIMA for < 90 days of data, otherwise trains/loads a Keras LSTM.
Returns per-branch forecasts with confidence intervals.
"""

import os
import logging
import pathlib
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
from flask import Blueprint, request, jsonify

bp = Blueprint("order_predict", __name__)

logger = logging.getLogger(__name__)

MODELS_DIR = pathlib.Path(__file__).parent / "models"
MODELS_DIR.mkdir(exist_ok=True)


# ── DB helper ─────────────────────────────────────────────────────────────────

def _load_daily_jobs():
    """Load daily job counts per branch for the last 6 months."""
    from db import get_connection, dict_cursor

    conn = get_connection()
    try:
        cursor = dict_cursor(conn)
        cursor.execute("""
            SELECT DATE(created_at) AS date,
                   branch_id,
                   COUNT(*)         AS job_count
            FROM sarga_jobs
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
            GROUP BY DATE(created_at), branch_id
            ORDER BY date
        """)
        rows = cursor.fetchall()
    finally:
        conn.close()

    if not rows:
        return pd.DataFrame(columns=["date", "branch_id", "job_count"])

    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"])
    df["job_count"] = df["job_count"].astype(float)
    return df


# ── ARIMA forecast ────────────────────────────────────────────────────────────

def _forecast_arima(series, horizon):
    """ARIMA(2,1,2) forecast, returns (predictions, lower, upper)."""
    from statsmodels.tsa.arima.model import ARIMA

    try:
        model = ARIMA(series.values, order=(2, 1, 2))
        fitted = model.fit()
        fc = fitted.get_forecast(steps=horizon)
        mean = fc.predicted_mean
        ci = fc.conf_int(alpha=0.2)  # 80 % CI
        return (
            np.maximum(mean, 0).tolist(),
            np.maximum(ci[:, 0], 0).tolist(),
            np.maximum(ci[:, 1], 0).tolist(),
        )
    except Exception as exc:
        logger.warning("ARIMA failed, falling back to mean: %s", exc)
        avg = float(series.mean())
        preds = [avg] * horizon
        return preds, [avg * 0.7] * horizon, [avg * 1.3] * horizon


# ── LSTM forecast ─────────────────────────────────────────────────────────────

def _build_lstm():
    """Build a small Keras LSTM model."""
    try:
        from tensorflow.keras.models import Sequential
        from tensorflow.keras.layers import LSTM, Dense
    except ImportError:
        from keras.models import Sequential
        from keras.layers import LSTM, Dense

    model = Sequential([
        LSTM(64, return_sequences=True, input_shape=(14, 1)),
        LSTM(64),
        Dense(1),
    ])
    model.compile(optimizer="adam", loss="mse")
    return model


def _prepare_sequences(series, window=14):
    """Create supervised (X, y) pairs from a 1-D series."""
    X, y = [], []
    arr = series.values.astype(np.float32)
    for i in range(len(arr) - window):
        X.append(arr[i: i + window])
        y.append(arr[i + window])
    return np.array(X).reshape(-1, window, 1), np.array(y)


def _forecast_lstm(series, branch_id, horizon):
    """
    Train or load a cached LSTM model, then forecast `horizon` steps.
    Returns (predictions, lower, upper).
    """
    model_path = MODELS_DIR / f"order_lstm_{branch_id}.keras"
    window = 14
    need_train = True

    # Check for a cached model < 7 days old
    if model_path.exists():
        age = datetime.now() - datetime.fromtimestamp(model_path.stat().st_mtime)
        if age < timedelta(days=7):
            need_train = False

    try:
        try:
            from tensorflow.keras.models import load_model as keras_load
        except ImportError:
            from keras.models import load_model as keras_load
    except ImportError:
        # Keras/TensorFlow not installed — fall back to ARIMA
        logger.warning("Keras not available, falling back to ARIMA for branch %s", branch_id)
        return _forecast_arima(series, horizon)

    if need_train:
        if len(series) < window + 10:
            return _forecast_arima(series, horizon)

        X, y = _prepare_sequences(series, window)
        model = _build_lstm()
        model.fit(X, y, epochs=50, batch_size=16, validation_split=0.1, verbose=0)
        model.save(str(model_path))
    else:
        model = keras_load(str(model_path))

    # Rolling prediction
    recent = series.values[-window:].astype(np.float32).tolist()
    preds = []
    for _ in range(horizon):
        inp = np.array(recent[-window:]).reshape(1, window, 1)
        p = float(model.predict(inp, verbose=0)[0, 0])
        p = max(p, 0)
        preds.append(p)
        recent.append(p)

    # Simple confidence band: ±20 %
    lower = [round(p * 0.8, 1) for p in preds]
    upper = [round(p * 1.2, 1) for p in preds]
    return preds, lower, upper


# ── Validation MAE ────────────────────────────────────────────────────────────

def _compute_mae(series, model_type, branch_id):
    """MAE on last 14 days as held-out validation."""
    if len(series) < 28:
        return None
    train = series.iloc[:-14]
    actual = series.iloc[-14:].values

    if model_type == "ARIMA":
        preds, _, _ = _forecast_arima(train, 14)
    else:
        preds, _, _ = _forecast_lstm(train, branch_id, 14)

    mae = float(np.mean(np.abs(np.array(preds) - actual)))
    return round(mae, 2)


# ── Main route ────────────────────────────────────────────────────────────────

@bp.route("/predict-orders", methods=["POST"])
def predict_orders():
    try:
        body = request.get_json(silent=True) or {}
        horizon = int(body.get("horizon", 30))
        branch_filter = body.get("branch", "all")

        df = _load_daily_jobs()
        if df.empty:
            return jsonify({
                "predictions": [],
                "peak_day_this_week": None,
                "model_type": None,
                "model_accuracy": None,
            })

        branch_ids = df["branch_id"].unique()
        if branch_filter != "all":
            try:
                bid = int(branch_filter)
                if bid in branch_ids:
                    branch_ids = [bid]
            except (ValueError, TypeError):
                pass

        all_predictions = []
        peak_day = None
        chosen_model_type = None
        accuracies = []

        for bid in branch_ids:
            bdf = df[df["branch_id"] == bid].copy()
            bdf = bdf.set_index("date").resample("D")["job_count"].sum().fillna(0)

            n_days = len(bdf)
            if n_days < 7:
                continue

            if n_days < 90:
                model_type = "ARIMA"
                preds, lower, upper = _forecast_arima(bdf, horizon)
            else:
                model_type = "LSTM"
                preds, lower, upper = _forecast_lstm(bdf, bid, horizon)

            chosen_model_type = model_type

            mae = _compute_mae(bdf, model_type, bid)
            if mae is not None:
                accuracies.append(mae)

            today = bdf.index.max() + timedelta(days=1)
            for i in range(len(preds)):
                d = today + timedelta(days=i)
                entry = {
                    "branch_id": int(bid),
                    "date": d.strftime("%Y-%m-%d"),
                    "predicted_orders": round(preds[i], 1),
                    "confidence_interval": [round(lower[i], 1), round(upper[i], 1)],
                }
                all_predictions.append(entry)

                # Track peak within next 7 days
                if i < 7:
                    if peak_day is None or entry["predicted_orders"] > peak_day["predicted_orders"]:
                        peak_day = {
                            "branch_id": int(bid),
                            "date": d.strftime("%Y-%m-%d"),
                            "predicted_orders": round(preds[i], 1),
                        }

        avg_mae = round(float(np.mean(accuracies)), 2) if accuracies else None

        return jsonify({
            "predictions": all_predictions,
            "peak_day_this_week": peak_day,
            "model_type": chosen_model_type,
            "model_accuracy": avg_mae,
        })

    except Exception as exc:
        logger.exception("predict-orders failed")
        return jsonify({"error": str(exc)}), 500
