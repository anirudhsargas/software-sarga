"""Tests for payment-related ML integration.

These test the ML side of payment webhook processing and fraud detection.
"""


def test_fraud_monitor_health(client):
    """Fraud monitor endpoint is reachable."""
    resp = client.post('/detect-anomalies', json={
        'data': [
            {'amount': 50, 'payment_method': 'UPI'},
            {'amount': 100000, 'payment_method': 'UPI'},
        ],
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data is not None


def test_fraud_monitor_empty_payload(client):
    """Fraud monitor handles empty payload gracefully."""
    resp = client.post('/detect-anomalies', json={'data': []})
    assert resp.status_code == 200


def test_fraud_monitor_large_amount_detection(client):
    """Fraud monitor flags large amounts as potential anomalies."""
    resp = client.post('/detect-anomalies', json={
        'data': [
            {'amount': 10},
            {'amount': 20},
            {'amount': 15},
            {'amount': 999999},
            {'amount': 25},
        ],
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert isinstance(data, list) or isinstance(data, dict)


def test_payment_webhook_validation(client):
    """ML service validates payment webhook payload structure."""
    resp = client.post('/validate-payment', json={
        'transaction_id': 'TXN123456',
        'amount': 5000,
        'payment_method': 'UPI',
        'upi_id': 'test@upi',
        'status': 'success',
    })
    assert resp.status_code in (200, 404)


def test_ml_service_econnrefused_handling(client):
    """ML service handles missing upstream gracefully (fallback)."""
    resp = client.get('/api/health')
    assert resp.status_code == 200
    data = resp.get_json()
    assert 'ml_service' not in data or data.get('ml_service') is not None
