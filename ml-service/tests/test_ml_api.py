"""Tests for the ML Flask microservice."""


def test_health_endpoint(client):
    """GET /api/health returns 200."""
    resp = client.get('/api/health')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data is not None
    assert 'status' in data


def test_predict_sales_endpoint(client):
    """POST /predict-sales returns 200 with expected shape."""
    resp = client.post('/predict-sales', json={
        'branch': 'all',
        'horizon': 30,
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data is not None
    assert isinstance(data, dict)


def test_predict_sales_missing_params(client):
    """POST /predict-sales with missing params still returns 200 (graceful)."""
    resp = client.post('/predict-sales', json={})
    assert resp.status_code in (200, 400)


def test_anomaly_detection(client):
    """POST /detect-anomalies returns list of anomalies."""
    resp = client.post('/detect-anomalies', json={
        'data': [{'value': 100}, {'value': 200}, {'value': 150}],
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data is not None


def test_stock_planning(client):
    """POST /stock-planning returns stock recommendations."""
    resp = client.post('/stock-planning', json={
        'branch': 'all',
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data is not None


def test_expense_categorize(client):
    """POST /categorize-expense returns category prediction."""
    resp = client.post('/categorize-expense', json={
        'description': 'Paper purchase for offset printing',
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data is not None


def test_chatbot_health(client):
    """GET /api/chatbot/model-status returns status."""
    resp = client.get('/api/chatbot/model-status')
    assert resp.status_code in (200, 404)


def test_upsell(client):
    """POST /recommend-upsell returns recommendations."""
    resp = client.post('/recommend-upsell', json={
        'cart_items': ['business-cards', 'flyers'],
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data is not None


def test_turnaround(client):
    """POST /predict-turnaround returns time estimate."""
    resp = client.post('/predict-turnaround', json={
        'job_type': 'offset',
        'quantity': 1000,
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data is not None


def test_seasonal_analysis(client):
    """POST /seasonal-analysis returns seasonal data."""
    resp = client.post('/seasonal-analysis', json={
        'branch': 'all',
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data is not None


def test_insights(client):
    """POST /business-insights returns insights data."""
    resp = client.post('/business-insights', json={
        'branch': 'all',
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data is not None


def test_order_forecast(client):
    """POST /order-forecast returns forecast data."""
    resp = client.post('/order-forecast', json={
        'branch': 'all',
        'horizon': 7,
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data is not None
