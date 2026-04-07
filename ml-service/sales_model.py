"""
Sarga Prints — Sales Forecast ML Model
POST /predict-sales  →  Random Forest daily revenue forecast per branch

Retrains weekly; caches trained model via joblib.
Falls back to 30-day moving average if R² < 0.6.
"""

import os
import time
import logging
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import joblib
from flask import Blueprint, request, jsonify
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score
import mysql.connector

bp = Blueprint("sales_model", __name__)
logger = logging.getLogger(__name__)

MODEL_DIR = Path(__file__).parent / "models"
MODEL_DIR.mkdir(exist_ok=True)

MODEL_PATH = MODEL_DIR / "sales_rf_model.pkl"
META_PATH = MODEL_DIR / "sales_rf_meta.pkl"
RETRAIN_INTERVAL = 7 * 24 * 3600  # 7 days in seconds


# ── DB helper ─────────────────────────────────────────────────────────────────

def _get_db_connection():
    return mysql.connector.connect(
        host=os.environ.get("DB_HOST", "localhost"),
        port=int(os.environ.get("DB_PORT", 3306)),
        user=os.environ.get("DB_USER", "root"),
        password=os.environ.get("DB_PASSWORD", ""),
        database=os.environ.get("DB_NAME", "sarga_db"),
    )


def _load_jobs(months=18):
    """Load completed jobs for the last `months` months."""
    conn = _get_db_connection()
    try:
        cutoff = (datetime.now() - timedelta(days=months * 30)).strftime("%Y-%m-%d")
        query = """
            SELECT j.id, j.branch_id, j.total_amount, j.created_at,
                   j.category AS service_type, j.status
            FROM sarga_jobs j
            WHERE j.created_at >= %s
              AND j.status NOT IN ('Cancelled')
            ORDER BY j.created_at
        """
        df = pd.read_sql(query, conn, params=(cutoff,), parse_dates=["created_at"])
        return df
    finally:
        conn.close()


# ── Feature engineering ───────────────────────────────────────────────────────

def _engineer_features(df):
    """
    From raw jobs build daily aggregates per branch with engineered features.
    Returns (feature_df, target Series).
    """
    df = df.copy()
    df["date"] = df["created_at"].dt.date
    df["branch_id"] = df["branch_id"].fillna(0).astype(int)

    # Daily revenue per branch
    daily = (
        df.groupby(["date", "branch_id"])
        .agg(revenue=("total_amount", "sum"), job_count=("id", "count"))
        .reset_index()
    )
    daily["date"] = pd.to_datetime(daily["date"])
    daily = daily.sort_values(["branch_id", "date"]).reset_index(drop=True)

    # Calendar features
    daily["day_of_week"] = daily["date"].dt.dayofweek
    daily["month"] = daily["date"].dt.month
    daily["week_of_year"] = daily["date"].dt.isocalendar().week.astype(int)
    daily["is_weekend"] = (daily["day_of_week"] >= 5).astype(int)

    # Label-encode branch_id (simple int mapping)
    branch_map = {b: i for i, b in enumerate(sorted(daily["branch_id"].unique()))}
    daily["branch_encoded"] = daily["branch_id"].map(branch_map)

    # One-hot encode top service types from the raw data
    if "service_type" in df.columns:
        top_types = df["service_type"].value_counts().head(10).index.tolist()
        service_daily = (
            df[df["service_type"].isin(top_types)]
            .groupby(["date", "branch_id", "service_type"])["total_amount"]
            .sum()
            .unstack(fill_value=0)
            .reset_index()
        )
        service_daily["date"] = pd.to_datetime(service_daily["date"])
        service_cols = [c for c in service_daily.columns if c not in ("date", "branch_id")]
        # Prefix service columns
        service_daily = service_daily.rename(columns={c: f"svc_{c}" for c in service_cols})
        daily = daily.merge(service_daily, on=["date", "branch_id"], how="left")

    # Rolling revenue features
    for window in (7, 30):
        col = f"rolling_{window}day_revenue"
        daily[col] = (
            daily.groupby("branch_id")["revenue"]
            .transform(lambda s: s.shift(1).rolling(window, min_periods=1).mean())
        )

    daily = daily.fillna(0)

    feature_cols = [
        c for c in daily.columns
        if c not in ("date", "branch_id", "revenue", "job_count")
    ]

    return daily, feature_cols


# ── Model training ────────────────────────────────────────────────────────────

def _needs_retrain():
    if not MODEL_PATH.exists() or not META_PATH.exists():
        return True
    age = time.time() - MODEL_PATH.stat().st_mtime
    return age > RETRAIN_INTERVAL


def _train_model(daily, feature_cols):
    X = daily[feature_cols].values
    y = daily["revenue"].values

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, shuffle=False  # time-series — no shuffle
    )

    model = RandomForestRegressor(
        n_estimators=200, max_depth=8, random_state=42, n_jobs=-1
    )
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)
    score = r2_score(y_test, y_pred)

    # Feature importances
    importances = dict(zip(feature_cols, model.feature_importances_))

    meta = {
        "r2": float(score),
        "feature_cols": feature_cols,
        "trained_at": datetime.now().isoformat(),
    }

    joblib.dump(model, MODEL_PATH)
    joblib.dump(meta, META_PATH)
    logger.info("Model trained — R² = %.4f", score)

    return model, meta, importances


def _load_model():
    model = joblib.load(MODEL_PATH)
    meta = joblib.load(META_PATH)
    return model, meta


# ── Moving-average fallback ───────────────────────────────────────────────────

def _moving_average_forecast(daily, days_ahead=30):
    """Simple 30-day rolling average per branch."""
    forecasts = []
    today = datetime.now().date()
    for branch_id, grp in daily.groupby("branch_id"):
        last_30 = grp.tail(30)["revenue"]
        avg = float(last_30.mean()) if len(last_30) > 0 else 0.0
        std = float(last_30.std()) if len(last_30) > 1 else avg * 0.15
        for d in range(1, days_ahead + 1):
            dt = today + timedelta(days=d)
            forecasts.append({
                "date": dt.isoformat(),
                "predicted_revenue": round(avg, 2),
                "branch_id": int(branch_id),
                "confidence_low": round(max(0, avg - 1.5 * std), 2),
                "confidence_high": round(avg + 1.5 * std, 2),
            })
    return forecasts


# ── Prediction (Random Forest) ────────────────────────────────────────────────

def _rf_forecast(model, daily, feature_cols, days_ahead=30):
    """Predict daily revenue for next `days_ahead` days, per branch."""
    today = datetime.now().date()
    branches = sorted(daily["branch_id"].unique())
    branch_map = {b: i for i, b in enumerate(branches)}

    # Build last-known rolling values per branch
    branch_last = {}
    for bid, grp in daily.groupby("branch_id"):
        branch_last[bid] = grp.sort_values("date").iloc[-1].to_dict()

    forecasts = []
    # Track predictions to update rolling windows
    branch_preds = {bid: list(daily[daily["branch_id"] == bid]["revenue"].tail(30)) for bid in branches}

    for d in range(1, days_ahead + 1):
        dt = today + timedelta(days=d)
        dt_ts = pd.Timestamp(dt)
        for bid in branches:
            row = {}
            row["day_of_week"] = dt_ts.dayofweek
            row["month"] = dt_ts.month
            row["week_of_year"] = int(dt_ts.isocalendar().week)
            row["is_weekend"] = 1 if dt_ts.dayofweek >= 5 else 0
            row["branch_encoded"] = branch_map.get(bid, 0)

            # Rolling revenue from accumulated predictions
            recent = branch_preds.get(bid, [])
            row["rolling_7day_revenue"] = float(np.mean(recent[-7:])) if recent else 0
            row["rolling_30day_revenue"] = float(np.mean(recent[-30:])) if recent else 0

            # Service type columns default to 0
            for col in feature_cols:
                if col.startswith("svc_") and col not in row:
                    row[col] = 0

            # Build feature vector in correct order
            vec = np.array([[row.get(c, 0) for c in feature_cols]])
            pred = float(model.predict(vec)[0])
            pred = max(0, pred)

            # Confidence band from tree variance
            tree_preds = np.array([t.predict(vec)[0] for t in model.estimators_])
            std = float(tree_preds.std())

            forecasts.append({
                "date": dt.isoformat(),
                "predicted_revenue": round(pred, 2),
                "branch_id": int(bid),
                "confidence_low": round(max(0, pred - 1.5 * std), 2),
                "confidence_high": round(pred + 1.5 * std, 2),
            })

            branch_preds.setdefault(bid, []).append(pred)

    return forecasts


# ── Flask endpoint ────────────────────────────────────────────────────────────

@bp.route("/predict-sales", methods=["POST"])
def predict_sales():
    try:
        body = request.get_json(force=True) or {}
        days_ahead = min(int(body.get("days", 30)), 90)

        # 1. Load data
        raw_jobs = _load_jobs(months=18)
        if raw_jobs.empty or len(raw_jobs) < 30:
            return jsonify({
                "forecast": [],
                "model_accuracy": 0,
                "model_type": "insufficient_data",
                "top_features": [],
                "error": "Not enough historical data (need ≥30 jobs)",
            })

        # 2. Engineer features
        daily, feature_cols = _engineer_features(raw_jobs)

        # 3. Train or load model
        if _needs_retrain() or len(feature_cols) == 0:
            model, meta, importances = _train_model(daily, feature_cols)
        else:
            model, meta = _load_model()
            # Verify feature columns match
            if set(meta.get("feature_cols", [])) != set(feature_cols):
                model, meta, importances = _train_model(daily, feature_cols)
            else:
                importances = dict(zip(feature_cols, model.feature_importances_))

        r2 = meta.get("r2", 0)

        # 4. Decide model type
        if r2 < 0.6:
            logger.info("R² = %.4f < 0.6 — falling back to moving average", r2)
            forecast = _moving_average_forecast(daily, days_ahead)
            model_type = "moving_average"
        else:
            forecast = _rf_forecast(model, daily, feature_cols, days_ahead)
            model_type = "random_forest"

        # 5. Top features
        top_features = sorted(
            [{"feature_name": k, "importance_score": round(v, 4)} for k, v in importances.items()],
            key=lambda x: x["importance_score"],
            reverse=True,
        )[:10]

        return jsonify({
            "forecast": forecast,
            "model_accuracy": round(r2, 4),
            "model_type": model_type,
            "top_features": top_features,
        })

    except Exception as e:
        logger.exception("Error in predict-sales")
        return jsonify({
            "forecast": [],
            "model_accuracy": 0,
            "model_type": "error",
            "top_features": [],
            "error": str(e),
        }), 200  # never 500 to caller
