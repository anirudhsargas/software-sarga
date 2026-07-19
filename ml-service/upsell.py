"""
Sarga Prints — Upsell Suggestions Endpoint (Apriori)
POST /upsell-suggestions

Loads completed jobs with categories from MySQL, builds market-basket
transactions, runs Apriori + association rules, and returns the top
cross-sell suggestions for the given current services.
"""

import os
import json
import logging
import pathlib
from datetime import datetime

import pandas as pd
from flask import Blueprint, request, jsonify

bp = Blueprint("upsell", __name__)

logger = logging.getLogger(__name__)

RULES_PATH = pathlib.Path(__file__).parent / "models" / "upsell_rules.json"
RULES_PATH.parent.mkdir(exist_ok=True)
_LAST_JOB_COUNT = 0


# ── DB helper ─────────────────────────────────────────────────────────────────

def _load_baskets():
    """
    Load completed jobs and group categories per customer-order basket.
    Each job is treated as a basket item (category value).
    We group by (customer_id, DATE(created_at)) to form baskets — all jobs
    a customer placed on the same day form one transaction.
    """
    from db import get_connection, dict_cursor

    conn = get_connection()
    try:
        cursor = dict_cursor(conn)

        # Total completed-job count (for cache invalidation)
        cursor.execute(
            "SELECT COUNT(*) AS cnt FROM sarga_jobs WHERE status IN ('Completed','Delivered')"
        )
        total_count = cursor.fetchone()["cnt"]

        cursor.execute("""
            SELECT customer_id,
                   DATE(created_at) AS order_date,
                   category
            FROM sarga_jobs
            WHERE status IN ('Completed', 'Delivered')
              AND category IS NOT NULL
              AND category != ''
            ORDER BY customer_id, order_date
        """)
        rows = cursor.fetchall()
    finally:
        conn.close()

    return rows, total_count


def _build_rules():
    """Run Apriori + association rules and cache to disk."""
    global _LAST_JOB_COUNT

    from mlxtend.frequent_patterns import apriori, association_rules
    from mlxtend.preprocessing import TransactionEncoder

    rows, total_count = _load_baskets()
    _LAST_JOB_COUNT = total_count

    if not rows:
        return []

    # Group by (customer_id, order_date) → set of categories
    baskets = {}
    for r in rows:
        key = (r["customer_id"], str(r["order_date"]))
        baskets.setdefault(key, set()).add(r["category"].strip())

    # Convert to list of lists, filter single-item baskets
    transactions = [list(items) for items in baskets.values() if len(items) >= 2]

    if len(transactions) < 5:
        logger.info("Not enough multi-item baskets (%d) for Apriori", len(transactions))
        return []

    te = TransactionEncoder()
    te_array = te.fit(transactions).transform(transactions)
    df = pd.DataFrame(te_array, columns=te.columns_)

    # Apriori
    freq = apriori(df, min_support=0.05, use_colnames=True)
    if freq.empty:
        return []

    # Association rules
    rules = association_rules(freq, metric="confidence", min_threshold=0.45)
    rules = rules[rules["lift"] > 1.1]

    if rules.empty:
        return []

    # Serialize
    result = []
    for _, row in rules.iterrows():
        result.append({
            "antecedents": sorted(row["antecedents"]),
            "consequents": sorted(row["consequents"]),
            "confidence": round(float(row["confidence"]), 4),
            "support": round(float(row["support"]), 4),
            "lift": round(float(row["lift"]), 4),
        })

    result.sort(key=lambda r: r["confidence"], reverse=True)

    # Persist
    with open(RULES_PATH, "w") as f:
        json.dump({"rules": result, "job_count": total_count,
                    "generated_at": datetime.utcnow().isoformat() + "Z"}, f)

    return result


def _get_rules():
    """Return rules from cache or regenerate if stale."""
    global _LAST_JOB_COUNT

    # Try loading cached rules
    if RULES_PATH.exists():
        try:
            with open(RULES_PATH) as f:
                data = json.load(f)
            cached_count = data.get("job_count", 0)

            # Quick check current count
            from db import get_connection
            conn = get_connection()
            try:
                cur = conn.cursor()
                cur.execute(
                    "SELECT COUNT(*) FROM sarga_jobs WHERE status IN ('Completed','Delivered')"
                )
                current_count = cur.fetchone()[0]
            finally:
                conn.close()

            # Regenerate only if > 100 new jobs
            if current_count - cached_count <= 100:
                _LAST_JOB_COUNT = cached_count
                return data["rules"]
        except Exception as exc:
            logger.warning("Failed to read cached rules: %s", exc)

    return _build_rules()


# ── Main route ────────────────────────────────────────────────────────────────

@bp.route("/upsell-suggestions", methods=["POST"])
def upsell_suggestions():
    try:
        body = request.get_json(silent=True) or {}
        current_services = body.get("current_services", [])

        if not current_services or not isinstance(current_services, list):
            return jsonify({"suggestions": []})

        current_set = set(s.strip() for s in current_services if isinstance(s, str))
        if not current_set:
            return jsonify({"suggestions": []})

        rules = _get_rules()
        if not rules:
            return jsonify({"suggestions": []})

        # Filter: antecedents ⊆ current_services
        matches = []
        for rule in rules:
            ante = set(rule["antecedents"])
            cons = set(rule["consequents"])
            if ante.issubset(current_set) and not cons.issubset(current_set):
                # Only suggest items not already selected
                new_items = cons - current_set
                for item in new_items:
                    pct = round(rule["confidence"] * 100)
                    matches.append({
                        "service": item,
                        "confidence_percent": pct,
                        "message": (
                            f"{pct}% of customers who ordered "
                            f"{', '.join(sorted(ante))} also added {item}"
                        ),
                    })

        # Deduplicate by service name, keep highest confidence
        seen = {}
        for m in matches:
            if m["service"] not in seen or m["confidence_percent"] > seen[m["service"]]["confidence_percent"]:
                seen[m["service"]] = m

        # Top 3 sorted by confidence
        top = sorted(seen.values(), key=lambda x: x["confidence_percent"], reverse=True)[:3]

        return jsonify({"suggestions": top})

    except Exception as exc:
        logger.exception("upsell-suggestions failed")
        return jsonify({"suggestions": [], "error": str(exc)}), 200
