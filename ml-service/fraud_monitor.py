"""
Sarga Prints Fraud Monitor — Anomaly Detection Microservice
Flask app on port 5001, called by the Express backend.
"""

import os
import logging
from datetime import datetime, time as dtime
from collections import defaultdict

import numpy as np
import pandas as pd
from flask import Blueprint, request, jsonify
from sklearn.ensemble import IsolationForest

bp = Blueprint("fraud_monitor", __name__)
logger = logging.getLogger(__name__)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _safe_float(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _parse_datetime(v):
    """Parse ISO or MySQL-style datetime string."""
    if isinstance(v, datetime):
        return v
    if not v:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(str(v), fmt)
        except ValueError:
            continue
    return None


def _extract_numeric_features(records, id_field="id"):
    """Build a DataFrame with numeric features for Isolation Forest."""
    rows = []
    for r in records:
        dt = _parse_datetime(r.get("created_at") or r.get("date") or r.get("payment_date"))
        rows.append({
            "record_id": r.get(id_field, r.get("id")),
            "amount": _safe_float(r.get("total_amount") or r.get("amount") or r.get("net_salary")),
            "discount_percent": _safe_float(r.get("discount_percent") or r.get("discount")),
            "hour_of_day": dt.hour if dt else 12,
            "day_of_week": dt.weekday() if dt else 0,
            "branch_id": int(r.get("branch_id") or 0),
        })
    return pd.DataFrame(rows)


# ── Isolation Forest ──────────────────────────────────────────────────────────

def run_isolation_forest(df, contamination=0.05):
    """Return list of record_ids flagged as anomalous by Isolation Forest."""
    if df.empty or len(df) < 5:
        return []
    feature_cols = ["amount", "discount_percent", "hour_of_day", "day_of_week", "branch_id"]
    X = df[feature_cols].fillna(0).values
    model = IsolationForest(contamination=contamination, random_state=42, n_estimators=100)
    preds = model.fit_predict(X)
    flagged = df.loc[preds == -1, "record_id"].tolist()
    return flagged


# ── Z-score check ─────────────────────────────────────────────────────────────

def run_zscore_check(df, threshold=2.5):
    """Flag records whose amount is > threshold std-devs from their branch mean."""
    if df.empty or len(df) < 3:
        return []
    flagged = []
    for branch_id, group in df.groupby("branch_id"):
        if len(group) < 2:
            continue
        mean = group["amount"].mean()
        std = group["amount"].std()
        if std == 0:
            continue
        outliers = group[((group["amount"] - mean).abs() / std) > threshold]
        for _, row in outliers.iterrows():
            flagged.append({
                "record_id": row["record_id"],
                "branch_id": int(branch_id),
                "z_score": round(float((row["amount"] - mean) / std), 2),
            })
    return flagged


# ── Rule-based checks ─────────────────────────────────────────────────────────

def check_high_discount(jobs):
    """Discount > 40% on any job."""
    anomalies = []
    for j in jobs:
        disc = _safe_float(j.get("discount_percent") or j.get("discount"))
        if disc > 40:
            anomalies.append({
                "type": "high_discount",
                "severity": "high",
                "description": f"Job has {disc}% discount (threshold: 40%)",
                "record_id": j.get("id"),
                "branch_id": j.get("branch_id"),
            })
    return anomalies


def check_expense_spike(expenses):
    """Expense amount > 3× branch daily average."""
    if not expenses:
        return []
    branch_amounts = defaultdict(list)
    for e in expenses:
        bid = e.get("branch_id")
        amt = _safe_float(e.get("amount") or e.get("total_amount"))
        if bid is not None:
            branch_amounts[bid].append((e, amt))

    anomalies = []
    for bid, items in branch_amounts.items():
        amounts = [a for _, a in items]
        if not amounts:
            continue
        daily_avg = np.mean(amounts)
        for e, amt in items:
            if daily_avg > 0 and amt > daily_avg * 3:
                anomalies.append({
                    "type": "expense_spike",
                    "severity": "high",
                    "description": f"Expense ₹{amt:,.0f} is {amt/daily_avg:.1f}× the branch daily avg (₹{daily_avg:,.0f})",
                    "record_id": e.get("id"),
                    "branch_id": bid,
                })
    return anomalies


def check_staff_not_present(jobs, attendance):
    """Job created by staff not in today's attendance for that branch."""
    if not jobs or not attendance:
        return []
    # Build set of (staff_id, branch_id) who are present today
    present = set()
    for a in attendance:
        sid = a.get("staff_id")
        bid = a.get("branch_id")
        status = str(a.get("status") or "").lower()
        if sid and bid and status in ("present", "half-day", "half_day"):
            present.add((int(sid), int(bid)))

    anomalies = []
    for j in jobs:
        creator = j.get("created_by") or j.get("staff_id")
        bid = j.get("branch_id")
        if creator and bid and (int(creator), int(bid)) not in present:
            anomalies.append({
                "type": "staff_not_present",
                "severity": "medium",
                "description": f"Job created by staff #{creator} who is not marked present at branch #{bid}",
                "record_id": j.get("id"),
                "branch_id": bid,
            })
    return anomalies


def check_duplicate_payments(transactions):
    """Same job_id appearing in payments more than once."""
    if not transactions:
        return []
    job_payments = defaultdict(list)
    for t in transactions:
        jid = t.get("job_id")
        if jid:
            job_payments[jid].append(t)

    anomalies = []
    for jid, payments in job_payments.items():
        if len(payments) > 1:
            anomalies.append({
                "type": "duplicate_payment",
                "severity": "high",
                "description": f"Job #{jid} has {len(payments)} payments — possible duplicate",
                "record_id": jid,
                "branch_id": payments[0].get("branch_id"),
            })
    return anomalies


def check_zero_jobs_gap(jobs):
    """Zero jobs for a branch for > 4 hours during business hours (9am–7pm)."""
    if not jobs:
        return []
    branch_times = defaultdict(list)
    for j in jobs:
        bid = j.get("branch_id")
        dt = _parse_datetime(j.get("created_at"))
        if bid and dt:
            branch_times[bid].append(dt)

    business_start = dtime(9, 0)
    business_end = dtime(19, 0)
    anomalies = []

    for bid, times in branch_times.items():
        times.sort()
        for i in range(1, len(times)):
            prev, curr = times[i - 1], times[i]
            gap_hours = (curr - prev).total_seconds() / 3600
            if gap_hours > 4:
                # Check if the gap falls within business hours
                mid = prev + (curr - prev) / 2
                if business_start <= mid.time() <= business_end:
                    anomalies.append({
                        "type": "zero_jobs_gap",
                        "severity": "medium",
                        "description": f"Branch #{bid}: {gap_hours:.1f}h gap with no jobs between {prev.strftime('%H:%M')} and {curr.strftime('%H:%M')}",
                        "record_id": None,
                        "branch_id": bid,
                    })
    return anomalies


def check_duplicate_salary(transactions):
    """Salary paid more than once for same staff_id in same month_year."""
    if not transactions:
        return []
    salary_txns = [t for t in transactions if str(t.get("type") or t.get("category") or "").lower() in ("salary",)]
    if not salary_txns:
        return []

    seen = defaultdict(list)
    for t in salary_txns:
        sid = t.get("staff_id")
        my = t.get("month_year") or t.get("salary_month")
        if not my:
            dt = _parse_datetime(t.get("date") or t.get("payment_date") or t.get("created_at"))
            if dt:
                my = dt.strftime("%Y-%m")
        if sid and my:
            seen[(sid, my)].append(t)

    anomalies = []
    for (sid, my), items in seen.items():
        if len(items) > 1:
            anomalies.append({
                "type": "duplicate_salary",
                "severity": "high",
                "description": f"Staff #{sid} paid salary {len(items)} times for {my}",
                "record_id": sid,
                "branch_id": items[0].get("branch_id"),
            })
    return anomalies


# ── Main endpoint ─────────────────────────────────────────────────────────────

@bp.route("/detect-anomalies", methods=["POST"])
def detect_anomalies():
    try:
        data = request.get_json(force=True) or {}
        transactions = data.get("transactions", [])
        expenses = data.get("expenses", [])
        attendance = data.get("attendance", [])
        jobs = data.get("jobs", [])

        anomalies = []

        # ── ML: Isolation Forest on jobs ──
        if jobs:
            jobs_df = _extract_numeric_features(jobs)
            if_flagged = run_isolation_forest(jobs_df)
            for rid in if_flagged:
                rec = next((j for j in jobs if j.get("id") == rid), {})
                anomalies.append({
                    "type": "isolation_forest_job",
                    "severity": "medium",
                    "description": f"Job #{rid} flagged as statistical outlier by ML model",
                    "record_id": rid,
                    "branch_id": rec.get("branch_id"),
                })

        # ── ML: Isolation Forest on expenses ──
        if expenses:
            exp_df = _extract_numeric_features(expenses)
            if_flagged = run_isolation_forest(exp_df)
            for rid in if_flagged:
                rec = next((e for e in expenses if e.get("id") == rid), {})
                anomalies.append({
                    "type": "isolation_forest_expense",
                    "severity": "medium",
                    "description": f"Expense #{rid} flagged as statistical outlier by ML model",
                    "record_id": rid,
                    "branch_id": rec.get("branch_id"),
                })

        # ── ML: Isolation Forest on transactions ──
        if transactions:
            txn_df = _extract_numeric_features(transactions)
            if_flagged = run_isolation_forest(txn_df)
            for rid in if_flagged:
                rec = next((t for t in transactions if t.get("id") == rid), {})
                anomalies.append({
                    "type": "isolation_forest_transaction",
                    "severity": "medium",
                    "description": f"Transaction #{rid} flagged as statistical outlier by ML model",
                    "record_id": rid,
                    "branch_id": rec.get("branch_id"),
                })

        # ── Z-score checks ──
        for label, records in [("job", jobs), ("expense", expenses), ("transaction", transactions)]:
            if records:
                df = _extract_numeric_features(records)
                z_flagged = run_zscore_check(df)
                for z in z_flagged:
                    anomalies.append({
                        "type": f"zscore_{label}",
                        "severity": "medium",
                        "description": f"{label.title()} #{z['record_id']} amount is {abs(z['z_score'])}σ from branch mean",
                        "record_id": z["record_id"],
                        "branch_id": z["branch_id"],
                    })

        # ── Rule-based checks ──
        anomalies.extend(check_high_discount(jobs))
        anomalies.extend(check_expense_spike(expenses))
        anomalies.extend(check_staff_not_present(jobs, attendance))
        anomalies.extend(check_duplicate_payments(transactions))
        anomalies.extend(check_zero_jobs_gap(jobs))
        anomalies.extend(check_duplicate_salary(transactions))

        # Deduplicate by (type, record_id)
        seen = set()
        unique = []
        for a in anomalies:
            key = (a["type"], a.get("record_id"))
            if key not in seen:
                seen.add(key)
                unique.append(a)

        logger.info("Detected %d anomalies (jobs=%d, expenses=%d, txns=%d, attendance=%d)",
                     len(unique), len(jobs), len(expenses), len(transactions), len(attendance))

        return jsonify({"anomalies": unique})

    except Exception as e:
        logger.exception("Error in detect-anomalies")
        return jsonify({"anomalies": [], "error": str(e)}), 200  # Never 500 to caller



