"""
Sarga Prints — AI Business Insights Generator
POST /generate-insights → GPT-4o-mini or rule-based fallback

Accepts aggregated KPI data, returns 3–5 plain-English insight sentences.
"""

import os
import logging
from datetime import datetime

from flask import Blueprint, request, jsonify

bp = Blueprint("insights", __name__)

logger = logging.getLogger(__name__)

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")


# ── GPT path ──────────────────────────────────────────────────────────────────

def _generate_gpt_insights(data):
    """Call OpenAI GPT-4o-mini for business insights."""
    import openai

    client = openai.OpenAI(api_key=OPENAI_API_KEY)

    branch_info = data.get("branch_comparison", {})
    perambra = branch_info.get("perambra", {})
    meppayur = branch_info.get("meppayur", {})

    prompt = f"""You are a business analyst for Sarga Prints, a printing shop with two branches: Perambra and Meppayur.

Given the following KPIs, generate 3–5 concise, actionable business insight sentences.
Each sentence should be specific with numbers and branch names.
Do NOT use bullet points or numbering — just plain sentences, one per line.

KPIs:
- 7-day revenue: ₹{data.get('revenue_7day', 0):,.0f}
- 30-day revenue: ₹{data.get('revenue_30day', 0):,.0f}
- Top performing service: {data.get('top_service', 'N/A')}
- Slowest service: {data.get('slow_service', 'N/A')}
- Average job value: ₹{data.get('avg_job_value', 0):,.0f}
- Perambra branch — 7-day revenue: ₹{perambra.get('revenue_7day', 0):,.0f}, jobs: {perambra.get('job_count', 0)}, avg job: ₹{perambra.get('avg_job_value', 0):,.0f}
- Meppayur branch — 7-day revenue: ₹{meppayur.get('revenue_7day', 0):,.0f}, jobs: {meppayur.get('job_count', 0)}, avg job: ₹{meppayur.get('avg_job_value', 0):,.0f}
- Anomalies detected today: {data.get('anomaly_count', 0)}
- Forecast revenue next 7 days: ₹{data.get('forecast_next_7days', 0):,.0f}
- Staff attendance rate: {data.get('attendance_rate', 0):.0f}%

Examples of good insights:
"Perambra branch is up 18% this week, driven by digital printing jobs."
"Meppayur offset volume is slower — consider follow-up with bulk customers."
"Average job value increased to ₹1,200 — upselling efforts are paying off."
"""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a concise business analyst. Reply with 3-5 plain insight sentences, one per line. No bullets, no numbering."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.7,
        max_tokens=400,
    )

    text = response.choices[0].message.content.strip()
    # Split into individual sentences (one per line)
    insights = [s.strip() for s in text.split("\n") if s.strip()]
    return insights[:5]


# ── Rule-based fallback ───────────────────────────────────────────────────────

def _generate_rule_insights(data):
    """Compare this week vs last week for each metric. Flag changes > 15%."""
    insights = []

    branch_comparison = data.get("branch_comparison", {})

    # Revenue trend
    rev_7 = data.get("revenue_7day", 0)
    rev_30 = data.get("revenue_30day", 0)
    weekly_avg = rev_30 / 4 if rev_30 > 0 else 0

    if weekly_avg > 0:
        pct = ((rev_7 - weekly_avg) / weekly_avg) * 100
        if pct > 15:
            insights.append(f"Overall revenue is up {pct:.0f}% compared to the monthly weekly average.")
        elif pct < -15:
            insights.append(f"Overall revenue is down {abs(pct):.0f}% compared to the monthly weekly average — check for anomalies.")

    # Branch-level comparison
    for name, branch_data in branch_comparison.items():
        b_rev_7 = branch_data.get("revenue_7day", 0)
        b_rev_30 = branch_data.get("revenue_30day", 0)
        b_weekly_avg = b_rev_30 / 4 if b_rev_30 > 0 else 0
        if b_weekly_avg > 0:
            pct = ((b_rev_7 - b_weekly_avg) / b_weekly_avg) * 100
            branch_label = name.title()
            if pct > 15:
                insights.append(f"{branch_label} revenue is up {pct:.0f}% compared to last week.")
            elif pct < -15:
                insights.append(f"{branch_label} revenue is down {abs(pct):.0f}% — check for anomalies.")

    # Top service
    top_svc = data.get("top_service")
    if top_svc:
        insights.append(f"{top_svc} is your best-performing service this week.")

    # Slow service
    slow_svc = data.get("slow_service")
    if slow_svc and slow_svc != top_svc:
        insights.append(f"{slow_svc} has low demand — consider promotions or follow-up with regular customers.")

    # Average job value
    avg_val = data.get("avg_job_value", 0)
    if avg_val > 0:
        insights.append(f"Average job value is ₹{avg_val:,.0f} this week.")

    # Anomalies
    anomaly_count = data.get("anomaly_count", 0)
    if anomaly_count > 3:
        insights.append(f"{anomaly_count} anomalies detected today — review the anomaly panel for details.")

    # Attendance
    att_rate = data.get("attendance_rate", 0)
    if att_rate > 0 and att_rate < 80:
        insights.append(f"Staff attendance is at {att_rate:.0f}% — this may impact productivity.")

    # Forecast
    forecast_7 = data.get("forecast_next_7days", 0)
    if forecast_7 > 0:
        insights.append(f"Predicted revenue for the next 7 days is ₹{forecast_7:,.0f}.")

    return insights[:5] if insights else ["Business metrics are within normal ranges this week."]


# ── Flask endpoint ────────────────────────────────────────────────────────────

@bp.route("/generate-insights", methods=["POST"])
def generate_insights():
    try:
        data = request.get_json(force=True) or {}

        source = "rules"
        insights = []

        if OPENAI_API_KEY:
            try:
                insights = _generate_gpt_insights(data)
                source = "gpt"
            except Exception as e:
                logger.warning("GPT call failed, falling back to rules: %s", e)
                insights = _generate_rule_insights(data)
        else:
            insights = _generate_rule_insights(data)

        return jsonify({
            "insights": insights,
            "generated_at": datetime.now().isoformat(),
            "source": source,
        })

    except Exception as e:
        logger.exception("Error in generate-insights")
        return jsonify({
            "insights": ["Unable to generate insights at this time."],
            "generated_at": datetime.now().isoformat(),
            "source": "error",
            "error": str(e),
        }), 200  # never 500 to caller
