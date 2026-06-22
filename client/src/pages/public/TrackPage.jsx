import { useState } from 'react';
import SEOProvider from '../../seo/SEOProvider';
import { Search, Package, Clock, CheckCircle, AlertCircle } from 'lucide-react';

const MOCK_ORDERS = {
  'SARGA-001': { status: 'In Production', updated: '2 hours ago', items: '500 Business Cards' },
  'SARGA-002': { status: 'Quality Check', updated: '5 hours ago', items: '2000 Brochures' },
  'SARGA-003': { status: 'Dispatched', updated: '1 day ago', items: '100 Packaging Boxes' },
};

const statusIcon = (status) => {
  if (status === 'Dispatched') return <CheckCircle size={16} />;
  if (status === 'Quality Check') return <Clock size={16} />;
  return <Package size={16} />;
};

export default function TrackPage() {
  const [orderId, setOrderId] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleTrack = (e) => {
    e.preventDefault();
    const id = orderId.trim().toUpperCase();
    if (!id) {
      setError('Please enter an order ID.');
      setResult(null);
      return;
    }
    const order = MOCK_ORDERS[id];
    if (order) {
      setResult({ id, ...order });
      setError('');
    } else {
      setResult(null);
      setError('Order not found. Please check your order ID and try again.');
    }
  };

  return (
    <SEOProvider routeKey="/track">
      <section className="page-hero">
        <div className="page-hero__inner">
          <h1>Track Your Order</h1>
          <p>Enter your order ID to check the current status of your printing project.</p>
        </div>
      </section>

      <section className="track-section">
        <div className="track-form-wrapper">
          <form onSubmit={handleTrack} className="track-form" role="search">
            <label htmlFor="track-input" className="sr-only">
              Order ID
            </label>
            <div className="track-input-group">
              <Search size={18} className="track-input-icon" />
              <input
                id="track-input"
                type="text"
                className="input-field"
                placeholder="Enter Order ID (e.g. SARGA-001)"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                autoComplete="off"
              />
              <button type="submit" className="btn btn--primary">
                Track
              </button>
            </div>
          </form>

          {error && (
            <div className="track-error" role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className="track-result" role="status">
              <div className="track-result__header">
                <span className="track-result__id">{result.id}</span>
                <span className="track-result__status">
                  {statusIcon(result.status)} {result.status}
                </span>
              </div>
              <div className="track-result__details">
                <p><strong>Items:</strong> {result.items}</p>
                <p><strong>Last Updated:</strong> {result.updated}</p>
              </div>
            </div>
          )}
        </div>
      </section>
    </SEOProvider>
  );
}
