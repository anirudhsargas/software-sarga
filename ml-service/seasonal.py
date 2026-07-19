"""
Sarga Prints — Seasonal Analysis Endpoint
POST /seasonal-analysis

Loads 12+ months of daily revenue per branch, runs STL decomposition,
and returns seasonal indices, peak/slow months, best/worst day, YoY growth,
and trend direction.
"""

import os
import logging
import calendar
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
from flask import Blueprint, request, jsonify

bp = Blueprint("seasonal", __name__)

logger = logging.getLogger(__name__)

def _load_daily_revenue():
    """Load 12+ months of daily revenue per branch from MySQL."""
    from db import get_connection, dict_cursor

    conn = get_connection()
    try:
        cursor = dict_cursor(conn)
        cursor.execute("""
            SELECT DATE(created_at) AS day,
                   branch_id,
                   SUM(total_amount) AS revenue
            FROM sarga_jobs
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 18 MONTH)
            GROUP BY DATE(created_at), branch_id
            ORDER BY day
        """)
        rows = cursor.fetchall()
    finally:
        conn.close()

    if not rows:
        return pd.DataFrame(columns=["day", "branch_id", "revenue"])

    df = pd.DataFrame(rows)
    df["day"] = pd.to_datetime(df["day"])
    df["revenue"] = df["revenue"].astype(float)
    return df


def _stl_decompose(series, period):
    """Run STL decomposition, returning trend and seasonal components."""
    from statsmodels.tsa.seasonal import STL

    # STL requires at least 2 full cycles
    if len(series) < period * 2:
        return None, None

    stl = STL(series, period=period, robust=True)
    result = stl.fit()
    return result.trend, result.seasonal


def _compute_seasonal_analysis(df):
    """Compute all seasonal metrics from the daily revenue DataFrame."""

    # Aggregate across all branches for overall analysis
    daily = df.groupby("day")["revenue"].sum().reset_index()
    daily = daily.set_index("day").sort_index()

    # Fill missing days with 0
    full_range = pd.date_range(daily.index.min(), daily.index.max(), freq="D")
    daily = daily.reindex(full_range, fill_value=0)
    daily.index.name = "day"

    series = daily["revenue"]

    # ── STL decomposition (weekly) ────────────────────────────────────────
    trend_weekly, seasonal_weekly = _stl_decompose(series, period=7)

    # ── STL decomposition (annual — use 52-week proxy if enough data) ─────
    trend_annual, seasonal_annual = None, None
    if len(series) >= 365 * 2:
        trend_annual, seasonal_annual = _stl_decompose(series, period=365)
    elif len(series) >= 52 * 2:
        # Resample to weekly for annual seasonality
        weekly = series.resample("W").sum()
        trend_annual, seasonal_annual = _stl_decompose(weekly, period=52)

    # ── Monthly averages & seasonal index ─────────────────────────────────
    daily_df = series.reset_index()
    daily_df.columns = ["day", "revenue"]
    daily_df["month"] = daily_df["day"].dt.month

    monthly_avg = daily_df.groupby("month")["revenue"].mean()
    overall_monthly_avg = monthly_avg.mean()

    seasonal_index = {}
    for month_num in range(1, 13):
        abbrev = calendar.month_abbr[month_num]
        if month_num in monthly_avg.index and overall_monthly_avg > 0:
            seasonal_index[abbrev] = round(monthly_avg[month_num] / overall_monthly_avg, 2)
        else:
            seasonal_index[abbrev] = 0.0

    # ── Peak & slow months ────────────────────────────────────────────────
    sorted_months = sorted(seasonal_index.items(), key=lambda x: x[1], reverse=True)
    peak_months = [calendar.month_name[list(calendar.month_abbr).index(m)] for m, _ in sorted_months[:3]]
    slow_months = [calendar.month_name[list(calendar.month_abbr).index(m)] for m, _ in sorted_months[-3:]]

    # ── Best / worst day of week ──────────────────────────────────────────
    daily_df["dow"] = daily_df["day"].dt.day_name()
    dow_avg = daily_df.groupby("dow")["revenue"].mean()
    best_day = dow_avg.idxmax() if len(dow_avg) > 0 else "N/A"
    worst_day = dow_avg.idxmin() if len(dow_avg) > 0 else "N/A"

    # ── YoY growth ────────────────────────────────────────────────────────
    now = pd.Timestamp.now()
    this_year_start = now - timedelta(days=365)
    last_year_start = this_year_start - timedelta(days=365)

    this_year_total = daily_df[daily_df["day"] >= this_year_start]["revenue"].sum()
    last_year_mask = (daily_df["day"] >= last_year_start) & (daily_df["day"] < this_year_start)
    last_year_total = daily_df[last_year_mask]["revenue"].sum()

    yoy_growth_percent = 0.0
    if last_year_total > 0:
        yoy_growth_percent = round(
            ((this_year_total - last_year_total) / last_year_total) * 100, 1
        )

    # ── Trend direction (slope of last 90 days of trend component) ────────
    trend_direction = "stable"
    trend_to_use = trend_weekly
    if trend_to_use is not None and len(trend_to_use.dropna()) >= 30:
        last_90 = trend_to_use.dropna().tail(90)
        if len(last_90) >= 14:
            x = np.arange(len(last_90))
            slope = np.polyfit(x, last_90.values, 1)[0]
            avg_val = last_90.mean()
            if avg_val > 0:
                norm_slope = slope / avg_val * 100  # % change per day
                if norm_slope > 0.15:
                    trend_direction = "growing"
                elif norm_slope < -0.15:
                    trend_direction = "declining"

    return {
        "peak_months": peak_months,
        "slow_months": slow_months,
        "best_day_of_week": best_day,
        "worst_day_of_week": worst_day,
        "seasonal_index": seasonal_index,
        "yoy_growth_percent": yoy_growth_percent,
        "trend_direction": trend_direction,
    }


@bp.route("/seasonal-analysis", methods=["POST"])
def seasonal_analysis():
    try:
        df = _load_daily_revenue()

        if df.empty or len(df) < 30:
            return jsonify({
                "peak_months": [],
                "slow_months": [],
                "best_day_of_week": "N/A",
                "worst_day_of_week": "N/A",
                "seasonal_index": {},
                "yoy_growth_percent": 0,
                "trend_direction": "stable",
                "message": "Not enough data (need 30+ days of jobs)",
            })

        result = _compute_seasonal_analysis(df)
        result["generated_at"] = datetime.now().isoformat()
        return jsonify(result)

    except Exception as e:
        logger.exception("Error in seasonal-analysis")
        return jsonify({
            "peak_months": [],
            "slow_months": [],
            "best_day_of_week": "N/A",
            "worst_day_of_week": "N/A",
            "seasonal_index": {},
            "yoy_growth_percent": 0,
            "trend_direction": "stable",
            "error": str(e),
        }), 200  # never 500
