"""
Pytest configuration for ML microservice tests.

These tests are gated behind the SKIP_ML_TESTS env variable (default: true)
since the ML service is not deployed to production yet.
"""

import os
import pytest


def pytest_configure(config):
    """Skip all ML tests unless explicitly enabled."""
    if os.environ.get("SKIP_ML_TESTS", "true").lower() in ("true", "1", "yes"):
        config.option.markexpr = "not skip_if_ml_down"
    # Register custom markers
    config.addinivalue_line("markers", "skip_if_ml_down: skip test when ML service is unavailable")


@pytest.fixture
def ml_base_url():
    """Return the local ML service URL for testing."""
    return os.environ.get("ML_SERVICE_URL", "http://127.0.0.1:5001")


@pytest.fixture
def sample_prediction_input():
    """Standard input shape expected by the prediction endpoints."""
    return {
        "branch": "all",
        "horizon": 30,
        "features": {
            "month": 6,
            "year": 2025,
            "day_of_week": 2,
            "is_weekend": 0,
            "is_holiday": 0,
            "quarter": 2,
            "promotion_active": 0,
        },
    }


@pytest.fixture
def sample_stock_input():
    """Input shape for stock planning endpoint."""
    return {
        "inventory": [
            {"id": 1, "name": "70gsm Offset Paper", "category": "Paper", "quantity": 50, "unit": "ream"},
            {"id": 2, "name": "Black Ink", "category": "Ink", "quantity": 10, "unit": "litre"},
        ],
        "consumption_rate": {"1": 2.5, "2": 0.8},
    }
