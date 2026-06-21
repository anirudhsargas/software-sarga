"""
Tests for ML microservice prediction endpoints.

These tests validate input/output contracts against a local instance.
They are skipped by default (see conftest.py) because the ML service
is not deployed to production separately.
"""

import os
import pytest
import requests


@pytest.mark.skip_if_ml_down
def test_health_endpoint(ml_base_url):
    """Health endpoint returns expected status."""
    resp = requests.get(f"{ml_base_url}/health", timeout=5)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["service"] == "sarga-ml"


@pytest.mark.skip_if_ml_down
def test_sales_prediction_endpoint_contract(ml_base_url, sample_prediction_input):
    """Sales prediction accepts input and returns expected output schema."""
    resp = requests.post(f"{ml_base_url}/predict-sales", json=sample_prediction_input, timeout=10)
    assert resp.status_code == 200
    data = resp.json()
    # Output must be a dict with at least a 'predictions' or 'data' key
    assert isinstance(data, dict)
    has_predictions = "predictions" in data or "data" in data or "forecast" in data
    assert has_predictions, f"Response keys: {list(data.keys())}"


@pytest.mark.skip_if_ml_down
def test_stock_planning_endpoint_contract(ml_base_url, sample_stock_input):
    """Stock planning accepts input and returns expected output schema."""
    resp = requests.post(f"{ml_base_url}/stock-planning", json=sample_stock_input, timeout=10)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)
    # Should contain stock_status or purchase_list or similar keys
    has_stock_keys = any(k in data for k in ("stock_status", "purchase_list", "recommendations", "alerts"))
    assert has_stock_keys, f"Response keys: {list(data.keys())}"


@pytest.mark.skip_if_ml_down
def test_turnaround_prediction_contract(ml_base_url):
    """Turnaround time prediction returns expected output schema."""
    sample = {
        "job_type": "Offset Printing",
        "quantity": 500,
        "complexity": "medium",
        "features": {"has_design": 1, "has_proof": 1, "machine_type": "Heidelberg"},
    }
    resp = requests.post(f"{ml_base_url}/predict-turnaround", json=sample, timeout=10)
    assert resp.status_code == 200
    data = resp.json()
    # Output should contain a predicted turnaround time (in hours or days)
    has_turnaround = any(k in data for k in ("turnaround_hours", "turnaround_days", "predicted_time", "estimated_hours"))
    assert has_turnaround, f"Response keys: {list(data.keys())}"


@pytest.mark.skip_if_ml_down
def test_expense_categorizer_contract(ml_base_url):
    """Expense categorizer accepts description and returns category."""
    sample = {"description": "Purchased offset ink for Heidelberg press"}
    resp = requests.post(f"{ml_base_url}/categorize-expense", json=sample, timeout=10)
    assert resp.status_code == 200
    data = resp.json()
    should_have = any(k in data for k in ("category", "predicted_category", "label"))
    assert should_have, f"Response keys: {list(data.keys())}"


@pytest.mark.skip_if_ml_down
def test_fraud_detection_contract(ml_base_url):
    """Fraud monitoring returns expected output schema."""
    sample = {"transaction": {"amount": 15000, "type": "payment", "frequency": 3, "hour": 14}}
    resp = requests.post(f"{ml_base_url}/detect-anomaly", json=sample, timeout=10)
    assert resp.status_code == 200
    data = resp.json()
    has_anomaly = any(k in data for k in ("is_anomaly", "anomaly_score", "fraud_probability", "alert"))
    assert has_anomaly, f"Response keys: {list(data.keys())}"


@pytest.mark.skip_if_ml_down
def test_upsell_suggestions_contract(ml_base_url):
    """Upsell suggestions return expected output schema."""
    sample = {"items": ["Business Cards", "Flyers"], "customer_id": 42}
    resp = requests.post(f"{ml_base_url}/upsell-suggestions", json=sample, timeout=10)
    assert resp.status_code == 200
    data = resp.json()
    has_suggestions = any(k in data for k in ("suggestions", "upsell_items", "recommendations", "items"))
    assert has_suggestions, f"Response keys: {list(data.keys())}"


@pytest.mark.skip_if_ml_down
def test_chatbot_endpoint_contract(ml_base_url):
    """Chatbot endpoint returns reply."""
    sample = {"message": "What services do you offer?", "uuid": "test-uuid-123"}
    resp = requests.post(f"{ml_base_url}/chat", json=sample, timeout=10)
    assert resp.status_code == 200
    data = resp.json()
    assert "reply" in data or "response" in data or "answer" in data, f"Response keys: {list(data.keys())}"


def test_prediction_input_validation(ml_base_url, sample_prediction_input):
    """Test that missing required fields returns appropriate error."""
    resp = requests.post(f"{ml_base_url}/predict-sales", json={}, timeout=5)
    # Should return 400 or 422 for invalid input
    assert resp.status_code in (400, 422), f"Expected 400/422, got {resp.status_code}"
