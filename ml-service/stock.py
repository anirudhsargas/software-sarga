"""
Sarga Prints — Stock Planning Endpoint
POST /stock-planning

Loads all materials and their usage history (last 90 days) from MySQL,
fits Linear Regression on daily usage to compute avg_daily_consumption,
and returns stock status + purchase recommendations.
"""

import os
import logging
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
from flask import Blueprint, request, jsonify
from sklearn.linear_model import LinearRegression

bp = Blueprint("stock", __name__)
logger = logging.getLogger(__name__)


def _load_inventory_and_usage():
    """Load all inventory items and their consumption over the last 90 days."""
    from db import get_connection, dict_cursor

    conn = get_connection()
    try:
        cursor = dict_cursor(conn)

        # All inventory items
        cursor.execute("""
            SELECT id, name, sku, category, unit, quantity,
                   reorder_level, cost_price, vendor_name
            FROM sarga_inventory
        """)
        items = cursor.fetchall()

        # Consumption history (last 90 days)
        cursor.execute("""
            SELECT inventory_item_id,
                   DATE(created_at) AS day,
                   SUM(quantity_consumed) AS total_consumed
            FROM sarga_inventory_consumption
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
            GROUP BY inventory_item_id, DATE(created_at)
            ORDER BY inventory_item_id, day
        """)
        consumption = cursor.fetchall()

        # Supplier lead times (if table exists)
        lead_times = {}
        try:
            cursor.execute("""
                SELECT id, lead_time_days FROM sarga_suppliers
            """)
            for row in cursor.fetchall():
                lead_times[row["id"]] = row.get("lead_time_days", 7) or 7
        except Exception:
            pass  # table may not exist yet

    finally:
        conn.close()

    return items, consumption, lead_times


def _compute_avg_daily_consumption(consumption_rows, num_days=90):
    """
    Fit Linear Regression on daily usage over time to estimate
    average daily consumption.
    """
    if not consumption_rows:
        return 0.0

    df = pd.DataFrame(consumption_rows)
    df["day"] = pd.to_datetime(df["day"])
    df["total_consumed"] = df["total_consumed"].astype(float)

    # Create a full date range and fill missing days with 0
    end = df["day"].max()
    start = end - timedelta(days=num_days - 1)
    full_range = pd.date_range(start=start, end=end, freq="D")
    df = df.set_index("day").reindex(full_range, fill_value=0.0).reset_index()
    df.columns = ["day", "total_consumed"]

    # X = day index (0, 1, 2, ...), y = consumption
    X = np.arange(len(df)).reshape(-1, 1)
    y = df["total_consumed"].values

    model = LinearRegression()
    model.fit(X, y)

    # Average daily consumption = mean of the fitted line
    predicted = model.predict(X)
    avg_daily = float(max(np.mean(predicted), 0.0))
    return avg_daily


@bp.route("/stock-planning", methods=["POST"])
def stock_planning():
    """
    Analyse inventory stock levels and generate purchase recommendations.
    """
    try:
        body = request.get_json(silent=True) or {}
        default_lead_time = body.get("default_lead_time", 7)

        items, consumption, lead_times = _load_inventory_and_usage()

        if not items:
            return jsonify({
                "stock_status": [],
                "purchase_list": [],
                "total_estimated_cost": 0.0,
                "generated_at": datetime.utcnow().isoformat() + "Z",
            })

        # Group consumption by item
        consumption_by_item = {}
        for row in consumption:
            iid = row["inventory_item_id"]
            consumption_by_item.setdefault(iid, []).append(row)

        stock_status = []
        purchase_list = []
        total_estimated_cost = 0.0

        for item in items:
            iid = item["id"]
            current_stock = float(item.get("quantity", 0) or 0)
            cost_per_unit = float(item.get("cost_price", 0) or 0)
            lead_time = lead_times.get(iid, default_lead_time)

            usage_rows = consumption_by_item.get(iid, [])
            avg_daily = _compute_avg_daily_consumption(usage_rows)

            if avg_daily > 0:
                days_to_stockout = current_stock / avg_daily
            else:
                days_to_stockout = 9999.0  # effectively infinite

            reorder_point = avg_daily * lead_time * 1.3

            # Determine status
            if days_to_stockout < 7:
                status = "critical"
            elif days_to_stockout < 14:
                status = "low"
            else:
                status = "ok"

            stock_status.append({
                "material_id": iid,
                "name": item["name"],
                "current_stock": current_stock,
                "unit": item.get("unit", "pcs"),
                "days_to_stockout": round(days_to_stockout, 1),
                "avg_daily_consumption": round(avg_daily, 2),
                "status": status,
            })

            # Purchase recommendation for flagged items
            if status in ("critical", "low"):
                suggested_qty = max(0.0, (30 * avg_daily) - current_stock)
                estimated_cost = suggested_qty * cost_per_unit
                total_estimated_cost += estimated_cost

                purchase_list.append({
                    "material_id": iid,
                    "name": item["name"],
                    "suggested_qty": round(suggested_qty, 1),
                    "unit": item.get("unit", "pcs"),
                    "estimated_cost": round(estimated_cost, 2),
                    "supplier_id": None,
                    "vendor_name": item.get("vendor_name"),
                    "urgency": "immediate" if status == "critical" else "this_week",
                })

        # Sort: critical first, then low, then ok
        priority = {"critical": 0, "low": 1, "ok": 2}
        stock_status.sort(key=lambda x: (priority.get(x["status"], 3), x["days_to_stockout"]))
        purchase_list.sort(key=lambda x: (0 if x["urgency"] == "immediate" else 1))

        return jsonify({
            "stock_status": stock_status,
            "purchase_list": purchase_list,
            "total_estimated_cost": round(total_estimated_cost, 2),
            "generated_at": datetime.utcnow().isoformat() + "Z",
        })

    except Exception as exc:
        logger.exception("stock-planning failed")
        return jsonify({"error": str(exc)}), 500
