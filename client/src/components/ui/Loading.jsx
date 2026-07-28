import React from 'react';
import { Loader2 } from 'lucide-react';
import './Loading.css';

const Loading = ({ type = 'spinner', count, text, columns, style }) => {
  if (type === 'spinner') {
    return (
      <div className="loading-spinner-wrap" style={style}>
        <div className="loading-spinner-ring">
          <Loader2 size={24} className="loading-spinner-icon" />
        </div>
        {text && <p className="loading-spinner-text">{text}</p>}
      </div>
    );
  }

  if (type === 'inline') {
    return (
      <span className="loading-inline" style={style}>
        <Loader2 size={14} className="loading-spin-anim" />
        {text && <span className="loading-inline-text">{text}</span>}
      </span>
    );
  }

  if (type === 'page') {
    return (
      <div className="loading-page" style={style}>
        <div className="loading-page-header">
          <div className="loading-shimmer loading-shimmer--title" />
          <div className="loading-shimmer loading-shimmer--subtitle" />
        </div>
        <div className="loading-page-cards">
          {Array.from({ length: count || 4 }).map((_, i) => (
            <div key={i} className="loading-shimmer loading-shimmer--card" />
          ))}
        </div>
        <div className="loading-page-table">
          <div className="loading-shimmer loading-shimmer--table-header" />
          {Array.from({ length: count || 5 }).map((_, i) => (
            <div key={i} className="loading-shimmer loading-shimmer--table-row" />
          ))}
        </div>
      </div>
    );
  }

  if (type === 'table') {
    return (
      <div className="loading-table" style={style}>
        <div className="loading-shimmer loading-shimmer--table-header" />
        {Array.from({ length: count || 5 }).map((_, i) => (
          <div key={i} className="loading-shimmer loading-shimmer--table-row" />
        ))}
      </div>
    );
  }

  if (type === 'cards') {
    const gridCols = columns || 4;
    return (
      <div className="loading-cards-grid" style={{ ...style, '--loading-cols': gridCols }}>
        {Array.from({ length: count || gridCols }).map((_, i) => (
          <div key={i} className="loading-shimmer loading-shimmer--card" />
        ))}
      </div>
    );
  }

  if (type === 'profile') {
    return (
      <div className="loading-profile" style={style}>
        <div className="loading-profile-left">
          <div className="loading-shimmer loading-shimmer--avatar-lg" />
          <div className="loading-profile-lines">
            <div className="loading-shimmer loading-shimmer--title" />
            <div className="loading-shimmer loading-shimmer--subtitle" style={{ width: '60%' }} />
          </div>
        </div>
        <div className="loading-profile-stats">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="loading-shimmer loading-shimmer--stat" />
          ))}
        </div>
      </div>
    );
  }

  if (type === 'ledger') {
    return (
      <div className="loading-ledger" style={style}>
        <div className="loading-ledger-cards">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="loading-shimmer loading-shimmer--stat" />
          ))}
        </div>
        <div className="loading-ledger-filters">
          <div className="loading-shimmer" style={{ width: 160, height: 34, borderRadius: 8 }} />
          <div className="loading-shimmer" style={{ width: 160, height: 34, borderRadius: 8 }} />
          <div className="loading-shimmer" style={{ width: 80, height: 34, borderRadius: 8 }} />
        </div>
        <div className="loading-shimmer loading-shimmer--table-header" />
        {Array.from({ length: count || 6 }).map((_, i) => (
          <div key={i} className="loading-shimmer loading-shimmer--table-row" />
        ))}
      </div>
    );
  }

  return (
    <div className="loading-spinner-wrap" style={style}>
      <div className="loading-spinner-ring">
        <Loader2 size={24} className="loading-spinner-icon" />
      </div>
    </div>
  );
};

export default Loading;
