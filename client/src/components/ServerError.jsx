import React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import './ServerError.css';

const ServerError = ({ 
  onRetry, 
  lastUpdated = null,
  message = 'Server is currently unavailable'
}) => {
  const formatTime = (timestamp) => {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-IN', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="server-error">
      <div className="server-error__banner">
        <div className="server-error__icon">
          <AlertTriangle size={24} />
        </div>
        <div className="server-error__content">
          <h2 className="server-error__title">{message}</h2>
          <p className="server-error__description">
            We're having trouble connecting to the server. Your data may not be up-to-date.
          </p>
          {lastUpdated && (
            <p className="server-error__timestamp">
              Last updated: {formatTime(lastUpdated)}
            </p>
          )}
        </div>
      </div>
      
      <button 
        onClick={onRetry}
        className="server-error__retry-btn"
        aria-label="Retry connection"
      >
        <RotateCw size={16} />
        <span>Try Again</span>
      </button>
    </div>
  );
};

export default ServerError;
